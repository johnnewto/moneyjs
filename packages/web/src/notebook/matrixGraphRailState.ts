import type { SimulationResult } from "@sfcr/core";

import type { VariableUnitMetadata } from "../lib/unitMeta";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { MatrixGraphLegendMode, MatrixGraphRequest, MatrixGraphSeriesEntry } from "./matrixSliceGraph";
import type { NotebookCell } from "./types";

export interface MatrixGraphChartEntry extends MatrixGraphRequest {
  id: string;
  legendMode: MatrixGraphLegendMode;
  pinned: boolean;
}

export function isFreeformMatrixGraphChart(
  chart: Pick<MatrixGraphChartEntry, "matrixCellId">
): boolean {
  return chart.matrixCellId.trim() === "";
}

export function resolveDefaultGraphSourceRunCellId(
  cells: NotebookCell[],
  getResult: (runCellId: string) => SimulationResult | null | undefined
): string | null {
  const candidateIds: string[] = [];
  for (const cell of cells) {
    if (cell.type === "run") {
      candidateIds.push(cell.id);
      continue;
    }
    if (cell.type === "matrix" && cell.sourceRunCellId) {
      candidateIds.push(cell.sourceRunCellId);
      continue;
    }
    if (cell.type === "chart" && cell.sourceRunCellId) {
      candidateIds.push(cell.sourceRunCellId);
    }
  }

  const uniqueIds = Array.from(new Set(candidateIds));
  const withResult = uniqueIds.find((runCellId) => {
    const result = getResult(runCellId);
    return result != null && Object.keys(result.series).length > 0;
  });
  return withResult ?? uniqueIds[0] ?? null;
}

export function createEmptyFreeformMatrixGraphChart({
  createId,
  sourceRunCellId,
  variableDescriptions,
  variableUnitMetadata
}: {
  createId(): string;
  sourceRunCellId: string;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
}): MatrixGraphChartEntry {
  return {
    id: createId(),
    index: -1,
    kind: "column",
    label: "Variables",
    legendMode: "expression",
    matrixCellId: "",
    matrixTitle: "Graph",
    pinned: false,
    series: [],
    sourceRunCellId,
    variableDescriptions,
    variableUnitMetadata
  };
}

export function createFreeformMatrixGraphChart({
  createId,
  seriesEntry,
  sourceRunCellId,
  variableDescriptions,
  variableUnitMetadata
}: {
  createId(): string;
  seriesEntry: MatrixGraphSeriesEntry;
  sourceRunCellId: string;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
}): MatrixGraphChartEntry {
  return {
    ...createEmptyFreeformMatrixGraphChart({
      createId,
      sourceRunCellId,
      variableDescriptions,
      variableUnitMetadata
    }),
    series: [seriesEntry]
  };
}

export function appendEmptyFreeformMatrixGraphChart(
  charts: MatrixGraphChartEntry[],
  createEmpty: () => MatrixGraphChartEntry
): MatrixGraphChartEntry[] {
  const lastChart = charts[charts.length - 1];
  if (lastChart && lastChart.series.length === 0 && isFreeformMatrixGraphChart(lastChart)) {
    return charts;
  }

  return [...charts, createEmpty()];
}

export function applyMatrixGraphRequest(
  charts: MatrixGraphChartEntry[],
  request: MatrixGraphRequest,
  createId: () => string
): MatrixGraphChartEntry[] {
  const nextEntry: MatrixGraphChartEntry = {
    ...request,
    id: createId(),
    legendMode: "expression",
    pinned: false
  };

  if (charts.length === 0) {
    return [nextEntry];
  }

  const lastChart = charts[charts.length - 1];
  if (lastChart && !lastChart.pinned) {
    return [...charts.slice(0, -1), nextEntry];
  }

  return [...charts, nextEntry];
}

export function toggleMatrixGraphChartPin(
  charts: MatrixGraphChartEntry[],
  chartId: string
): MatrixGraphChartEntry[] {
  return charts.map((chart) =>
    chart.id === chartId ? { ...chart, pinned: !chart.pinned } : chart
  );
}

export function toggleMatrixGraphChartLegendMode(
  charts: MatrixGraphChartEntry[],
  chartId: string
): MatrixGraphChartEntry[] {
  return charts.map((chart) =>
    chart.id === chartId
      ? { ...chart, legendMode: chart.legendMode === "cross" ? "expression" : "cross" }
      : chart
  );
}

export function removeMatrixGraphChart(
  charts: MatrixGraphChartEntry[],
  chartId: string
): MatrixGraphChartEntry[] {
  return charts.filter((chart) => chart.id !== chartId);
}

export function addMatrixGraphChartSeries(
  charts: MatrixGraphChartEntry[],
  chartId: string,
  entry: MatrixGraphChartEntry["series"][number]
): MatrixGraphChartEntry[] {
  return charts.map((chart) =>
    chart.id === chartId && !chart.series.some((series) => series.source === entry.source)
      ? { ...chart, series: [entry, ...chart.series] }
      : chart
  );
}

export function removeMatrixGraphChartSeries(
  charts: MatrixGraphChartEntry[],
  chartId: string,
  source: string
): MatrixGraphChartEntry[] {
  return charts.map((chart) =>
    chart.id === chartId
      ? { ...chart, series: chart.series.filter((entry) => entry.source !== source) }
      : chart
  );
}

export function moveMatrixGraphChartSeries(
  charts: MatrixGraphChartEntry[],
  chartId: string,
  source: string,
  direction: "left" | "right"
): MatrixGraphChartEntry[] {
  return charts.map((chart) => {
    if (chart.id !== chartId) {
      return chart;
    }

    const currentIndex = chart.series.findIndex((entry) => entry.source === source);
    if (currentIndex === -1) {
      return chart;
    }

    const nextIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= chart.series.length) {
      return chart;
    }

    const nextSeries = [...chart.series];
    [nextSeries[currentIndex], nextSeries[nextIndex]] = [
      nextSeries[nextIndex]!,
      nextSeries[currentIndex]!
    ];

    return { ...chart, series: nextSeries };
  });
}
