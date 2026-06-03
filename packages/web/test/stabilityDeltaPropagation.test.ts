import { describe, expect, it } from "vitest";

import { computeStabilityMetrics, runBaseline } from "@sfcr/core";

import {
  buildStabilityDeltaPropagationView,
  formatRelativeGain,
  multiplicativeGain,
  multiplyTransitionMatrix
} from "../src/lib/stabilityDeltaPropagation";

describe("multiplicativeGain", () => {
  it("returns the level ratio", () => {
    expect(multiplicativeGain(84.957, 66.6435)).toBeCloseTo(1.2748, 4);
  });

  it("returns null when the denominator is near zero", () => {
    expect(multiplicativeGain(1, 0)).toBeNull();
    expect(formatRelativeGain(null)).toBe("—");
  });
});

describe("multiplyTransitionMatrix", () => {
  it("applies T to a lag shock vector", () => {
    const deltaCurrent = multiplyTransitionMatrix([[0.8]], [1]);
    expect(deltaCurrent[0]).toBeCloseTo(0.8, 6);
  });
});

describe("buildStabilityDeltaPropagationView", () => {
  it("returns zero response for no shock", () => {
    const result = runBaseline(
      {
        equations: [{ name: "y", expression: "0.8 * lag(y) + 10" }],
        externals: {},
        initialValues: { y: 1 }
      },
      {
        periods: 5,
        solverMethod: "GAUSS_SEIDEL",
        tolerance: 1e-9,
        maxIterations: 20
      }
    );

    const analysis = computeStabilityMetrics(result, 2);
    const view = buildStabilityDeltaPropagationView(analysis, result, "zero");

    expect(view?.rows).toHaveLength(1);
    expect(view?.rows[0]?.deltaLag).toBe(0);
    expect(view?.rows[0]?.deltaCurrent).toBe(0);
    expect(view?.rows[0]?.xLinear).toBeCloseTo(view?.rows[0]?.xStar ?? NaN, 6);
  });

  it("propagates lag increment through T for a scalar model", () => {
    const result = runBaseline(
      {
        equations: [{ name: "y", expression: "0.8 * lag(y) + 10" }],
        externals: {},
        initialValues: { y: 1 }
      },
      {
        periods: 5,
        solverMethod: "GAUSS_SEIDEL",
        tolerance: 1e-9,
        maxIterations: 20
      }
    );

    const analysis = computeStabilityMetrics(result, 2);
    const view = buildStabilityDeltaPropagationView(analysis, result, "lag-increment");

    expect(view?.rows[0]?.deltaCurrent).toBeCloseTo(
      (view?.rows[0]?.deltaLag ?? 0) * 0.8,
      4
    );
    expect(view?.rows[0]?.xLinear).toBeCloseTo(
      (view?.rows[0]?.xStar ?? 0) + (view?.rows[0]?.deltaCurrent ?? 0),
      6
    );
    expect(view?.rows[0]?.linearGain).not.toBeNull();
    expect(view?.rows[0]?.pathGain).not.toBeNull();
  });
});
