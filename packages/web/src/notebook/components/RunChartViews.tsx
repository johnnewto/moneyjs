import { ResultChart } from "../../components/ResultChart";
import { ScenarioShockVariableLine } from "../../components/ScenarioShockVariableLine";
import type { EditorState } from "../../lib/editorModel";
import { resolveInspectorModelSource, type VariableInspectRequest } from "../../lib/variableInspect";
import type { buildVariableUnitMetadata } from "../../lib/units";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import {
  buildScenarioShockMarkers,
  formatScenarioShockRunCellLabel,
  resolveShowScenarioShocks
} from "../../lib/scenarioShockMarkers";
import {
  buildOverlaySeriesFromSpecs,
  buildResolvedChartSeriesRanges,
  buildResolvedChartSeriesWithUnits,
  resolveChartSeriesSpecs,
  type ResolvedChartSeries
} from "../chartSeries";
import type { ChartCell, NotebookCell, RunCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";

export function RunCellView({
  cell,
  cells,
  currentValues,
  editor,
  onVariableInspectRequest,
  highlightedVariable = null,
  runner,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: RunCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  editor: EditorState | null;
  highlightedVariable?: string | null;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  runner: ReturnType<typeof useNotebookRunner>;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const modelSource = resolveInspectorModelSource(cell);
  const baselineStartPeriod = resolveEffectiveScenarioStartPeriod(cells, cell);
  const result = runner.getResult(cell.id);
  const baselineRunCell =
    cell.mode === "scenario" && cell.baselineRunCellId
      ? cells.find(
          (candidate): candidate is RunCell =>
            candidate.type === "run" && candidate.id === cell.baselineRunCellId
        ) ?? null
      : null;
  const baselineResult = baselineRunCell ? runner.getResult(baselineRunCell.id) : null;
  const scenarioShockMarkers =
    cell.mode === "scenario" && cell.scenario?.shocks.length
      ? buildScenarioShockMarkers(cell, result, baselineResult)
      : [];
  const warnings = result?.warnings ?? [];
  const handleInspectVariable =
    editor == null
      ? undefined
      : (selectedVariable: string) => {
          onVariableInspectRequest({
            currentValues,
            editor,
            modelSource,
            sourceRunCellId: cell.id,
            selectedVariable,
            variableDescriptions,
            variableUnitMetadata
          });
        };

  return (
    <div className="notebook-run-summary">
      <div className="notebook-run-meta">
        <span className="notebook-run-meta-chip">
          Mode <strong>{cell.mode}</strong>
        </span>
        {cell.mode === "scenario" && cell.baselineRunCellId ? (
          <span className="notebook-run-meta-chip">
            Baseline <strong>{cell.baselineRunCellId}</strong>
          </span>
        ) : null}
        {cell.mode === "scenario" && baselineStartPeriod != null ? (
          <span className="notebook-run-meta-chip">
            Start period <strong>{baselineStartPeriod}</strong>
          </span>
        ) : null}
        {cell.periods != null ? (
          <span className="notebook-run-meta-chip">
            {cell.mode === "scenario" ? "Scenario periods" : "Periods"} <strong>{cell.periods}</strong>
          </span>
        ) : null}
      </div>
      {scenarioShockMarkers.length ? (
        <ul className="notebook-run-scenarios">
          {scenarioShockMarkers.map((marker) => (
            <li
              key={`${cell.id}-shock-${marker.shockIndex}`}
              className="notebook-run-shock"
              aria-label={formatScenarioShockRunCellLabel(marker)}
            >
              <div className="notebook-run-shock-line">
                <span className="notebook-run-shock-period-label">
                  Period {marker.startPeriodInclusive} to {marker.endPeriodInclusive}
                </span>
                {marker.variables.length > 0 ? (
                  <>
                    {",  "}
                    {marker.variables.map((entry, entryIndex) => (
                      <span key={`${marker.shockIndex}-${entry.name}`} className="notebook-run-shock-variable">
                        {entryIndex > 0 ? ", " : null}
                        {handleInspectVariable ? (
                          <ScenarioShockVariableLine
                            entry={entry}
                            highlightedVariable={highlightedVariable}
                            inspectButtonClassName="notebook-run-shock-variable-button"
                            onInspect={handleInspectVariable}
                          />
                        ) : (
                          <ScenarioShockVariableLine entry={entry} />
                        )}
                      </span>
                    ))}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {warnings.length > 0 ? (
        <div className="notebook-run-warnings" role="status" aria-label="Run warnings">
          <div className="notebook-run-warning-heading">Warnings</div>
          <ul className="notebook-run-warning-list">
            {warnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.message}-${index}`} className="notebook-run-warning-item">
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ChartCellView({
  cell,
  cells,
  currentValues,
  editor,
  onAddVariable,
  onMoveVariable,
  onRemoveVariable,
  onVariableInspectRequest,
  runner,
  selectedPeriodIndex,
  highlightedVariable = null,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  editor: EditorState | null;
  highlightedVariable?: string | null;
  onAddVariable?(variableName: string): void;
  onMoveVariable?(variableName: string, direction: "left" | "right"): void;
  onRemoveVariable?(variableName: string): void;
  onVariableInspectRequest?(args: VariableInspectRequest): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return null;
  }

  const series = buildResolvedChartSeriesWithUnits(cell, result, variableUnitMetadata);
  const seriesRanges = buildResolvedChartSeriesRanges(cell, series);
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
  const baselineResult = baselineRunCell ? runner.getResult(baselineRunCell.id) : null;
  const previousResult = runner.getPreviousResult(cell.sourceRunCellId);
  const baselineStartPeriod = sourceRunCell
    ? resolveEffectiveScenarioStartPeriod(cells, sourceRunCell)
    : undefined;
  const periodLabelOffset = baselineStartPeriod != null ? baselineStartPeriod - 1 : 0;
  const chartSelectedIndex =
    baselineStartPeriod != null
      ? Math.max(selectedPeriodIndex - periodLabelOffset, 0)
      : selectedPeriodIndex;
  const referenceTrace = resolveReferenceTrace(cell, sourceRunCell);
  const overlaySeries = referenceTrace === "previous-run"
    ? buildPreviousRunOverlaySeries(cell, previousResult, series)
    : referenceTrace === "baseline"
      ? buildBaselineOverlaySeries(cell, sourceRunCell, baselineStartPeriod, baselineResult, series)
      : [];
  const timeRangeDefaults = resolveChartTimeRangeDefaults(series[0]?.values.length ?? 0);
  const addVariableOptions = Object.entries(result.series)
    .filter(([, values]) => values.length > 1 && Array.from(values).some(Number.isFinite))
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
  const scenarioShocks = resolveShowScenarioShocks(cell, sourceRunCell)
    ? buildScenarioShockMarkers(sourceRunCell, result, baselineResult)
    : [];
  const modelSource = sourceRunCell ? resolveInspectorModelSource(sourceRunCell) : null;
  const handleInspectScenarioShockVariable =
    editor == null || sourceRunCell == null || !onVariableInspectRequest
      ? undefined
      : (selectedVariable: string) => {
          onVariableInspectRequest({
            currentValues,
            editor,
            modelSource,
            sourceRunCellId: sourceRunCell.id,
            selectedVariable,
            variableDescriptions,
            variableUnitMetadata
          });
        };

  return (
    <ResultChart
      addVariableOptions={addVariableOptions}
      axisMode={cell.axisMode ?? "shared"}
      axisSnapTolarance={cell.axisSnapTolarance}
      niceScale={cell.niceScale}
      onAddVariable={onAddVariable}
      onInspectScenarioShockVariable={handleInspectScenarioShockVariable}
      onMoveVariable={onMoveVariable}
      onRemoveVariable={onRemoveVariable}
      overlaySeries={overlaySeries}
      periodLabelOffset={periodLabelOffset}
      scenarioShocks={scenarioShocks}
      seriesRanges={seriesRanges}
      selectedIndex={chartSelectedIndex}
      series={series}
      sharedRange={cell.sharedRange}
      timeRangeDefaults={timeRangeDefaults}
      timeRangeInclusive={cell.timeRangeInclusive}
      highlightedVariable={highlightedVariable}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
      xAxisTitle={cell.xAxis?.title}
      yAxis={cell.yAxis}
      yAxisTickCount={cell.yAxisTickCount}
    />
  );
}

function buildBaselineOverlaySeries(
  cell: ChartCell,
  sourceRunCell: RunCell | null | undefined,
  baselineStartPeriod: number | undefined,
  baselineResult: ReturnType<ReturnType<typeof useNotebookRunner>["getResult"]>,
  resolvedSeries: ResolvedChartSeries[]
) {
  if (
    sourceRunCell?.mode !== "scenario" ||
    baselineStartPeriod == null ||
    !baselineResult
  ) {
    return [];
  }

  const specs = resolveChartSeriesSpecs(cell);
  const startIndex = Math.max(baselineStartPeriod - 1, 0);
  const length = sourceRunCell.periods ?? resolvedSeries[0]?.values.length ?? 0;
  const overlayByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, baselineResult, { startIndex, length }).map((entry) => [
      entry.highlightKey,
      entry
    ])
  );

  return resolvedSeries.flatMap((entry) => {
    const overlay = overlayByHighlightKey.get(entry.highlightKey);
    return overlay ? [{ ...overlay, name: entry.name }] : [];
  });
}

function buildPreviousRunOverlaySeries(
  cell: ChartCell,
  previousResult: ReturnType<ReturnType<typeof useNotebookRunner>["getPreviousResult"]>,
  resolvedSeries: ResolvedChartSeries[]
) {
  if (!previousResult) {
    return [];
  }

  const specs = resolveChartSeriesSpecs(cell);
  const overlayByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, previousResult).map((entry) => [entry.highlightKey, entry])
  );

  return resolvedSeries.flatMap((entry) => {
    const overlay = overlayByHighlightKey.get(entry.highlightKey);
    return overlay ? [{ ...overlay, name: entry.name }] : [];
  });
}

function resolveReferenceTrace(
  cell: ChartCell,
  sourceRunCell: RunCell | null | undefined
): "none" | "baseline" | "previous-run" {
  if (cell.referenceTrace) {
    return cell.referenceTrace;
  }

  return "previous-run";
}

function resolveEffectiveScenarioStartPeriod(
  cells: NotebookCell[],
  cell: RunCell
): number | undefined {
  if (cell.mode !== "scenario") {
    return undefined;
  }

  if (cell.baselineStartPeriod != null) {
    return cell.baselineStartPeriod;
  }

  const baselineRunCell = cell.baselineRunCellId
    ? cells.find(
        (candidate): candidate is RunCell =>
          candidate.type === "run" && candidate.id === cell.baselineRunCellId
      ) ?? null
    : null;

  if (!baselineRunCell) {
    return undefined;
  }

  return baselineRunCell.periods;
}

function resolveChartTimeRangeDefaults(
  seriesLength: number
): { endPeriodInclusive: number; startPeriodInclusive: number } {
  return {
    startPeriodInclusive: 1,
    endPeriodInclusive: Math.max(seriesLength, 1)
  };
}
