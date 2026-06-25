import { describe, expect, it } from "vitest";

import type { ModelDefinition, SimulationOptions } from "../src/model/types";
import { runSegmentedExogenize } from "../src/engine/runSegmentedExogenize";

const model: ModelDefinition = {
  equations: [
    { name: "x", expression: "rho * TSLAG(x, 1)" },
    { name: "y", expression: "e" }
  ],
  externals: {
    // Observed in-sample path for x that diverges from what its equation produces,
    // plus an exogenous input e that is shorter than the run.
    x: { kind: "series", values: [1, 5, 9] },
    e: { kind: "series", values: [1, 2, 3] }
  },
  coefficients: { rho: 2 },
  initialValues: { x: 1, y: 1 }
};

const options: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-9,
  maxIterations: 50,
  defaultInitialValue: 1e-15,
  simType: "DYNAMIC"
};

describe("runSegmentedExogenize", () => {
  it("pins variables in-sample then releases them, producing one continuous series", () => {
    const result = runSegmentedExogenize(model, options, {
      splitPeriod: 3,
      segment1ExogenizedEquationNames: ["x"]
    });

    // One continuous 5-period series.
    expect(result.series.x?.length).toBe(5);

    // Periods 1-3 follow the pinned observed data (9, not the equation's 2*5 = 10).
    expect(Array.from(result.series.x ?? [])).toEqual([1, 5, 9, 18, 36]);

    // Period 4 is solved from the in-sample tail (2 * 9), confirming lag seeding
    // across the split boundary; period 5 then compounds (2 * 18).
  });

  it("holds shorter exogenous inputs flat over the out-of-sample window", () => {
    const result = runSegmentedExogenize(model, options, {
      splitPeriod: 3,
      segment1ExogenizedEquationNames: ["x"]
    });

    // e only supplies 3 values; it is carried forward at its last value (3) for the
    // released periods, so y tracks it across the whole run.
    expect(Array.from(result.series.y ?? [])).toEqual([1, 2, 3, 3, 3]);
  });

  it("rejects a split boundary that is not before the final period", () => {
    expect(() =>
      runSegmentedExogenize(model, { ...options, periods: 3 }, {
        splitPeriod: 3,
        segment1ExogenizedEquationNames: ["x"]
      })
    ).toThrow(/splitPeriod/);
  });
});
