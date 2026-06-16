import { describe, expect, it } from "vitest";

import {
  IMPLICIT_MATRIX_ACCUMULATION_SECTION_TITLE,
  resolveImplicitMatrixAccumulationEntries,
  resolvePreferredBaselineRunForModel
} from "../src/notebook/implicitMatrixEquations";
import type { EquationsCell, MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";

const modelId = "sim-baseline";

const equationsCell: EquationsCell = {
  id: "equations",
  type: "equations",
  title: "Equations",
  modelId,
  equations: [
    { id: "eq-wbd", name: "WBd", expression: "4" },
    { id: "eq-cs", name: "Cs", expression: "1" }
  ]
};

const baselineRun: RunCell = {
  id: "baseline-run",
  type: "run",
  title: "Baseline",
  sourceModelId: modelId,
  mode: "baseline",
  resultKey: "baseline",
  periods: 10
};

const scenarioRun: RunCell = {
  id: "scenario-run",
  type: "run",
  title: "Scenario",
  sourceModelId: modelId,
  mode: "scenario",
  resultKey: "scenario",
  periods: 10,
  baselineRunCellId: "baseline-run"
};

const matrix: MatrixCell = {
  id: "account-transactions",
  type: "matrix",
  title: "Account transactions",
  sourceRunCellId: "baseline-run",
  accountingKind: "account-transactions",
  columns: ["Deposits (Mh)", "Sum"],
  sectors: ["Households(HH)", ""],
  rows: [
    { band: "Wages", label: "Wages", values: ["WBd", "0"] },
    { band: "Consumption", label: "Consumption", values: ["-Cs", "0"] },
    { band: "Sum", label: "Sum", values: ["Mh", "0"] }
  ]
};

describe("implicitMatrixEquations", () => {
  it("prefers the baseline run for a model", () => {
    const cells: NotebookCell[] = [equationsCell, scenarioRun, baselineRun, matrix];

    expect(resolvePreferredBaselineRunForModel(cells, modelId)?.id).toBe("baseline-run");
  });

  it("collects implicit accumulation entries from the preferred baseline run", () => {
    const cells: NotebookCell[] = [equationsCell, baselineRun, matrix];

    const { preferredRun, entries } = resolveImplicitMatrixAccumulationEntries({
      cells,
      modelId,
      equations: equationsCell.equations
    });

    expect(preferredRun?.id).toBe("baseline-run");
    expect(entries).toEqual([
      {
        name: "Mh",
        expression: "I(Households.Deposits)",
        role: "accumulation",
        flowWarning: null
      }
    ]);
  });

  it("omits stocks that already have explicit equations", () => {
    const cells: NotebookCell[] = [equationsCell, baselineRun, matrix];
    const equations = [
      ...equationsCell.equations,
      { id: "eq-mh", name: "Mh", expression: "I(Households.Deposits)" }
    ];

    const { entries } = resolveImplicitMatrixAccumulationEntries({
      cells,
      modelId,
      equations
    });

    expect(entries).toEqual([]);
  });

  it("exports the equations-cell section title", () => {
    expect(IMPLICIT_MATRIX_ACCUMULATION_SECTION_TITLE).toContain("account-transactions matrix Sum row");
  });
});
