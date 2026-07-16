import { describe, expect, it } from "vitest";

import type { ModelDefinition, SimulationOptions, SimulationResult } from "@sfcr/core";

import {
  applyChartCompareMode,
  canApplyChartCompareMode,
  filterReferenceTracesForCompareMode,
  getNextChartCompareMode,
  resolveChartCompareMode,
  resolveCompareModeSharedRange
} from "../src/notebook/chartCompareMode";
import { buildResolvedChartSeries } from "../src/notebook/chartSeries";
import type { ChartCell, RunCell } from "../src/notebook/types";

const model: ModelDefinition = {
  equations: [{ name: "Y", expression: "G" }],
  externals: {
    G: { kind: "constant", value: 20 }
  },
  initialValues: {}
};

const options: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50,
  defaultInitialValue: 1e-15
};

function createResult(values: number[]): SimulationResult {
  return {
    blocks: [],
    model,
    options: { ...options, periods: values.length },
    series: {
      Y: new Float64Array(values)
    }
  };
}

const scenarioRun: RunCell = {
  id: "scenario-run",
  baselineRunCellId: "baseline-run",
  baselineStartPeriod: 3,
  mode: "scenario",
  periods: 3,
  resultKey: "scenario",
  sourceModelId: "model-1",
  title: "Scenario",
  type: "run",
  scenario: {
    shocks: [
      {
        rangeInclusive: [1, 3],
        variables: {
          G: { kind: "constant", value: 30 }
        }
      }
    ]
  }
};

const chart: ChartCell = {
  id: "chart-1",
  sourceRunCellId: "scenario-run",
  title: "Chart",
  type: "chart",
  variables: ["Y"],
  compareMode: "relative"
};

describe("chartCompareMode", () => {
  it("cycles levels → relative → percent → levels", () => {
    expect(getNextChartCompareMode("levels")).toBe("relative");
    expect(getNextChartCompareMode("relative")).toBe("percent");
    expect(getNextChartCompareMode("percent")).toBe("levels");
  });

  it("defaults compareMode to levels", () => {
    expect(resolveChartCompareMode({})).toBe("levels");
    expect(resolveChartCompareMode({ compareMode: "percent" })).toBe("percent");
  });

  it("divides by the aligned baseline path in relative mode", () => {
    // Baseline periods 1..5: 10,20,30,40,50
    // Scenario starts at baseline period 3 for 3 periods → baseline slice 30,40,50
    // Scenario values: 33,44,55 → ratios 1.1, 1.1, 1.1
    const baselineResult = createResult([10, 20, 30, 40, 50]);
    const scenarioResult = createResult([33, 44, 55]);
    const levelSeries = buildResolvedChartSeries(chart, scenarioResult);

    const series = applyChartCompareMode({
      cell: chart,
      series: levelSeries,
      sourceRunCell: scenarioRun,
      baselineStartPeriod: 3,
      baselineResult
    });

    expect(series).toHaveLength(1);
    expect(series[0]?.values[0]).toBeCloseTo(1.1);
    expect(series[0]?.values[1]).toBeCloseTo(1.1);
    expect(series[0]?.values[2]).toBeCloseTo(1.1);
  });

  it("computes percent vs baseline and sets unit to %", () => {
    const baselineResult = createResult([10, 20, 50, 40, 25]);
    const scenarioResult = createResult([55, 60, 50]);
    const levelSeries = buildResolvedChartSeries(chart, scenarioResult);

    const series = applyChartCompareMode({
      cell: { ...chart, compareMode: "percent" },
      series: levelSeries,
      sourceRunCell: scenarioRun,
      baselineStartPeriod: 3,
      baselineResult
    });

    expect(series[0]?.unit).toBe("%");
    expect(series[0]?.values[0]).toBeCloseTo(10); // (55-50)/50
    expect(series[0]?.values[1]).toBeCloseTo(50); // (60-40)/40
    expect(series[0]?.values[2]).toBeCloseTo(100); // (50-25)/25
  });

  it("returns NaN for relative and percent when baseline is zero", () => {
    const baselineResult = createResult([0, 0, 0, 0, 0]);
    const scenarioResult = createResult([1, 2, 3]);
    const levelSeries = buildResolvedChartSeries(chart, scenarioResult);

    const relative = applyChartCompareMode({
      cell: { ...chart, compareMode: "relative" },
      series: levelSeries,
      sourceRunCell: scenarioRun,
      baselineStartPeriod: 1,
      baselineResult
    });
    const percent = applyChartCompareMode({
      cell: { ...chart, compareMode: "percent" },
      series: levelSeries,
      sourceRunCell: scenarioRun,
      baselineStartPeriod: 1,
      baselineResult
    });

    expect(relative[0]?.values.every((value) => Number.isNaN(value))).toBe(true);
    expect(percent[0]?.values.every((value) => Number.isNaN(value))).toBe(true);
  });

  it("falls back to levels when baseline is unavailable", () => {
    const scenarioResult = createResult([33, 44, 55]);
    const levelSeries = buildResolvedChartSeries(chart, scenarioResult);

    const series = applyChartCompareMode({
      cell: chart,
      series: levelSeries,
      sourceRunCell: scenarioRun,
      baselineStartPeriod: 3,
      baselineResult: null
    });

    expect(series[0]?.values).toEqual(levelSeries[0]?.values);
  });

  it("filters baseline reference overlays in relative/percent modes", () => {
    expect(filterReferenceTracesForCompareMode(["baseline", "observed"], "levels")).toEqual([
      "baseline",
      "observed"
    ]);
    expect(filterReferenceTracesForCompareMode(["baseline", "observed"], "relative")).toEqual([
      "observed"
    ]);
  });

  it("prefers includeZero on sharedRange only for percent mode", () => {
    expect(
      resolveCompareModeSharedRange({ compareMode: "percent", sharedRange: { min: -5 } }, true)
    ).toEqual({ includeZero: true, min: -5 });
    expect(resolveCompareModeSharedRange({ compareMode: "relative" }, true)).toBeUndefined();
    expect(resolveCompareModeSharedRange({ compareMode: "levels" }, true)).toBeUndefined();
    expect(
      canApplyChartCompareMode({
        sourceRunCell: scenarioRun,
        baselineStartPeriod: 3,
        baselineResult: createResult([1])
      })
    ).toBe(true);
  });
});
