import { describe, expect, it } from "vitest";

import type { SimulationResult } from "@sfcr/core";

import {
  extractPartialRunResult,
  isPartialSimulationResult,
  normalizeSimulationResultSeries,
  partialResultFailurePeriodIndex,
  resolvePartialRunMaxPeriodIndex
} from "../src/lib/partialRunResult";

function buildPartialResult(period: number): SimulationResult {
  return {
    blocks: [],
    model: { equations: [], externals: {}, initialValues: {} },
    options: {
      periods: period + 1,
      solverMethod: "GAUSS_SEIDEL",
      tolerance: 1e-8,
      maxIterations: 10
    },
    runMetadata: {
      partial: true,
      convergenceFailure: {
        period,
        blockId: 1,
        blockVariables: ["x"],
        solverMethod: "Gauss-Seidel",
        tolerance: 1e-8,
        maxIterations: 10,
        iterationsUsed: 10,
        variables: [],
        nonFiniteVariables: [],
        worstVariables: []
      }
    },
    series: {
      x: new Float64Array(Array.from({ length: period + 1 }, (_, index) => index))
    }
  };
}

describe("partialRunResult", () => {
  it("extracts partial results from worker-style errors", () => {
    const partialResult = buildPartialResult(3);
    const error = Object.assign(new Error("failed"), { partialResult });

    expect(extractPartialRunResult(error)?.series.x).toEqual(new Float64Array([0, 1, 2, 3]));
    expect(extractPartialRunResult(new Error("no partial"))).toBeNull();
  });

  it("normalizes plain arrays back to Float64Array", () => {
    const normalized = normalizeSimulationResultSeries({
      ...buildPartialResult(1),
      series: { x: [0, 1] as unknown as Float64Array }
    });

    expect(normalized.series.x).toBeInstanceOf(Float64Array);
    expect(Array.from(normalized.series.x ?? [])).toEqual([0, 1]);
  });

  it("reports partial metadata helpers", () => {
    const partialResult = buildPartialResult(4);
    expect(isPartialSimulationResult(partialResult)).toBe(true);
    expect(partialResultFailurePeriodIndex(partialResult)).toBe(4);
  });

  it("caps scrubber range to partial error outputs", () => {
    const partialResult = buildPartialResult(2);
    expect(
      resolvePartialRunMaxPeriodIndex({
        outputs: {
          "baseline-run": {
            type: "result",
            result: partialResult
          }
        },
        status: {
          "baseline-run": "error"
        }
      })
    ).toBe(2);
  });
});
