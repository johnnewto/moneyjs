import type { SimulationResult } from "@sfcr/core";

import { ResultChart } from "../../components/ResultChart";
import type { MatrixGraphSliceHighlight } from "../graphDocumentHighlight";
import type { MatrixGraphChartEntry } from "../matrixGraphRailState";
import {
  collectMatrixGraphSliceSeries,
  listAddableMatrixGraphSeries,
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
  onRemoveChartSeries(chartId: string, source: string): void;
  onToggleChartLegendMode(chartId: string): void;
  onToggleChartPin(chartId: string): void;
  selectedPeriodIndex: number;
}) {
  if (charts.length === 0) {
    return (
      <section className="notebook-sidebar-panel notebook-graph-rail-panel" role="tabpanel">
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
    <section className="notebook-sidebar-panel notebook-graph-rail-panel" role="tabpanel">
      <div className="notebook-graph-rail-chart-stack">
        {charts.map((chart) => {
          const legendMode = chart.legendMode ?? "expression";
          const chartSeries = resolveMatrixGraphChartSeries(chart.series, legendMode);
          const seriesLength = chartSeries[0]?.values.length ?? 0;
          const title = formatMatrixGraphTitle(chart);
          const slicePool = resolveMatrixGraphSlicePool(chart, cells, getResult);
          const addableEntries = listAddableMatrixGraphSeries(chart.series, slicePool);
          const addVariableOptions = addableEntries
            .map((entry) => entry.source)
            .sort((left, right) => left.localeCompare(right));
          const addVariableDescriptions = new Map(chart.variableDescriptions);
          for (const entry of addableEntries) {
            if (!addVariableDescriptions.has(entry.source)) {
              addVariableDescriptions.set(entry.source, entry.crossLabel);
            }
          }

          const canShowChart = chartSeries.length > 0 || addVariableOptions.length > 0;

          return (
            <div key={chart.id} className="notebook-graph-rail-chart">
              {!canShowChart ? (
                <div className="status-hint">{title}: no graphable signed entries.</div>
              ) : (
                <ResultChart
                  addVariableOptions={addVariableOptions}
                  axisMode="shared"
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
                  onRemoveVariable={(displayName) => {
                    const match = chartSeries.find((entry) => entry.name === displayName);
                    if (match?.highlightKey) {
                      onRemoveChartSeries(chart.id, match.highlightKey);
                    }
                  }}
                  onToggleLegendMode={() => onToggleChartLegendMode(chart.id)}
                  onTogglePin={() => onToggleChartPin(chart.id)}
                  selectedIndex={selectedPeriodIndex}
                  series={chartSeries}
                  sharedRange={{ includeZero: true }}
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
