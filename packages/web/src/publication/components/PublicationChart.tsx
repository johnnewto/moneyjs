import { useMemo, useState } from "react";

import type { SimulationResult } from "@sfcr/core";

import { ResultChart } from "../../components/ResultChart";
import {
  buildReferenceTraceOverlaySeries,
  formatChartReferenceTraceLegend,
  resolveEffectiveScenarioStartPeriod,
  resolveReferenceTrace
} from "../../notebook/chartReferenceTrace";
import { buildNotebookVariableUnitMetadata } from "../../notebook/notebookAppHelpers";
import {
  appendChartVariable,
  buildResolvedChartSeriesRanges,
  buildResolvedChartSeriesWithUnits,
  moveChartSeriesByDisplayName,
  removeChartSeriesByDisplayName
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
  interactive = false,
  result,
  selectedPeriodIndex
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  getResult(runCellId: string): SimulationResult | null;
  interaction: PublicationVariableInteraction;
  interactive?: boolean;
  result: SimulationResult | null;
  selectedPeriodIndex: number;
}) {
  const [chartCell, setChartCell] = useState<ChartCell>(cell);
  const activeCell = interactive ? chartCell : cell;

  const variableUnitMetadata = useMemo(() => buildNotebookVariableUnitMetadata(cells), [cells]);
  const variableDescriptions = useMemo(() => buildPublicationVariableDescriptions(cells), [cells]);

  if (!result) {
    return <p className="publication-status-hint">Chart data is not available.</p>;
  }

  const series = buildResolvedChartSeriesWithUnits(activeCell, result, variableUnitMetadata);
  if (series.length === 0) {
    return <p className="publication-status-hint">Chart data is not available.</p>;
  }

  const seriesRanges = buildResolvedChartSeriesRanges(activeCell, series);
  const seriesLength = Math.max(...series.map((entry) => entry.values.length), 1);

  const addVariableOptions = interactive
    ? Object.entries(result.series)
        .filter(([, values]) => values.length > 1 && Array.from(values).some(Number.isFinite))
        .map(([name]) => name)
        .sort((left, right) => left.localeCompare(right))
    : undefined;

  const sourceRunCell = cells.find(
    (candidate): candidate is RunCell =>
      candidate.type === "run" && candidate.id === activeCell.sourceRunCellId
  );
  const baselineRunCell =
    sourceRunCell?.mode === "scenario" && sourceRunCell.baselineRunCellId
      ? cells.find(
          (candidate): candidate is RunCell =>
            candidate.type === "run" && candidate.id === sourceRunCell.baselineRunCellId
        )
      : null;
  const baselineResult = baselineRunCell ? getResult(baselineRunCell.id) : null;
  const baselineStartPeriod = sourceRunCell
    ? resolveEffectiveScenarioStartPeriod(cells, sourceRunCell)
    : undefined;
  const hasObserved = result.observed != null && Object.keys(result.observed).length > 0;
  const referenceTrace = resolveReferenceTrace(activeCell, sourceRunCell, hasObserved);
  const overlaySeries = buildReferenceTraceOverlaySeries({
    cell: activeCell,
    referenceTrace,
    result,
    resolvedSeries: series,
    sourceRunCell,
    baselineStartPeriod,
    baselineResult
  });
  const scenarioShocks = resolveShowScenarioShocks(activeCell, sourceRunCell)
    ? buildScenarioShockMarkers(sourceRunCell, result, baselineResult)
    : [];
  const referenceTraceLegendLabel =
    referenceTrace !== "none" && overlaySeries.length > 0
      ? formatChartReferenceTraceLegend(referenceTrace)
      : undefined;

  return (
    <div className="publication-chart">
      <ResultChart
        addVariableOptions={addVariableOptions}
        axisMode={activeCell.axisMode ?? "shared"}
        axisGroups={activeCell.axisGroups}
        axisSnapTolarance={activeCell.axisSnapTolarance}
        niceScale={activeCell.niceScale}
        highlightedVariable={interaction.highlightedVariable}
        onAddVariable={
          interactive
            ? (variableName) =>
                setChartCell((current) => appendChartVariable(current, variableName))
            : undefined
        }
        onInspectScenarioShockVariable={interaction.onSelectVariable}
        onMoveVariable={
          interactive
            ? (variableName, direction) =>
                setChartCell((current) =>
                  moveChartSeriesByDisplayName(current, variableName, direction)
                )
            : undefined
        }
        onRemoveVariable={
          interactive
            ? (variableName) =>
                setChartCell((current) => removeChartSeriesByDisplayName(current, variableName))
            : undefined
        }
        overlaySeries={overlaySeries}
        periodLabelOffset={0}
        referenceTraceLegendLabel={referenceTraceLegendLabel}
        scenarioShocks={scenarioShocks}
        selectedIndex={Math.min(selectedPeriodIndex, seriesLength - 1)}
        series={series}
        seriesRanges={seriesRanges}
        sharedRange={activeCell.sharedRange}
        showAxisSummary={false}
        timeRangeDefaults={{
          endPeriodInclusive: seriesLength,
          startPeriodInclusive: 1
        }}
        timeRangeInclusive={activeCell.timeRangeInclusive}
        timeRangeSlider={interactive ? "auto" : false}
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={variableUnitMetadata}
        xAxisTitle={activeCell.xAxis?.title}
        yAxis={activeCell.yAxis}
        yAxisTickCount={activeCell.yAxisTickCount}
      />
    </div>
  );
}
