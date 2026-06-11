import type { ShockVariableDef } from "@sfcr/core";

import { renderVariableMathPlainText } from "../components/VariableMathLabel";
import type { ChartCell, RunCell } from "../notebook/types";

export interface ScenarioShockVariable {
  name: string;
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

export function buildScenarioShockMarkers(sourceRunCell: RunCell | null | undefined): ScenarioShockMarker[] {
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
          valueText: formatShockValue(value)
        }))
      }
    ];
  });
}

export function formatScenarioShockAriaLabel(
  marker: ScenarioShockMarker,
  periodLabelOffset: number
): string {
  const periodStart = marker.startPeriodInclusive + periodLabelOffset;
  const periodEnd = marker.endPeriodInclusive + periodLabelOffset;
  if (marker.variables.length === 0) {
    return `Shock ${marker.shockIndex}, periods ${periodStart} to ${periodEnd}`;
  }

  const details = marker.variables
    .map((entry) => `${renderVariableMathPlainText(entry.name)} → ${entry.valueText}`)
    .join(", ");
  return `Shock ${marker.shockIndex}: ${details}, periods ${periodStart} to ${periodEnd}`;
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
    return value.value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  return `[${value.values
    .map((item) => item.toLocaleString(undefined, { maximumFractionDigits: 6 }))
    .join(", ")}]`;
}
