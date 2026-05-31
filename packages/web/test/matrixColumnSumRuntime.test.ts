import { describe, expect, it } from "vitest";

import {
  columnHasFlowEntries,
  formatMatrixColumnSumReference,
  resolveMatrixColumnSumBindings
} from "../src/notebook/matrixColumnSumRuntime";
import type { EquationsCell, MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";

const modelId = "equations-newton";

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

describe("matrixColumnSumRuntime", () => {
  it("formats column labels as sum() references", () => {
    expect(formatMatrixColumnSumReference("Households.Deposits (Mh)")).toBe("Households.Deposits");
  });

  it("detects whether a column has flow entries", () => {
    const sumRowIndex = accountTransactionsMatrix.rows.findIndex((row) => row.label === "Sum");
    expect(columnHasFlowEntries(accountTransactionsMatrix, 0, sumRowIndex)).toBe(true);
    expect(columnHasFlowEntries(accountTransactionsMatrix, 1, sumRowIndex)).toBe(false);
  });

  it("resolves matrix column sum bindings from linked account-transactions matrices", () => {
    const bindings = resolveMatrixColumnSumBindings({
      cells: [runCell, accountTransactionsMatrix],
      modelId,
      runCellId: "baseline-run",
      equationSources: ["Mh' + sum(Households.Deposits) * dt"]
    });

    expect(bindings).toEqual({
      "Households.Deposits": ["WBd", "-Cs"]
    });
  });

  it("resolves bindings by stock variable symbol", () => {
    const bindings = resolveMatrixColumnSumBindings({
      cells: [runCell, accountTransactionsMatrix],
      modelId,
      runCellId: "baseline-run",
      equationSources: ["Mh' + sum(Mh) * dt"]
    });

    expect(bindings).toEqual({
      Mh: ["WBd", "-Cs"]
    });
  });
});
