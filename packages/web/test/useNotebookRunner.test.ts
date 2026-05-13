import { describe, expect, it } from "vitest";

import type { SimulationResult } from "@sfcr/core";

import {
  buildNotebookRunnerResetKey,
  buildRunHistorySignatures,
  resolveRunCellOptions,
  resolvePreviousRunResult
} from "../src/notebook/useNotebookRunner";
import type { NotebookDocument, RunCell } from "../src/notebook/types";

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
      equations: [{ id: "eq-1", name: "C", expression: "YD", desc: "" }]
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
      periods: 10,
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

const testResult: SimulationResult = {
  blocks: [],
  model: {
    equations: [{ name: "C", expression: "YD" }],
    externals: {},
    initialValues: {}
  },
  options: {
    periods: 2,
    solverMethod: "NEWTON",
    tolerance: 1e-15,
    maxIterations: 200,
    defaultInitialValue: 1e-15
  },
  series: {
    C: new Float64Array([1, 2])
  }
};

const previousTestResult: SimulationResult = {
  ...testResult,
  series: {
    C: new Float64Array([3, 4])
  }
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
              equations: [{ id: "eq-1", name: "C", expression: "YD - T", desc: "" }]
            }
          : cell
      )
    });

    expect(after).not.toBe(before);
  });
});

describe("resolvePreviousRunResult", () => {
  it("preserves the existing previous result during normal reruns", () => {
    expect(
      resolvePreviousRunResult(
        { type: "result", previousResult: previousTestResult, result: testResult },
        undefined,
        false
      )
    ).toBe(previousTestResult);
  });

  it("does not create history for a plain rerun without a pending input change", () => {
    expect(resolvePreviousRunResult(undefined, testResult, false)).toBeUndefined();
  });

  it("captures the last successful result after an input-changing reset", () => {
    expect(resolvePreviousRunResult(undefined, testResult, true)).toBe(testResult);
  });
});

describe("resolveRunCellOptions", () => {
  const baselineRunCell = baseDocument.cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.id === "baseline-run"
  );

  it("uses run-cell periods", () => {
    expect(baselineRunCell).toBeDefined();
    expect(resolveRunCellOptions(testResult.options, baselineRunCell!).periods).toBe(10);
  });

  it("overrides the runtime periods when run-cell periods change", () => {
    expect(baselineRunCell).toBeDefined();
    expect(resolveRunCellOptions(testResult.options, { ...baselineRunCell!, periods: 25 }).periods).toBe(25);
  });
});

describe("buildRunHistorySignatures", () => {
  it("changes when equations or parameter-like inputs change", () => {
    const before = buildRunHistorySignatures(baseDocument);
    const afterEquationChange = buildRunHistorySignatures({
      ...baseDocument,
      cells: baseDocument.cells.map((cell) =>
        cell.id === "equations-main" && cell.type === "equations"
          ? { ...cell, equations: [{ id: "eq-1", name: "C", expression: "YD - T" }] }
          : cell
      )
    });
    const afterRunPeriodChange = buildRunHistorySignatures({
      ...baseDocument,
      cells: baseDocument.cells.map((cell) =>
        cell.id === "baseline-run" && cell.type === "run" ? { ...cell, periods: 25 } : cell
      )
    });

    expect(afterEquationChange["baseline-run"]).not.toBe(before["baseline-run"]);
    expect(afterRunPeriodChange["baseline-run"]).toBe(before["baseline-run"]);
  });
});
