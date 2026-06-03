import { describe, expect, it } from "vitest";

import { computeTransitionMatrix } from "../src/analysis/transitionMatrix";
import { runBaseline } from "../src/engine/runBaseline";
import type { ModelDefinition, SimulationOptions } from "../src/model/types";

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function expectMatrixClose(
  actual: number[][],
  expected: number[][],
  tolerance: number
): void {
  expect(actual.length).toBe(expected.length);
  for (let row = 0; row < expected.length; row += 1) {
    expect(actual[row]?.length).toBe(expected[row]?.length);
    for (let col = 0; col < (expected[row]?.length ?? 0); col += 1) {
      expectClose(actual[row]?.[col] ?? NaN, expected[row]?.[col] ?? NaN, tolerance);
    }
  }
}

const defaultOptions: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-9,
  maxIterations: 50
};

describe("computeTransitionMatrix", () => {
  it("returns T = [[a]] for a one-variable lag model", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 0.8 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);

    expect(analysis.variables).toEqual(["y"]);
    expectClose(analysis.residualNorm, 0, 1e-6);
    expectMatrixClose(analysis.A0, [[-1]], 1e-5);
    expectMatrixClose(analysis.A1, [[0.8]], 1e-5);
    expectMatrixClose(analysis.T, [[0.8]], 1e-5);
  });

  it("returns T = [[1]] for a one-variable stock model", () => {
    const model: ModelDefinition = {
      equations: [{ name: "h", expression: "lag(h) + s" }],
      externals: {
        s: { kind: "constant", value: 5 }
      },
      initialValues: { h: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);

    expect(analysis.variables).toEqual(["h"]);
    expectClose(analysis.residualNorm, 0, 1e-6);
    expectMatrixClose(analysis.T, [[1]], 1e-5);
  });

  it("returns the lag coefficient matrix for a two-variable linear model", () => {
    const model: ModelDefinition = {
      equations: [
        { name: "x", expression: "a * lag(x) + b * lag(y)" },
        { name: "y", expression: "c * lag(x) + d * lag(y)" }
      ],
      externals: {
        a: { kind: "constant", value: 0.5 },
        b: { kind: "constant", value: 0.1 },
        c: { kind: "constant", value: 0.2 },
        d: { kind: "constant", value: 0.7 }
      },
      initialValues: { x: 1, y: 2 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);

    expect(analysis.variables).toEqual(["x", "y"]);
    expectClose(analysis.residualNorm, 0, 1e-6);
    expectMatrixClose(
      analysis.T,
      [
        [0.5, 0.1],
        [0.2, 0.7]
      ],
      1e-5
    );
  });

  it("captures simultaneous current-period structure in A0", () => {
    const model: ModelDefinition = {
      equations: [
        { name: "Y", expression: "C + G" },
        { name: "C", expression: "alpha * Y + beta * lag(C)" }
      ],
      externals: {
        G: { kind: "constant", value: 20 },
        alpha: { kind: "constant", value: 0.6 },
        beta: { kind: "constant", value: 0.2 }
      },
      initialValues: { C: 10 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);
    const beta = 0.2;
    const alpha = 0.6;
    const denominator = 1 - alpha;
    const lagEffect = beta / denominator;

    expect(analysis.variables).toEqual(["Y", "C"]);
    expectClose(analysis.residualNorm, 0, 1e-6);
    expectMatrixClose(
      analysis.A0,
      [
        [-1, 1],
        [alpha, -1]
      ],
      1e-5
    );
    expectMatrixClose(
      analysis.A1,
      [
        [0, 0],
        [0, beta]
      ],
      1e-5
    );
    expectMatrixClose(
      analysis.T,
      [
        [0, lagEffect],
        [0, lagEffect]
      ],
      1e-5
    );
  });

  it("does not mutate the underlying simulation series", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 0.8 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const before = Array.from(result.series.y ?? []);
    computeTransitionMatrix(result, 2);
    const after = Array.from(result.series.y ?? []);

    expect(after).toEqual(before);
  });

  it("rejects period 0", () => {
    const result = runBaseline(
      {
        equations: [{ name: "y", expression: "lag(y)" }],
        externals: {},
        initialValues: { y: 1 }
      },
      defaultOptions
    );

    expect(() => computeTransitionMatrix(result, 0)).toThrow(
      "Transition matrix period must be greater than 0"
    );
  });

  it("rejects out-of-range periods", () => {
    const result = runBaseline(
      {
        equations: [{ name: "y", expression: "lag(y)" }],
        externals: {},
        initialValues: { y: 1 }
      },
      defaultOptions
    );

    expect(() => computeTransitionMatrix(result, defaultOptions.periods)).toThrow(
      `Transition matrix period must be less than ${defaultOptions.periods}`
    );
  });
});
