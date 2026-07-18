import type { SimulationResult } from "@sfcr/core";

import { ResultChart } from "../../components/ResultChart";
import type { MatrixGraphSliceHighlight } from "../graphDocumentHighlight";
import type { MatrixGraphChartEntry } from "../matrixGraphRailState";
import {
  collectMatrixGraphSliceSeries,
  listAddableMatrixGraphSources,
  matrixGraphChartHasExternalSeries,
  matrixGraphCrossLegendHint,
  resolveMatrixGraphChartSeries
} from "../matrixSliceGraph";
import type { MatrixCell, NotebookCell } from "../types";

function formatMatrixGraphTitle(chart: Pick<MatrixGraphChartEntry, "kind" | "label" | "matrixTitle">): string {
  const sliceKind = chart.kind === "row" ? "Row" : "Column";
  return `${chart.matrixTitle}: ${sliceKind} ${chart.label}`;
}

function resolveMatrixGraphSlicePool(
  chart: MatrixGraphChartEntry,
  cells: NotebookCell[],
  getResult: (runCellId: string) => SimulationResult | null | undefined
) {
  const matrixCell = cells.find(
    (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === chart.matrixCellId
  );
  const result = getResult(chart.sourceRunCellId);
  if (!matrixCell || !result) {
    return [];
  }

  return collectMatrixGraphSliceSeries(matrixCell, chart.kind, chart.index, result);
}

export function MatrixGraphRailPanel({
  cells,
  charts,
  getResult,
  onAddChartSeries,
  onDismissChart,
  onGraphExpressionHighlightChange,
  onGraphSliceHighlightChange,
  onMoveChartSeries,
  onRemoveChartSeries,
  onToggleChartLegendMode,
  onToggleChartPin,
  selectedPeriodIndex
}: {
  cells: NotebookCell[];
  charts: MatrixGraphChartEntry[];
  getResult(runCellId: string): SimulationResult | null | undefined;
  onAddChartSeries(chartId: string, source: string): void;
  onDismissChart(chartId: string): void;
  onGraphExpressionHighlightChange?(expression: string | null): void;
  onGraphSliceHighlightChange?(slice: MatrixGraphSliceHighlight | null): void;
  onMoveChartSeries?(chartId: string, source: string, direction: "left" | "right"): void;
  onRemoveChartSeries(chartId: string, source: string): void;
  onToggleChartLegendMode(chartId: string): void;
  onToggleChartPin(chartId: string): void;
  selectedPeriodIndex: number;
}) {
  if (charts.length === 0) {
    return (
      <section id="notebook-graph-panel" className="notebook-sidebar-panel notebook-graph-rail-panel" role="tabpanel">
        <div className="panel-header">
          <h2>Graph</h2>
          <p className="panel-subtitle">
            Click a matrix row or column label to graph signed entries. Pin a chart to keep it while exploring
            other slices. Use Labels to show row or column names in the legend.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="notebook-graph-panel" className="notebook-sidebar-panel notebook-graph-rail-panel" role="tabpanel">
      <div className="notebook-graph-rail-chart-stack">
        {charts.map((chart) => {
          const legendMode = chart.legendMode ?? "expression";
          const slicePool = resolveMatrixGraphSlicePool(chart, cells, getResult);
          const result = getResult(chart.sourceRunCellId);
          const chartSeries = resolveMatrixGraphChartSeries(chart.series, legendMode, result);
          const seriesLength = Math.max(
            0,
            ...chartSeries.map((entry) => entry.values.length),
            ...(result ? Object.values(result.series).map((values) => values.length) : [0])
          );
          const title = formatMatrixGraphTitle(chart);
          const addVariableOptions = listAddableMatrixGraphSources(chart.series, slicePool, result);
          const addVariableDescriptions = new Map(chart.variableDescriptions);
          for (const entry of slicePool) {
            if (!addVariableDescriptions.has(entry.source)) {
              addVariableDescriptions.set(entry.source, entry.crossLabel);
            }
          }
          const useSeparateAxes = matrixGraphChartHasExternalSeries(chart.series, slicePool);

          const canShowChart = chartSeries.length > 0 || addVariableOptions.length > 0;

          return (
            <div key={chart.id} className="notebook-graph-rail-chart">
              {!canShowChart ? (
                <div className="status-hint">{title}: no graphable signed entries.</div>
              ) : (
                <ResultChart
                  addVariableOptions={addVariableOptions}
                  axisMode={useSeparateAxes ? "separate" : "shared"}
                  graphSlice={{
                    index: chart.index,
                    kind: chart.kind,
                    matrixCellId: chart.matrixCellId
                  }}
                  isPinned={chart.pinned}
                  legendMode={legendMode}
                  legendModeCrossHint={matrixGraphCrossLegendHint(chart.kind)}
                  onAddVariable={(source) => onAddChartSeries(chart.id, source)}
                  onDismiss={() => onDismissChart(chart.id)}
                  onGraphExpressionHighlightChange={onGraphExpressionHighlightChange}
                  onGraphSliceHighlightChange={onGraphSliceHighlightChange}
                  onMoveVariable={
                    onMoveChartSeries
                      ? (displayName, direction) => {
                          const match = chartSeries.find(
                            (entry) =>
                              entry.name === displayName || entry.highlightKey === displayName
                          );
                          if (match?.highlightKey) {
                            onMoveChartSeries(chart.id, match.highlightKey, direction);
                          }
                        }
                      : undefined
                  }
                  onRemoveVariable={(displayName) => {
                    const match = chartSeries.find(
                      (entry) => entry.name === displayName || entry.highlightKey === displayName
                    );
                    if (match?.highlightKey) {
                      onRemoveChartSeries(chart.id, match.highlightKey);
                    }
                  }}
                  onToggleLegendMode={() => onToggleChartLegendMode(chart.id)}
                  onTogglePin={() => onToggleChartPin(chart.id)}
                  selectedIndex={selectedPeriodIndex}
                  series={chartSeries}
                  sharedRange={useSeparateAxes ? undefined : { includeZero: true }}
                  showAxisSummary={false}
                  title={title}
                  timeRangeDefaults={{
                    endPeriodInclusive: Math.max(seriesLength, 1),
                    startPeriodInclusive: 1
                  }}
                  variableDescriptions={addVariableDescriptions}
                  variableUnitMetadata={chart.variableUnitMetadata}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
