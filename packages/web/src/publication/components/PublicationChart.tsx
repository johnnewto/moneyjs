import type { SimulationResult } from "@sfcr/core";

import { ResultChart } from "../../components/ResultChart";
import { buildNotebookVariableUnitMetadata } from "../../notebook/notebookAppHelpers";
import {
  buildResolvedChartSeriesRanges,
  buildResolvedChartSeriesWithUnits
} from "../../notebook/chartSeries";
import type { ChartCell, NotebookCell } from "../../notebook/types";
import { buildPublicationVariableDescriptions } from "../publicationVariables";
import type { PublicationVariableInteraction } from "../publicationInspect";

export function PublicationChart({
  cell,
  cells,
  interaction,
  result,
  selectedPeriodIndex
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  interaction: PublicationVariableInteraction;
  result: SimulationResult | null;
  selectedPeriodIndex: number;
}) {
  if (!result) {
    return <p className="publication-status-hint">Chart data is not available.</p>;
  }

  const variableUnitMetadata = buildNotebookVariableUnitMetadata(cells);
  const series = buildResolvedChartSeriesWithUnits(cell, result, variableUnitMetadata);
  if (series.length === 0) {
    return <p className="publication-status-hint">Chart data is not available.</p>;
  }

  const seriesRanges = buildResolvedChartSeriesRanges(cell, series);
  const variableDescriptions = buildPublicationVariableDescriptions(cells);
  const seriesLength = Math.max(...series.map((entry) => entry.values.length), 1);

  return (
    <div className="publication-chart">
      <ResultChart
        axisMode={cell.axisMode ?? "shared"}
        axisSnapTolarance={cell.axisSnapTolarance}
        niceScale={cell.niceScale}
        highlightedVariable={interaction.highlightedVariable}
        onInspectScenarioShockVariable={interaction.onSelectVariable}
        periodLabelOffset={0}
        selectedIndex={Math.min(selectedPeriodIndex, seriesLength - 1)}
        series={series}
        seriesRanges={seriesRanges}
        sharedRange={cell.sharedRange}
        showAxisSummary={false}
        timeRangeDefaults={{
          endPeriodInclusive: seriesLength,
          startPeriodInclusive: 1
        }}
        timeRangeInclusive={cell.timeRangeInclusive}
        timeRangeSlider={false}
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={variableUnitMetadata}
        xAxisTitle={cell.xAxis?.title}
        yAxis={cell.yAxis}
        yAxisTickCount={cell.yAxisTickCount}
      />
    </div>
  );
}
