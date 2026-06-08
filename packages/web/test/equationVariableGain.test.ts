import { describe, expect, it } from "vitest";

import {
  computeEquationVariableGain,
  formatEquationVariableGain
} from "../src/lib/equationVariableGain";

describe("equationVariableGain", () => {
  it("computes d(x)/x' as the relative increment over the lagged value", () => {
    expect(computeEquationVariableGain(110, 100)).toBeCloseTo(0.1, 6);
    expect(computeEquationVariableGain(90, 100)).toBeCloseTo(-0.1, 6);
  });

  it("returns null when the lagged value is too small or missing", () => {
    expect(computeEquationVariableGain(10, 0)).toBeNull();
    expect(computeEquationVariableGain(10, undefined)).toBeNull();
    expect(computeEquationVariableGain(undefined, 5)).toBeNull();
  });

  it("formats gain values for display", () => {
    expect(formatEquationVariableGain(0.1234)).toBe("0.1234");
    expect(formatEquationVariableGain(null)).toBe("—");
  });
});
