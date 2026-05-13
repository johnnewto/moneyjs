import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import simNotebook from "../public/notebook-examples/sim.notebook.json";
import {
  listFixtures,
  loadFixture,
  runNotebookAssistantEval
} from "../evals/notebook-assistant/lib.mjs";
import {
  extractNotebookAssistantToolRequests,
  filterNotebookAssistantToolRequestsForMode
} from "../src/notebook/notebookAssistantFlow";
import { evaluateNotebookAssistantResponse } from "../src/notebook/notebookAssistantEval";

describe("notebook assistant eval harness", () => {
  it("lists the seed fixtures", async () => {
    await expect(listFixtures()).resolves.toEqual(
      expect.arrayContaining(["ask-list-runs", "edit-change-alpha1", "edit-add-chart", "edit-extend-runs", "edit-add-equation"])
    );
  });

  it("loads fixture metadata", async () => {
    const fixture = await loadFixture("edit-change-alpha1");

    expect(fixture.mode).toBe("edit");
    expect(fixture.expected.toolNames).toContain("createUpdateParameterPatch");
  });

  it("extracts and mode-filters assistant tool requests", () => {
    const extraction = extractNotebookAssistantToolRequests(
      '{ "notebookAssistantToolRequests": [{ "name": "listRuns", "args": {} }, { "name": "createUpdateParameterPatch", "args": { "modelId": "sim", "variable": "alpha1", "value": 0.65 } }] }'
    );

    expect(extraction.requests.map((request) => request.name)).toEqual(["listRuns", "createUpdateParameterPatch"]);
    expect(filterNotebookAssistantToolRequestsForMode("ask", extraction.requests).blocked.map((request) => request.name)).toEqual([
      "createUpdateParameterPatch"
    ]);
  });

  it("runs an ask-mode fixture without producing a patch", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "sfcr-notebook-assistant-ask-"));
    const result = await runNotebookAssistantEval({ fixtureId: "ask-list-runs", artifactDir });

    expect(result.summary.ok).toBe(true);
    expect(result.patch).toBeNull();
    expect(result.summary.tools.allowed.map((tool) => tool.name)).toEqual(["listRuns"]);
    expect(await fs.stat(path.join(artifactDir, "summary.json"))).toBeTruthy();
    expect(await fs.stat(path.join(artifactDir, "tool-results.json"))).toBeTruthy();
  });

  it("evaluates saved responses with the production notebook assistant modules", async () => {
    const fixture = await loadFixture("edit-change-alpha1");
    const rawResponse = await fs.readFile(path.resolve("evals/notebook-assistant", fixture.savedResponsePath), "utf8");
    const result = evaluateNotebookAssistantResponse({
      document: simNotebook,
      fixture,
      rawResponse
    });

    expect(result.summary.ok).toBe(true);
    expect(result.summary.tools.allowed.map((tool) => tool.name)).toEqual(["createUpdateParameterPatch"]);
    expect(result.patch?.operations[0].path).toBe("/cells/by-id/externals/externals/2/valueText");
    expect(result.preview?.ok).toBe(true);
    expect(result.preview?.summary).toEqual({ addedCells: 0, changedCells: 1, operationCount: 1, removedCells: 0 });
  });

  it("runs an edit fixture and validates the previewed patch", async () => {
    const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), "sfcr-notebook-assistant-edit-"));
    const progressEvents = [];
    const result = await runNotebookAssistantEval({
      artifactDir,
      fixtureId: "edit-change-alpha1",
      onProgress(stage, message) {
        progressEvents.push({ stage, message });
        console.info(`[notebook-assistant-eval:${stage}] ${message}`);
      }
    });

    expect(result.summary.ok).toBe(true);
    expect(result.patch.operations).toHaveLength(1);
    expect(result.preview.ok).toBe(true);
    expect(result.preview.summary).toEqual({ addedCells: 0, changedCells: 1, operationCount: 1, removedCells: 0 });
    expect(progressEvents.map((event) => event.stage)).toEqual([
      "start",
      "fixture",
      "snapshot",
      "response",
      "tools",
      "patch",
      "validation",
      "scoring",
      "artifacts"
    ]);
  });
});
