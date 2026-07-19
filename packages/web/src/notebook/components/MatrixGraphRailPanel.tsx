import type { SimulationResult } from "@sfcr/core";

import { ResultChart } from "../../components/ResultChart";
import type { MatrixGraphSliceHighlight } from "../graphDocumentHighlight";
import {
  isFreeformMatrixGraphChart,
  resolveDefaultGraphSourceRunCellId,
  type MatrixGraphChartEntry
} from "../matrixGraphRailState";
import {
  collectMatrixGraphSliceSeries,
  listAddableMatrixGraphSources,
  matrixGraphChartHasExternalSeries,
  matrixGraphCrossLegendHint,
  resolveMatrixGraphChartSeries
} from "../matrixSliceGraph";
import {
  buildNotebookVariableDescriptions,
  buildNotebookVariableUnitMetadata
} from "../notebookAppHelpers";
import type { MatrixCell, NotebookCell } from "../types";

function formatMatrixGraphTitle(
  chart: Pick<MatrixGraphChartEntry, "kind" | "label" | "matrixCellId" | "matrixTitle">
): string {
  if (isFreeformMatrixGraphChart(chart)) {
    return "Graph";
  }
  const sliceKind = chart.kind === "row" ? "Row" : "Column";
  return `${chart.matrixTitle}: ${sliceKind} ${chart.label}`;
}

function resolveMatrixGraphSlicePool(
  chart: MatrixGraphChartEntry,
  cells: NotebookCell[],
  getResult: (runCellId: string) => SimulationResult | null | undefined
) {
  if (isFreeformMatrixGraphChart(chart)) {
    return [];
  }

  const matrixCell = cells.find(
    (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === chart.matrixCellId
  );
  const result = getResult(chart.sourceRunCellId);
  if (!matrixCell || !result) {
    return [];
  }

  return collectMatrixGraphSliceSeries(matrixCell, chart.kind, chart.index, result);
}

function GraphAddChartButton({ onClick }: { onClick(): void }) {
  return (
    <div className="notebook-graph-rail-add-chart">
      <button
        type="button"
        className="notebook-graph-rail-add-chart-button"
        aria-label="Add graph panel"
        title="Add graph panel"
        onClick={onClick}
      >
        <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 3.25v9.5M3.25 8h9.5" />
        </svg>
      </button>
    </div>
  );
}

export function MatrixGraphRailPanel({
  cells,
  charts,
  getResult,
  onAddChartSeries,
  onCreateChartFromVariable,
  onCreateEmptyChart,
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
  onCreateChartFromVariable?(source: string): void;
  onCreateEmptyChart?(): void;
  onDismissChart(chartId: string): void;
  onGraphExpressionHighlightChange?(expression: string | null): void;
  onGraphSliceHighlightChange?(slice: MatrixGraphSliceHighlight | null): void;
  onMoveChartSeries?(chartId: string, source: string, direction: "left" | "right"): void;
  onRemoveChartSeries(chartId: string, source: string): void;
  onToggleChartLegendMode(chartId: string): void;
  onToggleChartPin(chartId: string): void;
  selectedPeriodIndex: number;
}) {
  const lastChart = charts[charts.length - 1];
  const lastChartIsEmptyPicker =
    lastChart != null &&
    lastChart.series.length === 0 &&
    isFreeformMatrixGraphChart(lastChart);
  const canAddChartPanel =
    onCreateEmptyChart != null && charts.length > 0 && !lastChartIsEmptyPicker;

  if (charts.length === 0) {
    const sourceRunCellId = resolveDefaultGraphSourceRunCellId(cells, getResult);
    const result = sourceRunCellId ? getResult(sourceRunCellId) : null;
    const addVariableOptions = listAddableMatrixGraphSources([], [], result);
    const canPickVariable =
      onCreateChartFromVariable != null && addVariableOptions.length > 0 && result != null;

    return (
      <section id="notebook-graph-panel" className="notebook-sidebar-panel notebook-graph-rail-panel" role="tabpanel">
        <div className="panel-header">
          <h2>Graph</h2>
          <p className="panel-subtitle">
            {result == null
              ? "Run the model to graph variables, or click a matrix row or column label."
              : "Click a matrix row or column label to graph signed entries. Pin a chart to keep it while exploring other slices. Use Labels to show row or column names in the legend. Or pick a variable below."}
          </p>
        </div>
        {canPickVariable ? (
          <div className="notebook-graph-rail-chart-stack">
            <div className="notebook-graph-rail-chart">
              <ResultChart
                addVariableOptions={addVariableOptions}
                onAddVariable={onCreateChartFromVariable}
                series={[]}
                showAxisSummary={false}
                title="Graph"
                variableDescriptions={buildNotebookVariableDescriptions(cells)}
                variableUnitMetadata={buildNotebookVariableUnitMetadata(cells)}
              />
            </div>
          </div>
        ) : null}
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
          const freeform = isFreeformMatrixGraphChart(chart);

          const canShowChart = chartSeries.length > 0 || addVariableOptions.length > 0;

          return (
            <div key={chart.id} className="notebook-graph-rail-chart">
              {!canShowChart ? (
                <div className="status-hint">{title}: no graphable signed entries.</div>
              ) : (
                <ResultChart
                  addVariableOptions={addVariableOptions}
                  axisMode={useSeparateAxes ? "separate" : "shared"}
                  graphSlice={
                    freeform
                      ? null
                      : {
                          index: chart.index,
                          kind: chart.kind,
                          matrixCellId: chart.matrixCellId
                        }
                  }
                  isPinned={chart.pinned}
                  legendMode={legendMode}
                  legendModeCrossHint={matrixGraphCrossLegendHint(chart.kind)}
                  onAddVariable={(source) => onAddChartSeries(chart.id, source)}
                  onDismiss={() => onDismissChart(chart.id)}
                  onGraphExpressionHighlightChange={onGraphExpressionHighlightChange}
                  onGraphSliceHighlightChange={freeform ? undefined : onGraphSliceHighlightChange}
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
                  onToggleLegendMode={freeform ? undefined : () => onToggleChartLegendMode(chart.id)}
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
        {canAddChartPanel ? <GraphAddChartButton onClick={onCreateEmptyChart} /> : null}
      </div>
    </section>
  );
}
