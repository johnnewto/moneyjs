import { describe, expect, it } from "vitest";

import { runBaseline, type SimulationResult } from "@sfcr/core";
import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";

import {
  ACCOUNT_SUM_ROW_FLOW_UNIT_META,
  ACCOUNT_TRANSACTIONS_SUM_ROW_DISPLAY_LABEL,
  applyMatrixEquationUpdates,
  buildProposedAccumulationExpression,
  collectProposedMatrixEquationUpdates,
  defaultSelectedMatrixEquationVariables,
  equationExpressionsMatch,
  evaluateMatrixEntryNumber,
  evaluateMatrixColumnIntegratedDisplay,
  formatAccountTransactionsSumRowDisplayLabel,
  isEditableAccountSumRowCell,
  isEmptyAccountSumRowSource,
  isSumRowStockAnnotation,
  isSumRowStockChangeAnnotation,
  resolveAccountSumRowCellBalance,
  resolveAccountSumRowDisplayValue,
  resolveAccountTransactionsMatrixCellValue,
  resolveMatrixColumnInitialConstant,
  resolveMatrixColumnStockVariable,
  resolveMatrixInitialRowCellValue,
  sumRowHasStockAnnotations
} from "../src/notebook/matrixAccountSumRow";
import { formatUnitText } from "../src/lib/unitMeta";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import type { EquationsCell, MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";

const modelId = "equations-newton";

const equationsCell: EquationsCell = {
  id: "equations",
  type: "equations",
  title: "Equations",
  modelId,
  equations: [
    {
      id: "eq-mh",
      name: "Mh",
      expression: "lag(Mh) + (YD - Cd) * dt",
      role: "accumulation",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    },
    {
      id: "eq-ld",
      name: "Ld",
      expression: "lag(Ld) + (Id - AF) * dt",
      role: "accumulation",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    }
  ]
};

const runCell: RunCell = {
  id: "baseline-run",
  type: "run",
  title: "Baseline",
  sourceModelId: modelId,
  mode: "baseline",
  resultKey: "baseline",
  periods: 100
};

const accountTransactionsMatrix: MatrixCell = {
  id: "account-transactions",
  type: "matrix",
  title: "BMW account transactions",
  sourceRunCellId: "baseline-run",
  accountingKind: "account-transactions",
  columns: ["Households.Deposits (Mh)", "Firms.Loans (Ld)", "Sum"],
  columnBadges: ["asset", "liability", ""],
  sectors: ["Households", "Firms", ""],
  rows: [
    { band: "Wages", label: "Wages", values: ["WBd", "", "0"] },
    { band: "Consumption", label: "Consumption", values: ["-Cs", "", "0"] },
    { band: "Sum", label: "Sum", values: ["d(Mh)", "d(Ld)", "0"] }
  ]
};

const cells: NotebookCell[] = [equationsCell, runCell, accountTransactionsMatrix];

describe("matrixAccountSumRow", () => {
  it("uses an accumulation label for account-transactions sum rows", () => {
    expect(ACCOUNT_TRANSACTIONS_SUM_ROW_DISPLAY_LABEL).toBe("initial + ∫ Σ(flows) dt");
    expect(formatAccountTransactionsSumRowDisplayLabel(accountTransactionsMatrix, "Sum")).toBe(
      ACCOUNT_TRANSACTIONS_SUM_ROW_DISPLAY_LABEL
    );
    expect(formatAccountTransactionsSumRowDisplayLabel(accountTransactionsMatrix, "Wages")).toBe("Wages");
  });

  it("detects d(stock) sum-row annotations", () => {
    expect(isSumRowStockChangeAnnotation("d(Mh)")).toBe(true);
    expect(isSumRowStockChangeAnnotation("+d(Mh)")).toBe(true);
    expect(isSumRowStockChangeAnnotation("0")).toBe(false);
    expect(isSumRowStockChangeAnnotation("WBd")).toBe(false);
  });

  it("allows editing account-transactions sum-row cells except the sum column", () => {
    const sumRowIndex = accountTransactionsMatrix.rows.findIndex((row) => row.label === "Sum");
    const sumColumnIndex = accountTransactionsMatrix.columns.findIndex((column) => column === "Sum");

    expect(
      isEditableAccountSumRowCell(
        accountTransactionsMatrix,
        sumRowIndex,
        0,
        sumRowIndex,
        sumColumnIndex
      )
    ).toBe(true);
    expect(
      isEditableAccountSumRowCell(
        accountTransactionsMatrix,
        sumRowIndex,
        sumColumnIndex,
        sumRowIndex,
        sumColumnIndex
      )
    ).toBe(false);
  });

  it("builds I(columnRef) accumulation proposals", () => {
    expect(buildProposedAccumulationExpression("Mh", "Households.Deposits", true)).toBe(
      "I(Households.Deposits)"
    );
    expect(buildProposedAccumulationExpression("Ld", "Firms.Loans", false)).toBe("Ld'");
  });

  it("proposes accumulation equations from sum-row stock variable annotations", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      rows: [
        { band: "Wages", label: "Wages", values: ["WBd", "", "0"] },
        { band: "Sum", label: "Sum", values: ["Mh", "Ld", "0"] }
      ]
    };

    const updates = collectProposedMatrixEquationUpdates({
      cells,
      matrix,
      modelId
    });

    expect(updates.find((update) => update.variable === "Mh")).toMatchObject({
      action: "update",
      proposed: {
        expression: "I(Households.Deposits)"
      }
    });
    expect(updates.find((update) => update.variable === "Ld")).toMatchObject({
      action: "update",
      proposed: {
        expression: "Ld'"
      }
    });
  });

  it("proposes add and update accumulation equations from sum-row d(stock) annotations", () => {
    const updates = collectProposedMatrixEquationUpdates({
      cells,
      matrix: accountTransactionsMatrix,
      modelId
    });

    expect(updates.find((update) => update.variable === "Mh")).toMatchObject({
      action: "update",
      isMismatch: true,
      proposed: {
        expression: "I(Households.Deposits)"
      }
    });
    expect(updates.find((update) => update.variable === "Ld")).toMatchObject({
      action: "update",
      isMismatch: true,
      proposed: {
        expression: "Ld'"
      }
    });
  });

  it("defaults selection to mismatched proposals only", () => {
    const updates = collectProposedMatrixEquationUpdates({
      cells,
      matrix: accountTransactionsMatrix,
      modelId
    });
    expect(defaultSelectedMatrixEquationVariables(updates)).toEqual(new Set(["Mh", "Ld"]));
  });

  it("adds a new accumulation equation when the model lacks the stock variable", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      rows: [
        { band: "Wages", label: "Wages", values: ["WBd", "", "0"] },
        { band: "Sum", label: "Sum", values: ["d(Ms)", "", "0"] }
      ]
    };

    const updates = collectProposedMatrixEquationUpdates({
      cells,
      matrix,
      modelId
    });

    expect(updates.find((update) => update.variable === "Ms")).toMatchObject({
      variable: "Ms",
      action: "add",
      proposed: {
        expression: "I(Households.Deposits)"
      }
    });
  });

  it("applies selected equation proposals to the equations cell", () => {
    const updates = collectProposedMatrixEquationUpdates({
      cells,
      matrix: accountTransactionsMatrix,
      modelId
    }).filter((update) => update.variable === "Mh");

    const nextCells = applyMatrixEquationUpdates(cells, updates);
    const nextEquations = nextCells.find(
      (entry): entry is EquationsCell => entry.type === "equations"
    )?.equations;
    expect(nextEquations?.find((equation) => equation.name === "Mh")?.expression).toBe(
      "I(Households.Deposits)"
    );
  });

  it("treats sum(columnRef), bare column refs, and I(columnRef) as equivalent", () => {
    expect(
      equationExpressionsMatch(
        "Mh' + sum(Households.Deposits) * dt",
        "Mh' + Households.Deposits * dt",
        "Mh"
      )
    ).toBe(true);
    expect(
      equationExpressionsMatch("I(Households.Deposits)", "Mh' + Households.Deposits * dt", "Mh")
    ).toBe(true);
    expect(
      equationExpressionsMatch("I(Households.Deposits)", "Mh' + sum(Households.Deposits) * dt", "Mh")
    ).toBe(true);
  });

  it("treats matching accumulation expressions as non-mismatch proposals", () => {
    const matchingMatrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Households.Deposits (Mh)", "Sum"],
      sectors: ["Households", ""],
      columnBadges: ["asset", ""],
      rows: [
        { band: "Income", label: "Income", values: ["YD - Cd", "0"] },
        { band: "Sum", label: "Sum", values: ["d(Mh)", "0"] }
      ]
    };
    const matchingEquations: EquationsCell = {
      ...equationsCell,
      equations: [
        {
          id: "eq-mh",
          name: "Mh",
          expression: "I(Households.Deposits)",
          role: "accumulation"
        }
      ]
    };

    const updates = collectProposedMatrixEquationUpdates({
      cells: [matchingEquations, runCell, matchingMatrix],
      matrix: matchingMatrix,
      modelId
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.isMismatch).toBe(false);
    expect(equationExpressionsMatch(updates[0]!.proposed.expression, "Mh' + Households.Deposits * dt", "Mh")).toBe(
      true
    );
  });

  it("treats I(columnRef) as matching an existing lag-plus-flow equation", () => {
    const matchingEquations: EquationsCell = {
      ...equationsCell,
      equations: [
        {
          id: "eq-mh",
          name: "Mh",
          expression: "I(Households.Deposits)",
          role: "accumulation"
        }
      ]
    };

    const updates = collectProposedMatrixEquationUpdates({
      cells: [matchingEquations, runCell, accountTransactionsMatrix],
      matrix: accountTransactionsMatrix,
      modelId
    });

    expect(updates.find((update) => update.variable === "Mh")?.isMismatch).toBe(false);
  });

  it("treats lag() and prime lag syntax as equivalent when comparing expressions", () => {
    expect(equationExpressionsMatch("Mh' + (YD - Cd) * dt", "lag(Mh) + (YD - Cd) * dt")).toBe(true);
    expect(equationExpressionsMatch("K' + (Id - DA) * dt", "lag(K) + (Id - DA) * dt")).toBe(true);
  });

  it("validates annotated sum-row cells against computed column totals", () => {
    expect(resolveAccountSumRowCellBalance("d(Mh)", 10, null, 0)).toBe(true);
    expect(resolveAccountSumRowCellBalance("d(Mh)", 10.0000001, null, 0)).toBe(true);
    expect(resolveAccountSumRowCellBalance("", 10, null, 0)).toBe(true);
  });

  it("detects empty account-transactions sum-row sources", () => {
    expect(isEmptyAccountSumRowSource("")).toBe(true);
    expect(isEmptyAccountSumRowSource("0")).toBe(true);
    expect(isEmptyAccountSumRowSource("  ")).toBe(true);
    expect(isEmptyAccountSumRowSource("-")).toBe(true);
    expect(isEmptyAccountSumRowSource("+")).toBe(true);
    expect(isEmptyAccountSumRowSource("d(Mh)")).toBe(false);
  });

  it("warns when proposing accumulation for a sum-row stock without column flows", () => {
    const updates = collectProposedMatrixEquationUpdates({
      cells,
      matrix: accountTransactionsMatrix,
      modelId
    });

    expect(updates.find((update) => update.variable === "Ld")?.warning).toContain(
      "no flow entries"
    );
  });

  it("uses default flow units for empty sum-row display", () => {
    expect(formatUnitText(ACCOUNT_SUM_ROW_FLOW_UNIT_META)).toBe("$/yr");
  });

  it("prefers annotated sum-row evaluation over the column sum for display", () => {
    const result: SimulationResult = {
      blocks: [],
      model: {
        equations: [],
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
        Mh: new Float64Array([100, 110])
      }
    };

    expect(resolveAccountSumRowDisplayValue("d(Mh)", 999, result, 1)).toBe(10);
    expect(resolveAccountSumRowDisplayValue("Mh", 999, result, 1)).toBe(110);
    expect(
      resolveAccountSumRowDisplayValue("", 42, result, 1, { stockVariable: "Mh" })
    ).toBe(110);
    expect(resolveAccountSumRowDisplayValue("", 42, result, 1)).toBe(42);
    expect(resolveAccountSumRowDisplayValue("0", 42, result, 1)).toBe(42);
  });

  it("does not infer stock variables from column labels when the sum row is empty", () => {
    const emptySumRowMatrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Households.Deposits (Mh)", "Sum"],
      sectors: ["Households", ""],
      columnBadges: ["asset", ""],
      rows: [
        { band: "Wages", label: "Wages", values: ["WBd", "0"] },
        { band: "Sum", label: "Sum", values: ["", "0"] }
      ]
    };

    expect(resolveMatrixColumnStockVariable(emptySumRowMatrix, 0)).toBeNull();
    expect(sumRowHasStockAnnotations(emptySumRowMatrix)).toBe(false);
    expect(
      collectProposedMatrixEquationUpdates({
        cells,
        matrix: emptySumRowMatrix,
        modelId
      })
    ).toEqual([]);
  });

  it("integrates column flows from the initial row when the sum row is empty", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Households.Deposits (Mh)", "Sum"],
      sectors: ["Households", ""],
      columnBadges: ["asset", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["100", "0"] },
        { band: "Wages", label: "Wages", values: ["4", "0"] },
        { band: "Consumption", label: "Consumption", values: ["-1", "0"] },
        { band: "Sum", label: "Sum", values: ["", "0"] }
      ]
    };
    const result: SimulationResult = {
      blocks: [],
      model: { equations: [], externals: {}, initialValues: {} },
      options: {
        periods: 2,
        solverMethod: "NEWTON",
        tolerance: 1e-15,
        maxIterations: 200,
        defaultInitialValue: 1e-15
      },
      series: {
        WBd: new Float64Array([4, 4, 4]),
        Cs: new Float64Array([1, 1, 1])
      }
    };

    expect(evaluateMatrixColumnIntegratedDisplay(matrix, 0, result, 0)).toBe(100);
    expect(evaluateMatrixColumnIntegratedDisplay(matrix, 0, result, 1)).toBe(103);
    expect(evaluateMatrixColumnIntegratedDisplay(matrix, 0, result, 2)).toBe(106);
    expect(
      resolveAccountSumRowDisplayValue("", 999, result, 2, { matrix, columnIndex: 0 })
    ).toBe(106);
  });

  it("infers empty equity initial values from sector assets minus liabilities", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits", "Bills", "Equity", "Sum"],
      sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["100", "40", "", "0"] },
        { band: "Income", label: "Income", values: ["+Y", "-Y", "", "0"] },
        { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
      ]
    };

    expect(resolveMatrixColumnInitialConstant(matrix, 2)).toBe(60);
    expect(resolveMatrixInitialRowCellValue(matrix, 2)).toBe(60);
    expect(resolveMatrixInitialRowCellValue(matrix, 0)).toBe(100);
  });

  it("infers empty equity flow-row values from sector assets minus liabilities", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits", "Bills", "Equity", "Sum"],
      sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["0", "0", "", "0"] },
        { band: "Income", label: "Income", values: ["10", "-4", "", "0"] },
        { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
      ]
    };

    const incomeRowIndex = matrix.rows.findIndex((row) => row.label === "Income");
    expect(
      resolveAccountTransactionsMatrixCellValue(matrix, incomeRowIndex, 2, null, 0)
    ).toBe(14);
  });

  it("leaves empty equity blank when the sector row has no asset and liability entries", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits", "Bills", "Equity", "Sum"],
      sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["", "", "", "0"] },
        { band: "Income", label: "Income", values: ["", "", "", "0"] },
        { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
      ]
    };

    const initialRowIndex = matrix.rows.findIndex((row) => row.label === "Initial values");
    const incomeRowIndex = matrix.rows.findIndex((row) => row.label === "Income");

    expect(resolveAccountTransactionsMatrixCellValue(matrix, initialRowIndex, 2, null, 0)).toBeNull();
    expect(resolveAccountTransactionsMatrixCellValue(matrix, incomeRowIndex, 2, null, 0)).toBeNull();
    expect(resolveMatrixColumnInitialConstant(matrix, 2)).toBe(0);
  });

  it("shows assets-only or liabilities-only sector rows in empty equity cells", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits", "Bills", "Equity", "Sum"],
      sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["100", "", "", "0"] },
        { band: "Income", label: "Income", values: ["", "-4", "", "0"] },
        { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
      ]
    };

    const initialRowIndex = matrix.rows.findIndex((row) => row.label === "Initial values");
    const incomeRowIndex = matrix.rows.findIndex((row) => row.label === "Income");

    expect(resolveAccountTransactionsMatrixCellValue(matrix, initialRowIndex, 2, null, 0)).toBe(100);
    expect(resolveAccountTransactionsMatrixCellValue(matrix, incomeRowIndex, 2, null, 0)).toBe(4);
  });

  it("prefers simulation stock lookup over sector implied equity on empty sum-row cells", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits", "Bills", "Equity", "Sum"],
      sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["100", "40", "", "0"] },
        { band: "Income", label: "Income", values: ["+Y", "-Y", "", "0"] },
        { band: "Sum", label: "Sum", values: ["Hhp", "Bhp", "Vp", "0"] }
      ]
    };
    const result: SimulationResult = {
      blocks: [],
      model: { equations: [], externals: {}, initialValues: {} },
      options: {
        periods: 2,
        solverMethod: "NEWTON",
        tolerance: 1e-15,
        maxIterations: 200,
        defaultInitialValue: 1e-15
      },
      series: {
        Vp: new Float64Array([60, 75])
      }
    };

    expect(
      resolveAccountSumRowDisplayValue("", 999, result, 1, {
        stockVariable: "Vp",
        matrix,
        columnIndex: 2
      })
    ).toBe(75);
  });

  it("infers empty equity sum-row display from sector stocks when simulation is unavailable", () => {
    const matrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits", "Bills", "Equity", "Sum"],
      sectors: ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""],
      columnBadges: ["asset", "liability", "equity", ""],
      rows: [
        { band: "Initial", label: "Initial values", role: "initial", values: ["100", "40", "", "0"] },
        { band: "Income", label: "Income", values: ["10", "-5", "", "0"] },
        { band: "Sum", label: "Sum", values: ["", "", "Vp", "0"] }
      ]
    };
    const result: SimulationResult = {
      blocks: [],
      model: { equations: [], externals: {}, initialValues: {} },
      options: {
        periods: 1,
        solverMethod: "NEWTON",
        tolerance: 1e-15,
        maxIterations: 200,
        defaultInitialValue: 1e-15
      },
      series: {}
    };

    expect(
      resolveAccountSumRowDisplayValue("", 999, result, 1, {
        stockVariable: "Vp",
        matrix,
        columnIndex: 2
      })
    ).toBe(75);
  });

  it("BMW interest on deposits row sums to zero at period 3", () => {
    const result = runBaseline(bmwBaselineModel, bmwBaselineOptions);
    const matrix = getNotebookTemplateDocument("bmw").cells.find(
      (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === "account-transactions"
    );
    expect(matrix).toBeDefined();
    if (!matrix) {
      throw new Error("Expected BMW account-transactions matrix.");
    }

    const row = matrix.rows.find((entry) => entry.label === "Interest on deposits");
    expect(row).toBeDefined();
    if (!row) {
      throw new Error("Expected Interest on deposits row.");
    }

    const sumColumnIndex = matrix.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
    const periodIndex = 2;
    const rowTotal = row.values.reduce<number>((total, source, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return total;
      }
      return total + (evaluateMatrixEntryNumber(source, result, periodIndex) ?? 0);
    }, 0);

    expect(rowTotal).toBeCloseTo(0, 6);
  });
});
