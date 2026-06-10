import { describe, expect, it } from "vitest";

import { formatNumericValueParts, formatUnitText, resolveVariableTooltip } from "../src/lib/unitMeta";

describe("mass unit formatting", () => {
  it("formats kg stock and flow presets", () => {
    expect(formatUnitText({ stockFlow: "stock", signature: { mass: 1 } })).toBe("kg");
    expect(formatUnitText({ stockFlow: "flow", signature: { mass: 1, time: -1 } })).toBe("kg/yr");
    expect(formatUnitText({ stockFlow: "aux", signature: { money: 1, mass: -1 } })).toBe("$/kg");
  });
});

describe("energy and pp unit formatting", () => {
  it("formats J and pp stock, flow, and price presets", () => {
    expect(formatUnitText({ stockFlow: "stock", signature: { time: 1 } })).toBe("yr");
    expect(formatUnitText({ stockFlow: "stock", signature: { energy: 1 } })).toBe("J");
    expect(formatUnitText({ stockFlow: "flow", signature: { energy: 1, time: -1 } })).toBe("J/yr");
    expect(formatUnitText({ stockFlow: "aux", signature: { money: 1, energy: -1 } })).toBe("$/J");
    expect(formatUnitText({ stockFlow: "stock", signature: { pp: 1 } })).toBe("pp");
    expect(formatUnitText({ stockFlow: "flow", signature: { pp: 1, time: -1 } })).toBe("pp/yr");
    expect(formatUnitText({ stockFlow: "aux", signature: { money: 1, pp: -1 } })).toBe("$/pp");
  });
});

describe("formatNumericValueParts", () => {
  it("splits money flow values into leading symbol, amount, and suffix", () => {
    expect(
      formatNumericValueParts(-14.511085, { stockFlow: "flow", signature: { money: 1, time: -1 } }, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      })
    ).toEqual({
      leadingSymbol: "-$",
      integerPart: "14",
      decimalSeparator: ".",
      fractionPart: "51",
      unitSuffix: "/yr"
    });
  });

  it("keeps non-money units in a separate suffix without shifting the amount", () => {
    expect(
      formatNumericValueParts(80.67, { stockFlow: "flow", signature: { items: 1, time: -1 } }, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      })
    ).toEqual({
      leadingSymbol: "",
      integerPart: "80",
      decimalSeparator: ".",
      fractionPart: "67",
      unitSuffix: "items/yr"
    });
  });
});

describe("carbon unit formatting", () => {
  it("formats °C stock and flow presets", () => {
    expect(formatUnitText({ stockFlow: "stock", signature: { carbon: 1 } })).toBe("°C");
    expect(formatUnitText({ stockFlow: "flow", signature: { carbon: 1, time: -1 } })).toBe("°C/yr");
    expect(formatUnitText({ stockFlow: "aux", signature: { money: 1, carbon: -1 } })).toBe("$/°C");
  });
});

describe("resolveVariableTooltip", () => {
  it("shows lagged values for lagged variable references", () => {
    const tooltip = resolveVariableTooltip({
      name: "Cr",
      valueReference: "lagged",
      laggedCurrentValues: { Cr: 120 },
      laggedPeriodLabel: "period 4"
    });

    expect(tooltip).toBe("Cr' = 120 (period 4)");
  });

  it("shows current-period values for non-lagged references", () => {
    const tooltip = resolveVariableTooltip({
      name: "Cr",
      currentValues: { Cr: 150 }
    });

    expect(tooltip).toBe("Cr = 150");
  });
});
