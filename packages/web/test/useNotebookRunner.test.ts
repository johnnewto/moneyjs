import { describe, expect, it } from "vitest";

import { buildNotebookRunnerResetKey } from "../src/notebook/useNotebookRunner";
import type { NotebookDocument } from "../src/notebook/types";

const baseDocument: NotebookDocument = {
  id: "test-doc",
  title: "Test Notebook",
  metadata: { version: 1, template: "bmw" },
  cells: [
    {
      id: "intro",
      type: "markdown",
      title: "Overview",
      source: "Overview text"
    },
    {
      id: "equations-main",
      type: "equations",
      title: "Equations",
      modelId: "main",
      equations: [{ id: "eq-1", name: "C", expression: "YD", description: "" }]
    },
    {
      id: "solver-main",
      type: "solver",
      title: "Solver",
      modelId: "main",
      options: {
        periods: 10,
        solverMethod: "NEWTON",
        toleranceText: "1e-15",
        maxIterations: 200,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "0.00001",
        relativeHiddenTolerance: false
      }
    },
    {
      id: "baseline-run",
      type: "run",
      title: "Baseline run",
      sourceModelId: "main",
      mode: "baseline",
      resultKey: "baseline"
    },
    {
      id: "baseline-chart",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "baseline-run",
      variables: ["C"]
    }
  ]
};

describe("buildNotebookRunnerResetKey", () => {
  it("ignores UI-only cell changes such as collapsed and title edits", () => {
    const before = buildNotebookRunnerResetKey(baseDocument);
    const after = buildNotebookRunnerResetKey({
      ...baseDocument,
      title: "Renamed Notebook",
      cells: baseDocument.cells.map((cell) =>
        cell.id === "baseline-run"
          ? { ...cell, title: "Renamed run", collapsed: true }
          : cell.id === "intro"
            ? { ...cell, title: "Renamed overview", collapsed: true }
            : cell
      )
    });

    expect(after).toBe(before);
  });

  it("changes when runtime-affecting run settings change", () => {
    const before = buildNotebookRunnerResetKey(baseDocument);
    const after = buildNotebookRunnerResetKey({
      ...baseDocument,
      cells: baseDocument.cells.map((cell) =>
        cell.id === "baseline-run" ? { ...cell, periods: 25 } : cell
      )
    });

    expect(after).not.toBe(before);
  });

  it("changes when model equations change", () => {
    const before = buildNotebookRunnerResetKey(baseDocument);
    const after = buildNotebookRunnerResetKey({
      ...baseDocument,
      cells: baseDocument.cells.map((cell) =>
        cell.id === "equations-main"
          ? {
              ...cell,
              equations: [{ id: "eq-1", name: "C", expression: "YD - T", description: "" }]
            }
          : cell
      )
    });

    expect(after).not.toBe(before);
  });
});
