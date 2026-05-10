import { InstantTooltip } from "../../components/InstantTooltip";
import { ResultChart } from "../../components/ResultChart";
import type { buildVariableUnitMetadata } from "../../lib/units";
import { getVariableDescription, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildEditorStateForNotebookModel } from "../modelSections";
import type { ChartCell, NotebookCell, RunCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";

export function RunCellView({
  cell,
  cells,
  variableDescriptions
}: {
  cell: RunCell;
  cells: NotebookCell[];
  variableDescriptions: VariableDescriptions;
}) {
  const baselineStartPeriod = resolveEffectiveScenarioStartPeriod(cells, cell);

  return (
    <div className="notebook-run-summary">
      {cell.description ? <p>{cell.description}</p> : null}
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
            Periods <strong>{cell.periods}</strong>
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
                    <InstantTooltip
                      as="strong"
                      tooltip={getVariableDescription(variableDescriptions, name)}
                    >
                      {name}
                    </InstantTooltip>
                    : {formatShockValue(value)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChartCellView({
  cell,
  cells,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return <div className="status-hint">Run the source cell to populate this chart.</div>;
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
  const baselineStartPeriod = sourceRunCell
    ? resolveEffectiveScenarioStartPeriod(cells, sourceRunCell)
    : undefined;
  const periodLabelOffset = baselineStartPeriod != null ? baselineStartPeriod - 1 : 0;
  const chartSelectedIndex =
    baselineStartPeriod != null
      ? Math.max(selectedPeriodIndex - periodLabelOffset, 0)
      : selectedPeriodIndex;
  const overlaySeries =
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
      : [];
  const timeRangeDefaults = resolveChartTimeRangeDefaults(series[0]?.values.length ?? 0);

  return (
    <ResultChart
      axisMode={cell.axisMode ?? "shared"}
      axisSnapTolarance={cell.axisSnapTolarance}
      niceScale={cell.niceScale}
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

  if (baselineRunCell.periods != null) {
    return baselineRunCell.periods;
  }

  return buildEditorStateForNotebookModel(
    {
      id: "notebook",
      title: "notebook",
      metadata: { version: 1 },
      cells
    },
    baselineRunCell
  )?.options.periods;
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
