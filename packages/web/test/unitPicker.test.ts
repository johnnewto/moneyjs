import { describe, expect, it } from "vitest";

import {
  applyStockFlowToUnitDraft,
  defaultPickerFormForKind,
  equationUnitMetaToPresetMeta,
  presetToEquationUnitMeta,
  signatureToUnitPickerForm,
  unitMetasEqual,
  unitPickerFormToSignature
} from "../src/lib/unitPicker";

describe("unitPicker", () => {
  it("round-trips single units", () => {
    expect(signatureToUnitPickerForm({ money: 1 })).toMatchObject({
      shape: "single",
      singleDimension: "money"
    });
    expect(unitPickerFormToSignature({ shape: "single", singleDimension: "items" })).toEqual({
      items: 1
    });
  });

  it("round-trips divide units", () => {
    expect(signatureToUnitPickerForm({ money: 1, time: -1 })).toMatchObject({
      shape: "divide",
      leftOperand: "money",
      rightOperand: "time"
    });
    expect(
      unitPickerFormToSignature({
        shape: "divide",
        singleDimension: "money",
        leftOperand: "money",
        rightOperand: "time"
      })
    ).toEqual({ money: 1, time: -1 });
  });

  it("round-trips multiply units with distinct operands", () => {
    expect(signatureToUnitPickerForm({ money: 1, items: 1 })).toMatchObject({
      shape: "multiply",
      leftOperand: "money",
      rightOperand: "items"
    });
    expect(
      unitPickerFormToSignature({
        shape: "multiply",
        singleDimension: "money",
        leftOperand: "money",
        rightOperand: "items"
      })
    ).toEqual({ money: 1, items: 1 });
  });

  it("supports dimensionless inverse time", () => {
    expect(signatureToUnitPickerForm({ time: -1 })).toMatchObject({
      shape: "divide",
      leftOperand: "none",
      rightOperand: "time"
    });
  });

  it("defaults stock and flow kinds to money units when unset", () => {
    expect(defaultPickerFormForKind("stock")).toMatchObject({
      shape: "single",
      singleDimension: "money"
    });
    expect(defaultPickerFormForKind("flow")).toMatchObject({
      shape: "divide",
      leftOperand: "money",
      rightOperand: "time"
    });
    expect(defaultPickerFormForKind("aux")).toBeNull();
    expect(defaultPickerFormForKind(undefined)).toBeNull();
  });

  it("maps derivative-balance flow presets to stock storage", () => {
    expect(
      presetToEquationUnitMeta("d(Ls)", {
        stockFlow: "flow",
        signature: { money: 1, time: -1 }
      })
    ).toEqual({
      stockFlow: "stock",
      signature: { money: 1 }
    });
    expect(
      equationUnitMetaToPresetMeta("d(Ls)", {
        stockFlow: "stock",
        signature: { money: 1 }
      })
    ).toEqual({
      stockFlow: "flow",
      signature: { money: 1, time: -1 }
    });
  });

  it("compares preset unit metadata", () => {
    expect(
      unitMetasEqual(
        { stockFlow: "flow", signature: { money: 1, time: -1 } },
        { stockFlow: "flow", signature: { money: 1, time: -1 } }
      )
    ).toBe(true);
    expect(
      unitMetasEqual(
        { stockFlow: "stock", signature: { money: 1 } },
        { stockFlow: "flow", signature: { money: 1, time: -1 } }
      )
    ).toBe(false);
  });

  it("applies kind defaults only when units are unset", () => {
    const unset = applyStockFlowToUnitDraft({
      currentPickerForm: { shape: "none", singleDimension: "money", leftOperand: "money", rightOperand: "time" },
      stockFlow: "flow"
    });
    expect(unset).toMatchObject({
      shape: "divide",
      leftOperand: "money",
      rightOperand: "time"
    });

    const existing = applyStockFlowToUnitDraft({
      currentPickerForm: {
        shape: "single",
        singleDimension: "items",
        leftOperand: "money",
        rightOperand: "time"
      },
      stockFlow: "flow"
    });
    expect(existing).toMatchObject({
      shape: "single",
      singleDimension: "items"
    });
  });
});
