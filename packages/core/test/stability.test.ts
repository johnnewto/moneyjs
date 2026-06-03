import { describe, expect, it } from "vitest";

import { computeEigenpair, eigenvaluesOfMatrix } from "../src/analysis/eigenvalues";
import {
  buildParticipation,
  classifyStability,
  computeStabilityMetrics,
  DEFAULT_STABILITY_EPS
} from "../src/analysis/stability";
import { runBaseline } from "../src/engine/runBaseline";
import type { ModelDefinition, SimulationOptions } from "../src/model/types";

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

const defaultOptions: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-9,
  maxIterations: 50
};

describe("eigenvaluesOfMatrix", () => {
  it("returns a real eigenvalue for a 1x1 matrix", () => {
    expect(eigenvaluesOfMatrix([[0.8]])).toEqual([
      { re: 0.8, im: 0, abs: 0.8 }
    ]);
  });

  it("returns real eigenvalues for a diagonal matrix", () => {
    const eigenvalues = eigenvaluesOfMatrix([
      [0.5, 0],
      [0, 0.9]
    ]);

    expect(eigenvalues).toHaveLength(2);
    expectClose(eigenvalues[0]?.abs ?? NaN, 0.9, 1e-10);
    expectClose(eigenvalues[1]?.abs ?? NaN, 0.5, 1e-10);
  });

  it("returns complex conjugate eigenvalues for an oscillatory 2x2 matrix", () => {
    const eigenvalues = eigenvaluesOfMatrix([
      [0.9, -0.2],
      [0.2, 0.9]
    ]);

    expect(eigenvalues).toHaveLength(2);
    expectClose(eigenvalues[0]?.re ?? NaN, 0.9, 1e-6);
    expectClose(Math.abs(eigenvalues[0]?.im ?? NaN), 0.2, 1e-6);
    expectClose(eigenvalues[0]?.abs ?? NaN, Math.hypot(0.9, 0.2), 1e-6);
  });
});

describe("computeEigenpair", () => {
  it("reports a small eigenpair residual for a real eigenvalue", () => {
    const matrix = [[0.8]];
    const eigenvalue = { re: 0.8, im: 0, abs: 0.8 };
    const pair = computeEigenpair(matrix, eigenvalue);

    expect(pair.reliable).toBe(true);
    expect(pair.eigenpairResidualRelative).toBeLessThan(1e-8);
  });
});

describe("buildParticipation", () => {
  it("keeps only weights at or above the minimum threshold", () => {
    const participation = buildParticipation(
      ["a", "b", "c"],
      [
        { re: 1, im: 0 },
        { re: 0.005, im: 0 },
        { re: 0.02, im: 0 }
      ],
      0.01
    );

    expect(participation.map((entry) => entry.variable)).toEqual(["a", "c"]);
    expect(participation[0]?.weight).toBeCloseTo(1, 6);
    expect(participation[1]?.weight).toBeCloseTo(0.02, 6);
  });
});

describe("classifyStability", () => {
  it("classifies spectral radius bands with tolerance", () => {
    expect(classifyStability(0.8)).toBe("stable");
    expect(classifyStability(1)).toBe("marginal");
    expect(classifyStability(1 + DEFAULT_STABILITY_EPS / 2)).toBe("marginal");
    expect(classifyStability(1.2)).toBe("unstable");
  });
});

describe("computeStabilityMetrics", () => {
  it("classifies a stable one-variable lag model", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 0.8 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeStabilityMetrics(result, 2);

    expect(analysis.classification).toBe("stable");
    expectClose(analysis.spectralRadius, 0.8, 1e-5);
    expect(analysis.eigenvalues).toHaveLength(1);
    expectClose(analysis.eigenvalues[0]?.abs ?? NaN, 0.8, 1e-5);
    expect(analysis.dominantMode.participation[0]).toEqual({
      variable: "y",
      weight: 1
    });
    expect(analysis.dominantMode.reliable).toBe(true);
    expect(analysis.dominantMode.eigenpairResidualRelative).toBeLessThan(1e-6);
  });

  it("classifies a unit-root stock model as marginal", () => {
    const model: ModelDefinition = {
      equations: [{ name: "h", expression: "lag(h) + s" }],
      externals: {
        s: { kind: "constant", value: 5 }
      },
      initialValues: { h: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeStabilityMetrics(result, 2);

    expect(analysis.classification).toBe("marginal");
    expectClose(analysis.spectralRadius, 1, 1e-5);
    expectClose(analysis.dominantMode.eigenvalue.abs, 1, 1e-5);
    expect(analysis.dominantMode.reliable).toBe(true);
    expect(analysis.nearUnitRootModes).toEqual([]);
  });

  it("classifies an unstable one-variable lag model", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 1.2 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeStabilityMetrics(result, 2);

    expect(analysis.classification).toBe("unstable");
    expectClose(analysis.spectralRadius, 1.2, 1e-5);
  });

  it("detects oscillatory dynamics from complex eigenvalues", () => {
    const model: ModelDefinition = {
      equations: [
        { name: "x", expression: "r * lag(x) - s * lag(y)" },
        { name: "y", expression: "s * lag(x) + r * lag(y)" }
      ],
      externals: {
        r: { kind: "constant", value: 0.9 },
        s: { kind: "constant", value: 0.2 }
      },
      initialValues: { x: 1, y: 0 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeStabilityMetrics(result, 2);
    const dominant = analysis.eigenvalues[0];

    expect(analysis.classification).toBe("stable");
    expectClose(analysis.spectralRadius, Math.hypot(0.9, 0.2), 1e-4);
    expect(Math.abs(dominant?.im ?? 0)).toBeGreaterThan(1e-4);
    expect(analysis.dominantMode.participation.length).toBe(2);
  });

  it("includes transition matrix fields in the stability result", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 0.8 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeStabilityMetrics(result, 2);

    expect(analysis.period).toBe(2);
    expect(analysis.variables).toEqual(["y"]);
    expect(analysis.T).toEqual([[expect.closeTo(0.8, 5)]]);
    expectClose(analysis.residualNorm, 0, 1e-6);
  });
});
