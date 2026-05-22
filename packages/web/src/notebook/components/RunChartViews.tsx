import { AssistantMarkdown } from "../../components/AssistantMarkdown";
import { InstantTooltip } from "../../components/InstantTooltip";
import { ResultChart } from "../../components/ResultChart";
import { VariableLabel } from "../../components/VariableLabel";
import type { EditorState } from "../../lib/editorModel";
import { resolveInspectorModelSource, type VariableInspectRequest } from "../../lib/variableInspect";
import type { buildVariableUnitMetadata } from "../../lib/units";
import { getVariableDescription, type VariableDescriptions } from "../../lib/variableDescriptions";
import type { ChartCell, NotebookCell, RunCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";

export function RunCellView({
  cell,
  cells,
  currentValues,
  editor,
  onVariableInspectRequest,
  runner,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: RunCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  editor: EditorState | null;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  runner: ReturnType<typeof useNotebookRunner>;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const modelSource = resolveInspectorModelSource(cell);
  const baselineStartPeriod = resolveEffectiveScenarioStartPeriod(cells, cell);
  const result = runner.getResult(cell.id);
  const warnings = result?.warnings ?? [];
  const handleInspectVariable =
    editor == null
      ? undefined
      : (selectedVariable: string) => {
          onVariableInspectRequest({
            currentValues,
            editor,
            modelSource,
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
      {cell.scenario?.shocks.length ? (
        <div className="notebook-run-scenarios">
          {cell.scenario.shocks.map((shock, shockIndex) => (
            <div key={`${cell.id}-shock-${shockIndex}`} className="notebook-run-shock">
              <div className="notebook-run-shock-header">
                Shock {shockIndex + 1}: {shock.startPeriodInclusive} to {shock.endPeriodInclusive}
              </div>
              <ul className="notebook-run-shock-list">
                {Object.entries(shock.variables).map(([name, value]) => (
                  <li key={name}>
                    {handleInspectVariable ? (
                      <button
                        type="button"
                        className="result-variable-button"
                        aria-label={`Inspect variable ${name}`}
                        onClick={() => handleInspectVariable(name)}
                      >
                        <VariableLabel
                          currentValues={currentValues}
                          name={name}
                          variableDescriptions={variableDescriptions}
                          variableUnitMetadata={variableUnitMetadata}
                        />
                      </button>
                    ) : (
                      <InstantTooltip
                        as="strong"
                        tooltip={getVariableDescription(variableDescriptions, name)}
                      >
                        <VariableLabel
                          currentValues={currentValues}
                          name={name}
                          variableDescriptions={variableDescriptions}
                          variableUnitMetadata={variableUnitMetadata}
                        />
                      </InstantTooltip>
                    )}
                    : {formatShockValue(value)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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
  onAddVariable,
  onMoveVariable,
  onRemoveVariable,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  onAddVariable?(variableName: string): void;
  onMoveVariable?(variableName: string, direction: "left" | "right"): void;
  onRemoveVariable?(variableName: string): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return null;
  }

  const series = cell.variables
    .map((name) => ({
      name,
      values: Array.from(result.series[name] ?? [])
    }))
    .filter((entry) => entry.values.length > 0);
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
    ? buildPreviousRunOverlaySeries(cell, previousResult)
    : referenceTrace === "baseline"
      ? buildBaselineOverlaySeries(cell, sourceRunCell, baselineStartPeriod, baselineResult, series)
      : [];
  const timeRangeDefaults = resolveChartTimeRangeDefaults(series[0]?.values.length ?? 0);
  const addVariableOptions = Object.entries(result.series)
    .filter(([, values]) => values.length > 1 && Array.from(values).some(Number.isFinite))
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));

  return (
    <ResultChart
      addVariableOptions={addVariableOptions}
      axisMode={cell.axisMode ?? "shared"}
      axisSnapTolarance={cell.axisSnapTolarance}
      niceScale={cell.niceScale}
      onAddVariable={onAddVariable}
      onMoveVariable={onMoveVariable}
      onRemoveVariable={onRemoveVariable}
      overlaySeries={overlaySeries}
      periodLabelOffset={periodLabelOffset}
      seriesRanges={cell.seriesRanges}
      selectedIndex={chartSelectedIndex}
      series={series}
      sharedRange={cell.sharedRange}
      timeRangeDefaults={timeRangeDefaults}
      timeRangeInclusive={cell.timeRangeInclusive}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
      yAxisTickCount={cell.yAxisTickCount}
    />
  );
}

function buildBaselineOverlaySeries(
  cell: ChartCell,
  sourceRunCell: RunCell | null | undefined,
  baselineStartPeriod: number | undefined,
  baselineResult: ReturnType<ReturnType<typeof useNotebookRunner>["getResult"]>,
  series: Array<{ name: string; values: number[] }>
) {
  return (
    sourceRunCell?.mode === "scenario" &&
    baselineStartPeriod != null &&
    baselineResult
      ? cell.variables
          .map((name) => ({
            name,
            values: Array.from(
              baselineResult.series[name]?.slice(
                Math.max(baselineStartPeriod - 1, 0),
                Math.max(baselineStartPeriod - 1, 0) +
                  (sourceRunCell.periods ?? series[0]?.values.length ?? 0)
              ) ?? []
            )
          }))
          .filter((entry) => entry.values.length > 0)
      : []
  );
}

function buildPreviousRunOverlaySeries(
  cell: ChartCell,
  previousResult: ReturnType<ReturnType<typeof useNotebookRunner>["getPreviousResult"]>
) {
  return previousResult
    ? cell.variables
        .map((name) => ({
          name,
          values: Array.from(previousResult.series[name] ?? [])
        }))
        .filter((entry) => entry.values.length > 0)
    : [];
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

function formatShockValue(
  value: { kind: "constant"; value: number } | { kind: "series"; values: number[] }
): string {
  if (value.kind === "constant") {
    return value.value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  return `[${value.values
    .map((item) => item.toLocaleString(undefined, { maximumFractionDigits: 6 }))
    .join(", ")}]`;
}

function resolveChartTimeRangeDefaults(
  seriesLength: number
): { endPeriodInclusive: number; startPeriodInclusive: number } {
  return {
    startPeriodInclusive: 1,
    endPeriodInclusive: Math.max(seriesLength, 1)
  };
}
