import type { ScenarioDefinition, SimulationOptions } from "../model/types";
import type { SimulationResult } from "../result/result";
import { runBaseline } from "./runBaseline";
import { validateShock } from "./validate";

export function runScenario(
  baseline: SimulationResult,
  scenario: ScenarioDefinition,
  options: SimulationOptions
): SimulationResult {
  const model = baseline.model;
  const scenarioModel = {
    ...model,
    externals: { ...model.externals }
  };

  for (const [name, values] of Object.entries(baseline.series)) {
    if (!(name in scenarioModel.externals)) {
      continue;
    }
    scenarioModel.externals[name] = { kind: "series", values: Array.from(values) };
  }

  for (const equation of model.equations) {
    scenarioModel.initialValues[equation.name] = baseline.series[equation.name]?.[
      baseline.series[equation.name].length - 1
    ] ?? scenarioModel.initialValues[equation.name] ?? 0;
  }

  for (const shock of scenario.shocks) {
    validateShock(model, shock, options.periods);
    for (const [variable, shockValue] of Object.entries(shock.variables)) {
      const existing = scenarioModel.externals[variable];
      const baseValues =
        existing?.kind === "series"
          ? [...existing.values]
          : new Array<number>(options.periods).fill(existing?.kind === "constant" ? existing.value : 0);

      for (let period = shock.startPeriodInclusive; period <= shock.endPeriodInclusive; period += 1) {
        const shockIndex = period - shock.startPeriodInclusive;
        baseValues[period - 1] =
          shockValue.kind === "constant"
            ? shockValue.value
            : shockValue.values[shockIndex] ?? shockValue.values[0] ?? 0;
      }

      scenarioModel.externals[variable] = { kind: "series", values: baseValues };
    }
  }

  return runBaseline(scenarioModel, options);
}
