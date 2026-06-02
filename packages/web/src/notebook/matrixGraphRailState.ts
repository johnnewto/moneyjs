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
