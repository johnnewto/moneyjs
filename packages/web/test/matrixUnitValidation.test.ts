import { describe, expect, it } from "vitest";

import { buildVariableUnitMetadata } from "../src/lib/units";
import {
  formatMatrixCellUnitValidationMessage,
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
        message: expect.stringContaining("expects $ or items")
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
        message: expect.stringContaining("expects $/yr or items/yr")
      })
    ]);
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
});
