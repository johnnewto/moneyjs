import type { ScenarioDefinition, ShockDef, ShockVariableDef } from "@sfcr/core";

export interface NotebookScenarioShock {
  rangeInclusive: [number, number];
  variables: Record<string, ShockVariableDef>;
  startPeriodInclusive?: number;
  endPeriodInclusive?: number;
}

export interface NotebookScenarioDefinition {
  shocks: NotebookScenarioShock[];
}

type ScenarioShockInput = ShockDef & { rangeInclusive?: [number, number] };

export function serializeScenarioForNotebook(scenario: ScenarioDefinition): NotebookScenarioDefinition {
  return {
    shocks: scenario.shocks.map(
      (shock): NotebookScenarioShock => ({
        rangeInclusive: [shock.startPeriodInclusive, shock.endPeriodInclusive],
        variables: shock.variables,
        startPeriodInclusive: shock.startPeriodInclusive,
        endPeriodInclusive: shock.endPeriodInclusive
      })
    )
  };
}

export function normalizeScenarioFromNotebook(
  scenario: ScenarioDefinition | NotebookScenarioDefinition
): ScenarioDefinition {
  return {
    shocks: scenario.shocks.map((shock): ShockDef => {
      const candidate = shock as ScenarioShockInput;
      const start = candidate.rangeInclusive?.[0] ?? candidate.startPeriodInclusive;
      const end = candidate.rangeInclusive?.[1] ?? candidate.endPeriodInclusive;
      return {
        variables: candidate.variables,
        startPeriodInclusive: start,
        endPeriodInclusive: end
      };
    })
  };
}
