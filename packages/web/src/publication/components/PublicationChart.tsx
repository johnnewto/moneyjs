import type { SimulationResult } from "@sfcr/core";

import { ResultChart } from "../../components/ResultChart";
import { buildNotebookVariableUnitMetadata } from "../../notebook/notebookAppHelpers";
import {
  buildResolvedChartSeriesRanges,
  buildResolvedChartSeriesWithUnits
} from "../../notebook/chartSeries";
import type { ChartCell, NotebookCell, RunCell } from "../../notebook/types";
import {
  buildScenarioShockMarkers,
  resolveShowScenarioShocks
} from "../../lib/scenarioShockMarkers";
import { buildPublicationVariableDescriptions } from "../publicationVariables";
import type { PublicationVariableInteraction } from "../publicationInspect";

export function PublicationChart({
  cell,
  cells,
  getResult,
  interaction,
  result,
  selectedPeriodIndex
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  getResult(runCellId: string): SimulationResult | null;
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

  const sourceRunCell = cells.find(
    (candidate): candidate is RunCell =>
      candidate.type === "run" && candidate.id === cell.sourceRunCellId
  );
  const baselineRunCell =
    sourceRunCell?.mode === "scenario" && sourceRunCell.baselineRunCellId
      ? cells.find(
          (candidate): candidate is RunCell =>
            candidate.type === "run" && candidate.id === sourceRunCell.baselineRunCellId
        )
      : null;
  const baselineResult = baselineRunCell ? getResult(baselineRunCell.id) : null;
  const scenarioShocks = resolveShowScenarioShocks(cell, sourceRunCell)
    ? buildScenarioShockMarkers(sourceRunCell, result, baselineResult)
    : [];

  return (
    <div className="publication-chart">
      <ResultChart
        axisMode={cell.axisMode ?? "shared"}
        axisGroups={cell.axisGroups}
        axisSnapTolarance={cell.axisSnapTolarance}
        niceScale={cell.niceScale}
        highlightedVariable={interaction.highlightedVariable}
        onInspectScenarioShockVariable={interaction.onSelectVariable}
        periodLabelOffset={0}
        scenarioShocks={scenarioShocks}
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
