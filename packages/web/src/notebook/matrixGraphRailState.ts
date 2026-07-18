import type { MatrixGraphLegendMode, MatrixGraphRequest } from "./matrixSliceGraph";

export interface MatrixGraphChartEntry extends MatrixGraphRequest {
  id: string;
  legendMode: MatrixGraphLegendMode;
  pinned: boolean;
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
    chart.id === chartId && chart.series.length > 1
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
