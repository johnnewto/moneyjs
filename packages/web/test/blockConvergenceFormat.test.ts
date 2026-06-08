import { describe, expect, it } from "vitest";

import {
  describeBlockSeedSource,
  formatBlockConvergenceValue,
  listBlockVariableValues,
  shouldShowBlockFinalValues
} from "../src/lib/blockConvergenceFormat";

describe("blockConvergenceFormat", () => {
  it("formats tiny and large seed values readably", () => {
    expect(formatBlockConvergenceValue(1e-15)).toBe("1.000e-15");
    expect(formatBlockConvergenceValue(80)).toBe("80.0000");
    expect(formatBlockConvergenceValue(8.67e44)).toBe("8.670e+44");
  });

  it("lists variables in block order", () => {
    expect(
      listBlockVariableValues(["Y", "Cd"], { Y: 80, Cd: 1e-15 })
    ).toEqual([
      { name: "Y", value: "80.0000" },
      { name: "Cd", value: "1.000e-15" }
    ]);
  });

  it("describes Gauss-Seidel seeding", () => {
    expect(describeBlockSeedSource("current_slot")).toContain("current-period workspace");
  });

  it("shows converged values only when they differ from the seed", () => {
    expect(
      shouldShowBlockFinalValues("converged", { Y: 1e-15 }, { Y: 80 })
    ).toBe(true);
    expect(
      shouldShowBlockFinalValues("converged", { Y: 80 }, { Y: 80.0000000001 })
    ).toBe(false);
    expect(shouldShowBlockFinalValues("max_iterations", { Y: 1e-15 }, { Y: 80 })).toBe(false);
  });
});
