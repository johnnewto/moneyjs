import { describe, expect, it } from "vitest";

import {
  addMatrixGraphChartSeries,
  appendEmptyFreeformMatrixGraphChart,
  applyMatrixGraphRequest,
  createEmptyFreeformMatrixGraphChart,
  createFreeformMatrixGraphChart,
  isFreeformMatrixGraphChart,
  moveMatrixGraphChartSeries,
  removeMatrixGraphChart,
  removeMatrixGraphChartSeries,
  toggleMatrixGraphChartLegendMode,
  toggleMatrixGraphChartPin,
  type MatrixGraphChartEntry
} from "../src/notebook/matrixGraphRailState";
import type { MatrixGraphRequest } from "../src/notebook/matrixSliceGraph";

const baseRequest: MatrixGraphRequest = {
  index: 0,
  kind: "row",
  label: "Loans",
  matrixCellId: "balance-sheet",
  matrixTitle: "BMW balance sheet",
  sourceRunCellId: "baseline-run",
  series: [{ crossLabel: "Firms", label: "-Ld", source: "-Ld", values: [1, 2, 3] }],
  variableDescriptions: new Map(),
  variableUnitMetadata: new Map()
};

function entry(id: string, overrides: Partial<MatrixGraphChartEntry> = {}): MatrixGraphChartEntry {
  return {
    ...baseRequest,
    id,
    legendMode: "expression",
    pinned: false,
    ...overrides
  };
}

describe("matrixGraphRailState", () => {
  it("creates the first chart when the rail is empty", () => {
    const next = applyMatrixGraphRequest([], baseRequest, () => "chart-1");
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("chart-1");
    expect(next[0]?.pinned).toBe(false);
    expect(next[0]?.legendMode).toBe("expression");
  });

  it("replaces the last chart when it is unpinned", () => {
    const current = [entry("chart-1")];
    const next = applyMatrixGraphRequest(
      current,
      { ...baseRequest, label: "Deposits" },
      () => "chart-2"
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("chart-2");
    expect(next[0]?.label).toBe("Deposits");
  });

  it("appends a new chart below when the last chart is pinned", () => {
    const current = [entry("chart-1", { pinned: true })];
    const next = applyMatrixGraphRequest(
      current,
      { ...baseRequest, label: "Deposits" },
      () => "chart-2"
    );

    expect(next).toHaveLength(2);
    expect(next[0]?.pinned).toBe(true);
    expect(next[1]?.id).toBe("chart-2");
    expect(next[1]?.label).toBe("Deposits");
  });

  it("toggles pin state for one chart", () => {
    const current = [entry("chart-1"), entry("chart-2")];
    expect(toggleMatrixGraphChartPin(current, "chart-1")[0]?.pinned).toBe(true);
    expect(toggleMatrixGraphChartPin(toggleMatrixGraphChartPin(current, "chart-1"), "chart-1")[0]?.pinned).toBe(
      false
    );
  });

  it("removes a chart from the stack", () => {
    const current = [entry("chart-1", { pinned: true }), entry("chart-2")];
    expect(removeMatrixGraphChart(current, "chart-1")).toEqual([entry("chart-2")]);
  });

  it("toggles legend mode for one chart", () => {
    const current = [entry("chart-1")];
    expect(toggleMatrixGraphChartLegendMode(current, "chart-1")[0]?.legendMode).toBe("cross");
    expect(
      toggleMatrixGraphChartLegendMode(toggleMatrixGraphChartLegendMode(current, "chart-1"), "chart-1")[0]
        ?.legendMode
    ).toBe("expression");
  });

  it("adds a trace to an existing chart", () => {
    const current = [entry("chart-1")];
    const next = addMatrixGraphChartSeries(current, "chart-1", {
      crossLabel: "Households",
      label: "Cd",
      source: "Cd",
      values: [4, 5, 6]
    });

    expect(next[0]?.series).toHaveLength(2);
    expect(next[0]?.series[0]?.source).toBe("Cd");
    expect(next[0]?.series[1]?.source).toBe("-Ld");
  });

  it("removes a trace including the last series", () => {
    const current = [
      entry("chart-1", {
        series: [
          { crossLabel: "Firms", label: "-Ld", source: "-Ld", values: [1, 2, 3] },
          { crossLabel: "Households", label: "Cd", source: "Cd", values: [4, 5, 6] }
        ]
      })
    ];

    expect(removeMatrixGraphChartSeries(current, "chart-1", "Cd")[0]?.series).toHaveLength(1);
    expect(removeMatrixGraphChartSeries(current, "chart-1", "-Ld")[0]?.series).toHaveLength(1);
    expect(removeMatrixGraphChartSeries([entry("chart-1")], "chart-1", "-Ld")[0]?.series).toEqual([]);
  });

  it("creates a freeform chart from a variable", () => {
    const chart = createFreeformMatrixGraphChart({
      createId: () => "chart-free",
      seriesEntry: {
        crossLabel: "Income",
        label: "Y",
        source: "Y",
        values: [1, 2, 3]
      },
      sourceRunCellId: "baseline-run",
      variableDescriptions: new Map([["Y", "Income"]]),
      variableUnitMetadata: new Map()
    });

    expect(isFreeformMatrixGraphChart(chart)).toBe(true);
    expect(chart.series.map((entry) => entry.source)).toEqual(["Y"]);
    expect(chart.matrixCellId).toBe("");
  });

  it("creates an empty freeform chart for the variable picker", () => {
    const chart = createEmptyFreeformMatrixGraphChart({
      createId: () => "chart-empty",
      sourceRunCellId: "baseline-run",
      variableDescriptions: new Map(),
      variableUnitMetadata: new Map()
    });

    expect(isFreeformMatrixGraphChart(chart)).toBe(true);
    expect(chart.series).toEqual([]);
  });

  it("appends an empty freeform chart below existing charts", () => {
    const current = [entry("chart-1")];
    const next = appendEmptyFreeformMatrixGraphChart(current, () =>
      createEmptyFreeformMatrixGraphChart({
        createId: () => "chart-2",
        sourceRunCellId: "baseline-run",
        variableDescriptions: new Map(),
        variableUnitMetadata: new Map()
      })
    );

    expect(next).toHaveLength(2);
    expect(next[1]?.id).toBe("chart-2");
    expect(next[1]?.series).toEqual([]);
  });

  it("does not append another empty freeform chart when the last one is already empty", () => {
    const current = [
      entry("chart-1"),
      createEmptyFreeformMatrixGraphChart({
        createId: () => "chart-empty",
        sourceRunCellId: "baseline-run",
        variableDescriptions: new Map(),
        variableUnitMetadata: new Map()
      })
    ];

    expect(
      appendEmptyFreeformMatrixGraphChart(current, () =>
        createEmptyFreeformMatrixGraphChart({
          createId: () => "chart-extra",
          sourceRunCellId: "baseline-run",
          variableDescriptions: new Map(),
          variableUnitMetadata: new Map()
        })
      )
    ).toBe(current);
  });

  it("moves a trace left and right", () => {
    const current = [
      entry("chart-1", {
        series: [
          { crossLabel: "Firms", label: "-Ld", source: "-Ld", values: [1, 2, 3] },
          { crossLabel: "Households", label: "Cd", source: "Cd", values: [4, 5, 6] },
          { crossLabel: "Banks", label: "Ms", source: "Ms", values: [7, 8, 9] }
        ]
      })
    ];

    const movedRight = moveMatrixGraphChartSeries(current, "chart-1", "Cd", "right");
    expect(movedRight[0]?.series.map((series) => series.source)).toEqual(["-Ld", "Ms", "Cd"]);

    const movedLeft = moveMatrixGraphChartSeries(current, "chart-1", "Cd", "left");
    expect(movedLeft[0]?.series.map((series) => series.source)).toEqual(["Cd", "-Ld", "Ms"]);

    expect(moveMatrixGraphChartSeries(current, "chart-1", "-Ld", "left")[0]?.series.map((series) => series.source)).toEqual([
      "-Ld",
      "Cd",
      "Ms"
    ]);
  });
});
