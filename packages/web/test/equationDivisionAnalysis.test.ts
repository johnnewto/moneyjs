import { describe, expect, it } from "vitest";

import {
  collectEquationDenominatorVariables,
  DEFAULT_ZERO_DENOMINATOR_TOLERANCE,
  formatZeroDenominatorWarning,
  isNearZeroForDivision,
  isZeroDenominatorVariable
} from "../src/lib/equationDivisionAnalysis";

describe("equationDivisionAnalysis", () => {
  it("collects current and lagged variables from denominator subtrees", () => {
    expect(collectEquationDenominatorVariables("interest / L")).toEqual(new Set(["L"]));
    expect(collectEquationDenominatorVariables("a / lag(b)")).toEqual(new Set(["b"]));
    expect(collectEquationDenominatorVariables("x / (y + z)")).toEqual(new Set(["y", "z"]));
    expect(collectEquationDenominatorVariables("a / b + c / d")).toEqual(new Set(["b", "d"]));
    expect(collectEquationDenominatorVariables("a + b")).toEqual(new Set());
    expect(collectEquationDenominatorVariables("")).toEqual(new Set());
    expect(collectEquationDenominatorVariables("not valid / syntax")).toEqual(new Set());
  });

  it("treats near-zero values as zero for division highlighting", () => {
    expect(isNearZeroForDivision(0)).toBe(true);
    expect(isNearZeroForDivision(1e-13)).toBe(true);
    expect(isNearZeroForDivision(DEFAULT_ZERO_DENOMINATOR_TOLERANCE)).toBe(true);
    expect(isNearZeroForDivision(1e-11)).toBe(false);
    expect(isNearZeroForDivision(undefined)).toBe(false);
    expect(isNearZeroForDivision(Number.NaN)).toBe(false);
  });

  it("flags denominator variables when their period value is near zero", () => {
    const denominatorVariableNames = new Set(["L"]);

    expect(
      isZeroDenominatorVariable({
        name: "L",
        isLagged: false,
        denominatorVariableNames,
        currentValues: { L: 0 }
      })
    ).toBe(true);

    expect(
      isZeroDenominatorVariable({
        name: "L",
        isLagged: true,
        denominatorVariableNames,
        laggedCurrentValues: { L: 1e-13 }
      })
    ).toBe(true);

    expect(
      isZeroDenominatorVariable({
        name: "L",
        isLagged: false,
        denominatorVariableNames,
        currentValues: { L: 0.01 }
      })
    ).toBe(false);

    expect(
      isZeroDenominatorVariable({
        name: "Y",
        isLagged: false,
        denominatorVariableNames,
        currentValues: { Y: 0 }
      })
    ).toBe(false);
  });

  it("formats zero-denominator warnings for current and lagged tokens", () => {
    expect(
      formatZeroDenominatorWarning({
        name: "L",
        isLagged: false,
        value: 0
      })
    ).toBe("Denominator risk: L ≈ 0 at this period");

    expect(
      formatZeroDenominatorWarning({
        name: "L",
        isLagged: true,
        value: 0,
        laggedPeriodLabel: "period 2"
      })
    ).toBe("Denominator risk: L' ≈ 0 (period 2)");
  });
});
