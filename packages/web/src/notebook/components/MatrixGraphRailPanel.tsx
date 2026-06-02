import { ResultChart } from "../../components/ResultChart";
import type { MatrixGraphSliceHighlight } from "../graphDocumentHighlight";
import type { MatrixGraphChartEntry } from "../matrixGraphRailState";
import {
  matrixGraphCrossLegendHint,
  resolveMatrixGraphChartSeries
} from "../matrixSliceGraph";

function formatMatrixGraphTitle(chart: Pick<MatrixGraphChartEntry, "kind" | "label" | "matrixTitle">): string {
  const sliceKind = chart.kind === "row" ? "Row" : "Column";
  return `${chart.matrixTitle}: ${sliceKind} ${chart.label}`;
}

export function MatrixGraphRailPanel({
  charts,
  onDismissChart,
  onGraphExpressionHighlightChange,
  onGraphSliceHighlightChange,
  onToggleChartLegendMode,
  onToggleChartPin,
  selectedPeriodIndex
}: {
  charts: MatrixGraphChartEntry[];
  onDismissChart(chartId: string): void;
  onGraphExpressionHighlightChange?(expression: string | null): void;
  onGraphSliceHighlightChange?(slice: MatrixGraphSliceHighlight | null): void;
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

          return (
            <div key={chart.id} className="notebook-graph-rail-chart">
              {chartSeries.length === 0 ? (
                <div className="status-hint">{title}: no graphable signed entries.</div>
              ) : (
                <ResultChart
                  axisMode="shared"
                  graphSlice={{
                    index: chart.index,
                    kind: chart.kind,
                    matrixCellId: chart.matrixCellId
                  }}
                  isPinned={chart.pinned}
                  legendMode={legendMode}
                  legendModeCrossHint={matrixGraphCrossLegendHint(chart.kind)}
                  onDismiss={() => onDismissChart(chart.id)}
                  onGraphExpressionHighlightChange={onGraphExpressionHighlightChange}
                  onGraphSliceHighlightChange={onGraphSliceHighlightChange}
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
                  variableDescriptions={chart.variableDescriptions}
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
