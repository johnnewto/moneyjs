import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeNotebookSource } from "../src/notebook/document";
import type { NotebookDocument } from "../src/notebook/types";

describe("notebook run periods", () => {
  it("reports a schema error when a run cell omits periods", () => {
    const source = JSON.stringify({
      id: "example",
      title: "Example",
      metadata: { version: 1 },
      cells: [
        {
          id: "run",
          type: "run",
          title: "Baseline run",
          mode: "baseline",
          resultKey: "baseline",
          sourceModelId: "main"
        }
      ]
    });

    const analysis = analyzeNotebookSource(source, "json");
    const messages = analysis.schemaDiagnostics.map((diagnostic) => diagnostic.message);

    expect(analysis.document).toBeNull();
    expect(messages).toContainEqual(expect.stringContaining("missing required property 'periods'"));
  });

  it("keeps run periods on run cells rather than solver cells in public examples", () => {
    for (const { name, document } of loadPublicNotebookExamples()) {
      const runCells = document.cells.filter((cell) => cell.type === "run");
      const solverCells = document.cells.filter((cell) => cell.type === "solver");
      const exampleName = `example:${name}`;

      expect(runCells.length, `${exampleName} should include at least one run cell`).toBeGreaterThan(0);
      for (const cell of runCells) {
        expect(Number.isInteger(cell.periods), `${exampleName}:${cell.title} should define integer periods`).toBe(true);
        expect(cell.periods, `${exampleName}:${cell.title} should define positive periods`).toBeGreaterThanOrEqual(1);
      }
      for (const cell of solverCells) {
        expect(cell.options.periods, `${exampleName}:${cell.title} should not define solver periods`).toBeUndefined();
      }
    }
  });
});

function loadPublicNotebookExamples(): Array<{ document: NotebookDocument; name: string }> {
  const examplesDir = path.resolve(process.cwd(), "public/notebook-examples");
  return fs
    .readdirSync(examplesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      document: JSON.parse(fs.readFileSync(path.join(examplesDir, name), "utf8")) as NotebookDocument
    }));
}
