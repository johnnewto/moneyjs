import { describe, expect, it } from "vitest";

import { runBaseline } from "@sfcr/core";
import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";

import {
  applyMatrixEquationUpdates,
  buildProposedAccumulationExpression,
  collectProposedMatrixEquationUpdates,
  defaultSelectedMatrixEquationVariables,
  equationExpressionsMatch,
  evaluateMatrixEntryNumber,
  isEditableAccountSumRowCell,
  isSumRowStockChangeAnnotation,
  resolveAccountSumRowCellBalance
} from "../src/notebook/matrixAccountSumRow";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
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

  it("builds sum() column references for accumulation proposals", () => {
    expect(buildProposedAccumulationExpression("Mh", "Households.Deposits", true)).toBe(
      "Mh' + sum(Households.Deposits) * dt"
    );
    expect(buildProposedAccumulationExpression("Ld", "Firms.Loans", false)).toBe("Ld'");
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
        expression: "Mh' + sum(Households.Deposits) * dt"
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
        expression: "Ms' + sum(Households.Deposits) * dt"
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
      "Mh' + sum(Households.Deposits) * dt"
    );
  });

  it("treats matching accumulation expressions as non-mismatch proposals", () => {
    const matchingMatrix: MatrixCell = {
      ...accountTransactionsMatrix,
      rows: [
        { band: "Income", label: "Income", values: ["YD - Cd", "", "0"] },
        { band: "Sum", label: "Sum", values: ["d(Mh)", "", "0"] }
      ]
    };
    const matchingEquations: EquationsCell = {
      ...equationsCell,
      equations: [
        {
          id: "eq-mh",
          name: "Mh",
          expression: "Mh' + sum(Households.Deposits) * dt",
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
    expect(equationExpressionsMatch(updates[0]!.proposed.expression, "Mh' + sum(Households.Deposits) * dt")).toBe(
      true
    );
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

  it("BMW interest on deposits row sums to zero at period 3", () => {
    const result = runBaseline(bmwBaselineModel, bmwBaselineOptions);
    const matrix = NOTEBOOK_TEMPLATES.bmw.document.cells.find(
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
