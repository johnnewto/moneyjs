import { describe, expect, it } from "vitest";

import { buildVariableUnitMetadata } from "../src/lib/units";
import {
  formatMatrixCellUnitValidationMessage,
  formatMatrixEntryUnitValidationMessage,
  hasMatrixEntryUnitErrors,
  validateMatrixCellUnits,
  validateMatrixEntryUnits
} from "../src/notebook/matrixUnitValidation";
import type { MatrixCell } from "../src/notebook/types";

const bmwUnitMetadata = buildVariableUnitMetadata({
  equations: [
    { name: "Mh", expression: "lag(Mh) + (YD - Cd) * dt", unitMeta: { stockFlow: "stock", signature: { money: 1 } } },
    { name: "Cd", expression: "alpha0 + alpha1 * YD", unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } } },
    { name: "rm", expression: "rl", unitMeta: { stockFlow: "aux", signature: { time: -1 } } },
    { name: "Ld", expression: "lag(Ld) + (Id - AF) * dt", unitMeta: { stockFlow: "stock", signature: { money: 1 } } },
    { name: "Ls", expression: "lag(Ls) + d(Ld) * dt", unitMeta: { stockFlow: "stock", signature: { money: 1 } } }
  ]
});

describe("matrixUnitValidation", () => {
  it("accepts stock units on balance-sheet cells", () => {
    const diagnostics = validateMatrixEntryUnits("+Mh", "balance-sheet", bmwUnitMetadata);
    expect(diagnostics).toEqual([]);
  });

  it("rejects flow units on balance-sheet cells", () => {
    const diagnostics = validateMatrixEntryUnits("-Cd", "balance-sheet", bmwUnitMetadata);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("expects $, items, kg, J, pp, °C, or yr")
      })
    ]);
    expect(hasMatrixEntryUnitErrors(diagnostics)).toBe(true);
  });

  it("accepts flow units on transaction-flow cells", () => {
    expect(validateMatrixEntryUnits("-Cd", "transaction-flow", bmwUnitMetadata)).toEqual([]);
    expect(validateMatrixEntryUnits("+rm[-1] * Mh[-1]", "transaction-flow", bmwUnitMetadata)).toEqual([]);
    expect(validateMatrixEntryUnits("+d(Ld)", "transaction-flow", bmwUnitMetadata)).toEqual([]);
  });

  it("rejects stock units on transaction-flow cells", () => {
    const diagnostics = validateMatrixEntryUnits("+Mh", "transaction-flow", bmwUnitMetadata);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("expects $/yr, items/yr, kg/yr, J/yr, pp/yr, or °C/yr")
      })
    ]);
  });

  it("skips unit validation for numeric literals in account-transactions initial rows", () => {
    const diagnostics = validateMatrixEntryUnits("45", "account-transactions", bmwUnitMetadata, {
      rowLabel: "Initial values",
      columnLabel: "Equity",
      isInitialRow: true
    });
    expect(diagnostics).toEqual([]);
  });

  it("validates all non-sum cells in an accounting matrix", () => {
    const cell: MatrixCell = {
      id: "balance-sheet",
      type: "matrix",
      title: "BMW balance sheet",
      columns: ["Households", "Sum"],
      rows: [
        { band: "Deposits", label: "Money deposits", values: ["+Mh", "0"] },
        { band: "Sum", label: "Sum", values: ["0", "0"] }
      ]
    };

    expect(validateMatrixCellUnits(cell, bmwUnitMetadata)).toEqual([]);
    expect(formatMatrixCellUnitValidationMessage(cell, bmwUnitMetadata)).toBeNull();
  });

  it("skips validation for generic matrices", () => {
    const cell: MatrixCell = {
      id: "custom-matrix",
      type: "matrix",
      title: "Custom matrix",
      columns: ["A"],
      rows: [{ label: "Row 1", values: ["+Mh"] }]
    };

    expect(validateMatrixCellUnits(cell, bmwUnitMetadata)).toEqual([]);
  });

  it("formats inline entry validation with row and column context", () => {
    const cell: MatrixCell = {
      id: "account-transactions",
      type: "matrix",
      accountingKind: "account-transactions",
      title: "PC account transactions",
      columns: ["Net_Worth (Vh)", "Sum"],
      rows: [{ band: "Wages", label: "Wages", values: ["1", "0"] }]
    };

    expect(
      formatMatrixEntryUnitValidationMessage("1", cell, 0, 0, bmwUnitMetadata)
    ).toMatch(/Account-transactions matrix cell \(Wages \/ Net_Worth \(Vh\)/);
    expect(
      formatMatrixEntryUnitValidationMessage("1", cell, 0, 0, bmwUnitMetadata)
    ).toMatch(/expects \$\/yr/);
  });
});
