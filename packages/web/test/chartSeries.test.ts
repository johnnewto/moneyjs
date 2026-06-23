import { describe, expect, it } from "vitest";

import type { ModelDefinition, SimulationOptions, SimulationResult } from "@sfcr/core";
import { buildCompactChartCells } from "@sfcr/notebook-core";

import {
  appendChartVariable,
  buildResolvedChartSeries,
  buildResolvedChartSeriesRanges,
  removeChartSeriesByDisplayName,
  resolveChartSeriesDisplayNames,
  resolveChartSeriesSpecs,
  resolveChartSeriesUnit,
  suggestChartAxisGroups
} from "../src/notebook/chartSeries";
import type { ChartCell } from "../src/notebook/types";

const model: ModelDefinition = {
  equations: [],
  externals: {},
  initialValues: {}
};

const options: SimulationOptions = {
  periods: 4,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50,
  defaultInitialValue: 1e-15
};

function createResult(series: Record<string, number[]>): SimulationResult {
  return {
    blocks: [],
    model,
    options,
    series: Object.fromEntries(
      Object.entries(series).map(([name, values]) => [name, new Float64Array(values)])
    )
  };
}

describe("chartSeries", () => {
  it("maps variables shorthand to expression specs", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      variables: ["y", "c"]
    };

    expect(resolveChartSeriesSpecs(cell)).toEqual([{ expression: "y" }, { expression: "c" }]);
  });

  it("prefers explicit series entries over variables", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      variables: ["y"],
      series: [{ expression: "100 * h_h / v", label: "Money share" }]
    };

    expect(resolveChartSeriesSpecs(cell)).toEqual([
      { expression: "100 * h_h / v", label: "Money share" }
    ]);
  });

  it("evaluates expression series from run results", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      series: [
        { expression: "100 * h_h / v", label: "Money share" },
        { expression: "100 * b_h / v", label: "Bill share" }
      ]
    };
    const result = createResult({
      h_h: [10, 20, 30],
      b_h: [30, 60, 90],
      v: [40, 80, 120]
    });

    expect(buildResolvedChartSeries(cell, result)).toEqual([
      {
        highlightKey: "100 * h_h / v",
        name: "Money share",
        values: [25, 25, 25]
      },
      {
        highlightKey: "100 * b_h / v",
        name: "Bill share",
        values: [75, 75, 75]
      }
    ]);
  });

  it("uses explicit series unit over model inference", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      series: [{ expression: "100 * h_h / v", label: "Money share", unit: "%" }]
    };

    expect(
      resolveChartSeriesUnit(
        { highlightKey: "100 * h_h / v" },
        cell,
        new Map()
      )
    ).toBe("%");
  });

  it("merges per-entry range with seriesRanges by display name", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      series: [{ expression: "y", label: "Income", range: { min: 0, max: 10 } }],
      seriesRanges: {
        Income: { includeZero: true }
      }
    };
    const resolved = buildResolvedChartSeries(cell, createResult({ y: [1, 2, 3] }));

    expect(buildResolvedChartSeriesRanges(cell, resolved)).toEqual({
      Income: { min: 0, max: 10 }
    });
  });

  it("deduplicates display names for repeated labels", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      series: [
        { expression: "y", label: "Income" },
        { expression: "yd", label: "Income" }
      ]
    };

    expect(resolveChartSeriesDisplayNames(cell)).toEqual(["Income", "Income (yd)"]);
  });

  it("supports add and remove helpers for series mode", () => {
    const cell: ChartCell = {
      id: "chart-1",
      type: "chart",
      title: "Chart",
      sourceRunCellId: "run-1",
      series: [{ expression: "100 * h_h / v", label: "Money share" }]
    };

    const withAdded = appendChartVariable(cell, "v");
    expect(withAdded.series).toEqual([
      { expression: "v" },
      { expression: "100 * h_h / v", label: "Money share" }
    ]);

    const withBoth = {
      ...withAdded,
      series: [
        ...(withAdded.series ?? []),
        { expression: "100 * b_h / v", label: "Bill share" }
      ]
    };
    const removed = removeChartSeriesByDisplayName(withBoth, "Bill share");
    expect(removed.series?.map((entry) => entry.label ?? entry.expression)).toEqual(["v", "Money share"]);
  });

  it("round-trips compact chart series from YAML helpers", () => {
    const [cell] = buildCompactChartCells(
      [
        {
          title: "Portfolio shares",
          series: [
            { expression: "100 * h_h / v", label: "Money share" },
            { expression: "100 * b_h / v", label: "Bill share" }
          ],
          timeRangeInclusive: [2, 25],
          axisMode: "separate"
        }
      ],
      "scenario-1-run"
    );

    expect(cell).toMatchObject({
      type: "chart",
      sourceRunCellId: "scenario-1-run",
      series: [
        { expression: "100 * h_h / v", label: "Money share" },
        { expression: "100 * b_h / v", label: "Bill share" }
      ],
      timeRangeInclusive: [2, 25],
      axisMode: "separate"
    });
    expect(cell.variables).toBeUndefined();
  });

  it("parses axisGroups from compact chart YAML and trims blanks", () => {
    const [cell] = buildCompactChartCells(
      [
        {
          title: "Baseline headline variables",
          variables: ["Y", "Cd", "Mh", "W"],
          axisGroups: [["Y", " Cd ", "Mh"], ["W"], ["  "]]
        }
      ],
      "baseline-run"
    );

    expect(cell?.axisGroups).toEqual([["Y", "Cd", "Mh"], ["W"]]);
  });

  it("suggests axis groups by clustering similar magnitudes", () => {
    const suggestion = suggestChartAxisGroups([
      { name: "Y", values: [100, 110, 120] },
      { name: "Cd", values: [80, 85, 90] },
      { name: "Mh", values: [95, 100, 105] },
      { name: "W", values: [1.1, 1.2, 1.3] }
    ]);

    expect(suggestion).toEqual([["Y", "Cd", "Mh"], ["W"]]);
  });

  it("preserves chart order across and within suggested groups", () => {
    const suggestion = suggestChartAxisGroups([
      { name: "big1", values: [900, 950] },
      { name: "small1", values: [2, 3] },
      { name: "big2", values: [800, 850] },
      { name: "small2", values: [1, 4] }
    ]);

    expect(suggestion).toEqual([["big1", "big2"], ["small1", "small2"]]);
  });

  it("returns a single group when all magnitudes are comparable", () => {
    const suggestion = suggestChartAxisGroups([
      { name: "A", values: [10, 12] },
      { name: "B", values: [14, 16] }
    ]);

    expect(suggestion).toEqual([["A", "B"]]);
  });

  it("ignores series without finite values", () => {
    const suggestion = suggestChartAxisGroups([
      { name: "A", values: [10, 12] },
      { name: "B", values: [Number.NaN, Number.NaN] }
    ]);

    expect(suggestion).toEqual([["A"]]);
  });
});
