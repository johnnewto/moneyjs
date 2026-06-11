import type { ShockVariableDef, SimulationResult } from "@sfcr/core";

import { renderVariableMathPlainText } from "../components/VariableMathLabel";
import type { ChartCell, RunCell } from "../notebook/types";

export interface ScenarioShockVariable {
  name: string;
  originalValueText?: string;
  valueText: string;
}

export interface ScenarioShockMarker {
  color: string;
  endPeriodInclusive: number;
  shockIndex: number;
  startPeriodInclusive: number;
  variables: ScenarioShockVariable[];
}

export const SCENARIO_SHOCK_COLORS = ["#6366f1", "#ea580c", "#059669", "#ec4899", "#0284c7", "#7c3aed"];

type ScenarioShockInput = {
  endPeriodInclusive?: number;
  rangeInclusive?: [number, number];
  startPeriodInclusive?: number;
  variables: Record<string, ShockVariableDef>;
};

export function resolveShowScenarioShocks(
  chart: Pick<ChartCell, "showScenarioShocks">,
  sourceRunCell: RunCell | null | undefined
): boolean {
  const setting = chart.showScenarioShocks ?? "auto";
  if (setting === false) {
    return false;
  }

  return hasScenarioShocks(sourceRunCell);
}

export function buildScenarioShockMarkers(
  sourceRunCell: RunCell | null | undefined,
  result?: SimulationResult | null,
  baselineResult?: SimulationResult | null
): ScenarioShockMarker[] {
  if (!sourceRunCell?.scenario?.shocks.length) {
    return [];
  }

  return sourceRunCell.scenario.shocks.flatMap((shock, shockIndex) => {
    const range = getShockRange(shock);
    if (!range) {
      return [];
    }

    const [startPeriodInclusive, endPeriodInclusive] = range;
    return [
      {
        color: SCENARIO_SHOCK_COLORS[shockIndex % SCENARIO_SHOCK_COLORS.length] ?? SCENARIO_SHOCK_COLORS[0],
        endPeriodInclusive,
        shockIndex: shockIndex + 1,
        startPeriodInclusive,
        variables: Object.entries(shock.variables).map(([name, value]) => ({
          name,
          originalValueText: resolveOriginalShockValue(result, baselineResult, name, startPeriodInclusive),
          valueText: formatShockValue(value)
        }))
      }
    ];
  });
}

export function formatScenarioShockVariableLabel(entry: ScenarioShockVariable): string {
  const name = renderVariableMathPlainText(entry.name);
  if (entry.originalValueText) {
    return `${name}: ${entry.originalValueText} → ${entry.valueText}`;
  }

  return `${name}: → ${entry.valueText}`;
}

export function formatScenarioShockRunCellLabel(marker: ScenarioShockMarker): string {
  const period = `Period ${marker.startPeriodInclusive} to ${marker.endPeriodInclusive}`;
  if (marker.variables.length === 0) {
    return period;
  }

  return `${period}, ${marker.variables.map((entry) => formatScenarioShockVariableLabel(entry)).join(", ")}`;
}

export function formatScenarioShockAriaLabel(
  marker: ScenarioShockMarker,
  periodLabelOffset: number
): string {
  const periodStart = marker.startPeriodInclusive + periodLabelOffset;
  const periodEnd = marker.endPeriodInclusive + periodLabelOffset;
  if (marker.variables.length === 0) {
    return `Periods ${periodStart} to ${periodEnd}`;
  }

  const details = marker.variables.map((entry) => formatScenarioShockVariableLabel(entry)).join(", ");
  return `${details}, periods ${periodStart} to ${periodEnd}`;
}

function resolveOriginalShockValue(
  result: SimulationResult | null | undefined,
  baselineResult: SimulationResult | null | undefined,
  variable: string,
  startPeriodInclusive: number
): string | undefined {
  if (startPeriodInclusive > 1) {
    const priorPeriodIndex = startPeriodInclusive - 2;
    const fromScenario = result?.series[variable]?.[priorPeriodIndex];
    if (Number.isFinite(fromScenario)) {
      return formatNumericValue(fromScenario as number);
    }

    const fromBaseline = baselineResult?.series[variable]?.[priorPeriodIndex];
    if (Number.isFinite(fromBaseline)) {
      return formatNumericValue(fromBaseline as number);
    }
  }

  const external = baselineResult?.model.externals[variable] ?? result?.model.externals[variable];
  if (external?.kind === "constant") {
    return formatNumericValue(external.value);
  }

  if (external?.kind === "series") {
    const periodIndex = Math.max(startPeriodInclusive - 1, 0);
    const value = external.values[Math.min(periodIndex, external.values.length - 1)];
    if (Number.isFinite(value)) {
      return formatNumericValue(value as number);
    }
  }

  return undefined;
}

function hasScenarioShocks(sourceRunCell: RunCell | null | undefined): boolean {
  return sourceRunCell?.mode === "scenario" && (sourceRunCell.scenario?.shocks.length ?? 0) > 0;
}

function getShockRange(shock: ScenarioShockInput): [number, number] | null {
  const start = shock.rangeInclusive?.[0] ?? shock.startPeriodInclusive;
  const end = shock.rangeInclusive?.[1] ?? shock.endPeriodInclusive;
  if (typeof start !== "number" || typeof end !== "number") {
    return null;
  }

  return [start, end];
}

function formatShockValue(
  value: { kind: "constant"; value: number } | { kind: "series"; values: number[] }
): string {
  if (value.kind === "constant") {
    return formatNumericValue(value.value);
  }

  return `[${value.values.map((item) => formatNumericValue(item)).join(", ")}]`;
}

function formatNumericValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
