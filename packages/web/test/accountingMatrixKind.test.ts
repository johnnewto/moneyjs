import { describe, expect, it } from "vitest";

import {
  inferAccountingMatrixKind,
  normalizeAccountingMatrixKindInput,
  resolveAccountingMatrixKind
} from "@sfcr/notebook-core";
import {
  classifyMatrixStockRole,
  inferMatrixTableKind,
  resolveMatrixTableKind
} from "../src/notebook/matrixSemantics";
import type { MatrixCell } from "../src/notebook/types";

function balanceSheetCell(overrides: Partial<MatrixCell> = {}): MatrixCell {
  return {
    id: "balance-sheet",
    type: "matrix",
    title: "Balance sheet",
    columns: ["Households", "Sum"],
    rows: [
      { band: "Deposits", label: "Firm deposits", values: ["+Firms_eq", "0"] },
      { band: "Loans", label: "Private debt", values: ["-Debt", "0"] },
      { band: "Sum", label: "Sum", values: ["0", "0"] }
    ],
    ...overrides
  };
}

describe("accounting matrix kind", () => {
  it("normalizes author-friendly aliases", () => {
    expect(normalizeAccountingMatrixKindInput("Balance")).toBe("balance-sheet");
    expect(normalizeAccountingMatrixKindInput("transactionFlow")).toBe("transaction-flow");
    expect(normalizeAccountingMatrixKindInput("balance-sheet")).toBe("balance-sheet");
  });

  it("prefers explicit accountingKind over id/title inference", () => {
    const cell = balanceSheetCell({
      id: "custom-matrix",
      title: "Custom matrix",
      accountingKind: "balance-sheet"
    });

    expect(resolveAccountingMatrixKind(cell)).toBe("balance-sheet");
    expect(resolveMatrixTableKind(cell)).toBe("stocks");
    expect(classifyMatrixStockRole("Private debt", "-Debt", -10)).toBe("liability");
  });

  it("forces stocks for endogenous-money-style rows when accountingKind is set", () => {
    const cell = balanceSheetCell({
      id: "balance-sheet",
      title: "Endogenous money balance sheet",
      accountingKind: "balance-sheet"
    });

    expect(inferMatrixTableKind(cell)).toBe("flows");
    expect(resolveMatrixTableKind(cell)).toBe("stocks");
  });

  it("falls back to keyword inference when accountingKind is unset", () => {
    const cell: MatrixCell = {
      id: "matrix-net-wealth",
      type: "matrix",
      title: "Net wealth matrix",
      columns: ["Households", "Sum"],
      rows: [{ band: "Balance", label: "Net Wealth", values: ["-Vh", "0"] }]
    };

    expect(inferAccountingMatrixKind(cell)).toBeNull();
    expect(resolveMatrixTableKind(cell)).toBe("stocks");
  });
});
