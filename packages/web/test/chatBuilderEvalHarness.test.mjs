import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSemanticNotebookIndex,
  loadFixture,
  parseDraftResponse,
  rankExamples,
  runChatBuilderEval,
  validateNotebookDraft,
  webRoot
} from "../evals/chat-builder/lib.mjs";

const schema = JSON.parse(await fs.readFile(path.resolve(webRoot, "public/sfcr-notebook.schema.json"), "utf8"));
const simNotebook = JSON.parse(await fs.readFile(path.resolve(webRoot, "public/notebook-examples/sim.notebook.json"), "utf8"));
const bmwNotebook = JSON.parse(await fs.readFile(path.resolve(webRoot, "public/notebook-examples/bmw.notebook.json"), "utf8"));

const fixture = await loadFixture("sim-basic");

describe("chat-builder eval harness", () => {
  it("builds a semantic index for the SIM notebook", () => {
    const index = buildSemanticNotebookIndex(simNotebook);

    expect(index.title).toContain("SIM");
    expect(index.featureTags).toContain("baseline");
    expect(index.featureTags).toContain("scenario");
    expect(index.models[0].variables).toEqual(
      expect.arrayContaining(["TXs", "YD", "Cd", "Hh", "Ns", "Nd", "Cs", "Gs", "Y", "TXd", "Hs"])
    );
    expect(index.models[0].equations.find((equation) => equation.name === "Cd").lagDependencies).toContain("Hh");
  });

  it("validates the saved SIM response against schema and fixture expectations", () => {
    const validation = validateNotebookDraft({ document: simNotebook, expected: fixture.expected, schema });

    expect(validation.ok).toBe(true);
    expect(validation.diagnostics).toEqual([]);
  });

  it("ranks the SIM example first for the SIM fixture", () => {
    const retrieval = rankExamples({
      examples: [
        { id: "bmw", label: "BMW notebook", url: "bmw", focus: ["sectors"], document: bmwNotebook },
        { id: "sim", label: "SIM notebook", url: "sim", focus: ["baseline", "scenario"], document: simNotebook }
      ],
      fixture,
      prompt: fixture.prompt
    });

    expect(retrieval.selectedExamples[0].id).toBe("sim");
  });

  it("runs the offline eval and writes artifacts", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "sfcr-chat-builder-eval-"));
    const progressEvents = [];
    const result = await runChatBuilderEval({
      fixtureId: "sim-basic",
      artifactDir,
      onProgress(stage, message) {
        progressEvents.push({ stage, message });
        console.info(`[chat-builder-eval:${stage}] ${message}`);
      }
    });

    expect(result.summary.ok).toBe(true);
    expect(result.summary.request.mode).toBe("offline");
    expect(result.summary.request.promptPreview).toContain("SIM model");
    expect(result.summary.response.parsed).toBe(true);
    expect(result.summary.response.cellCount).toBe(16);
    expect(progressEvents.map((event) => event.stage)).toEqual([
      "start",
      "fixture",
      "resources",
      "retrieval",
      "request",
      "response",
      "parse",
      "validation",
      "artifacts"
    ]);
    expect(await fs.stat(path.join(artifactDir, "summary.json"))).toBeTruthy();
    expect(await fs.stat(path.join(artifactDir, "retrieval.json"))).toBeTruthy();
  });

  it("reports OpenAI SSE failures as live response failures", () => {
    const draft = parseDraftResponse(`event: error
data: {"type":"error","error":{"type":"insufficient_quota","code":"insufficient_quota","message":"You exceeded your current quota."}}

event: response.failed
data: {"type":"response.failed","response":{"error":{"code":"insufficient_quota","message":"You exceeded your current quota."}}}`);

    expect(draft.ok).toBe(false);
    expect(draft.error).toContain("Live response failed (insufficient_quota)");
    expect(draft.error).toContain("You exceeded your current quota.");
  });
});
