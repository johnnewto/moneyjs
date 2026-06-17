import { inferMatrixRowRoleFromLabels, isMatrixInitialRow } from "@sfcr/notebook-core";
import { describe, expect, it } from "vitest";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { columnHasFlowEntries, resolveMatrixColumnSumBindings } from "../src/notebook/matrixColumnSumRuntime";
import {
  collectMatrixInitialValueBindings,
  collectMatrixInitialValueOverrideIssues,
  resolveMatrixInitialValues
} from "../src/notebook/matrixInitialRow";
import type { EquationsCell, InitialValuesCell, MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";

const modelId = "pc-two-class";

const equationsCell: EquationsCell = {
  id: "equations",
  type: "equations",
  title: "Equations",
  modelId,
  equations: [
    { id: "eq-vp", name: "Vp", expression: "I(YDp - Cp)", role: "accumulation" },
    { id: "eq-vr", name: "Vr", expression: "I(YDr - Cr)", role: "accumulation" }
  ]
};

const initialValuesCell: InitialValuesCell = {
  id: "initial-values",
  type: "initial-values",
  title: "Initial values",
  modelId,
  initialValues: [
    { id: "init-vp", name: "Vp", valueText: "40" },
    { id: "init-vr", name: "Vr", valueText: "100" }
  ]
};

const runCell: RunCell = {
  id: "baseline-run",
  type: "run",
  title: "Baseline",
  sourceModelId: modelId,
  mode: "baseline",
  resultKey: "baseline",
  periods: 10
};

const accountTransactionsMatrix: MatrixCell = {
  id: "account-transactions",
  type: "matrix",
  title: "Account transactions",
  sourceRunCellId: "baseline-run",
  accountingKind: "account-transactions",
  columns: ["Deposits", "Bills", "Equity", "Sum"],
  sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
  columnBadges: ["asset", "asset", "equity", ""],
  rows: [
    { band: "Initial", label: "Initial values", role: "initial", values: ["", "", "45", "0"] },
    { band: "Income", label: "Income", values: ["+Y", "", "-Y", "0"] },
    { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
  ]
};

const cells: NotebookCell[] = [equationsCell, initialValuesCell, runCell, accountTransactionsMatrix];

describe("matrixInitialRow", () => {
  it("treats compact Initial band rows as initial rows", () => {
    expect(inferMatrixRowRoleFromLabels("Initial", "Initial values")).toBe("initial");
    expect(
      isMatrixInitialRow({
        band: "Initial",
        label: "Initial values",
        values: ["0"]
      })
    ).toBe(true);
  });

  it("collects initial values from the initial row using sum-row stock variables", () => {
    expect(collectMatrixInitialValueBindings({ cells, modelId, runCellId: "baseline-run" })).toEqual([
      expect.objectContaining({
        variable: "Vp",
        valueText: "45",
        numericValue: 45
      })
    ]);
  });

  it("infers empty equity initial values from sector assets minus liabilities", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["100", "40", "", "0"] },
        { band: "Income", label: "Income", values: ["+Y", "", "-Y", "0"] },
        { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
      ]
    };

    expect(
      collectMatrixInitialValueBindings({
        cells: [equationsCell, initialValuesCell, runCell, matrix],
        modelId,
        runCellId: "baseline-run"
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variable: "Vp",
          valueText: "60",
          numericValue: 60
        })
      ])
    );
  });

  it("excludes initial row cells from column integration", () => {
    const sumRowIndex = accountTransactionsMatrix.rows.findIndex((row) => row.label === "Sum");
    expect(columnHasFlowEntries(accountTransactionsMatrix, 0, sumRowIndex)).toBe(true);
    expect(columnHasFlowEntries(accountTransactionsMatrix, 1, sumRowIndex)).toBe(false);

    const bindings = resolveMatrixColumnSumBindings({
      cells,
      modelId,
      runCellId: "baseline-run",
      equationSources: ["I(Poor.Deposits)"]
    });
    expect(bindings["Poor.Deposits"]).toEqual(["+Y"]);
    expect(bindings["Poor.Bills"]).toBeUndefined();
  });

  it("overrides initial-values cell entries at runtime", () => {
    const runtime = buildRuntimeConfig(
      {
        equations: equationsCell.equations,
        externals: [],
        initialValues: initialValuesCell.initialValues,
        options: {
          periods: 10,
          solverMethod: "GAUSS_SEIDEL",
          toleranceText: "1e-9",
          maxIterations: 20,
          defaultInitialValueText: "1e-15",
          hiddenLeftVariable: "",
          hiddenRightVariable: "",
          hiddenToleranceText: "1e-5",
          relativeHiddenTolerance: false
        },
        scenario: { shocks: [] }
      },
      {
        notebookCells: cells,
        modelId,
        runCellId: "baseline-run"
      }
    );

    expect(resolveMatrixInitialValues({ cells, modelId, runCellId: "baseline-run" })).toEqual({
      Vp: 45
    });
    expect(runtime.model.initialValues.Vp).toBe(45);
    expect(runtime.model.initialValues.Vr).toBe(100);
  });

  it("warns when matrix initial row overrides initial-values cell values", () => {
    const issues = collectMatrixInitialValueOverrideIssues({
      cells,
      modelId,
      cellInitialValues: initialValuesCell.initialValues,
      runCellId: "baseline-run"
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "initialValues.0.valueText",
          severity: "warning",
          message: expect.stringContaining("Vp = 45")
        }),
        expect.objectContaining({
          path: "matrix.account-transactions.initialValues",
          severity: "warning"
        }),
        expect.objectContaining({
          path: "options.matrixInitialValues",
          severity: "warning"
        })
      ])
    );
  });
});
