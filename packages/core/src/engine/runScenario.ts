import type { ScenarioDefinition, SimulationOptions } from "../model/types";
import type { ModelDefinition } from "../model/types";
import type { SimulationResult } from "../result/result";
import { parseEquation } from "../parser/parse";
import { runBaseline } from "./runBaseline";
import { validateShock } from "./validate";

export function runScenario(
  baseline: SimulationResult,
  scenario: ScenarioDefinition,
  options: SimulationOptions
): SimulationResult {
  const model = baseline.model;
  const historyPeriods = Math.min(resolveMaxLag(model), Math.max(baseline.options.periods - 1, 0));
  const expandedPeriods = options.periods + historyPeriods;
  const scenarioModel: ModelDefinition = {
    ...model,
    externals: { ...model.externals },
    observed: model.observed ? { ...model.observed } : undefined,
    initialValues: {}
  };

  for (const equation of model.equations) {
    const targetName = parseEquation(equation.name, equation.expression).name;
    scenarioModel.initialValues[targetName] =
      baseline.series[targetName]?.[baseline.series[targetName].length - 1] ??
      scenarioModel.initialValues[targetName] ??
      0;
  }

  for (const [name, values] of Object.entries(baseline.series)) {
    if (name in scenarioModel.externals && !(name in scenarioModel.initialValues)) {
      scenarioModel.initialValues[name] = values[values.length - 1] ?? 0;
    }
  }

  for (const shock of scenario.shocks) {
    validateShock(model, shock, options.periods);
    for (const [variable, shockValue] of Object.entries(shock.variables)) {
      const existing = scenarioModel.externals[variable];
      const baseValues =
        existing?.kind === "series"
          ? [...existing.values]
          : new Array<number>(expandedPeriods).fill(existing?.kind === "constant" ? existing.value : 0);
      while (baseValues.length < expandedPeriods) {
        baseValues.push(baseValues[baseValues.length - 1] ?? 0);
      }

      for (let period = shock.startPeriodInclusive; period <= shock.endPeriodInclusive; period += 1) {
        const shockIndex = period - shock.startPeriodInclusive;
        baseValues[historyPeriods + period - 1] =
          shockValue.kind === "constant"
            ? shockValue.value
            : shockValue.values[shockIndex] ?? shockValue.values[0] ?? 0;
      }

      scenarioModel.externals[variable] = { kind: "series", values: baseValues };
    }
  }

  const initialSeries =
    historyPeriods > 0
      ? Object.fromEntries(
          Object.entries(baseline.series).map(([name, values]) => [
            name,
            values.slice(Math.max(values.length - historyPeriods - 1, 0))
          ])
        )
      : undefined;
  const expanded = runBaseline(scenarioModel, {
    ...options,
    periods: expandedPeriods,
    initialSeries,
    startPeriod: historyPeriods + 1
  });

  return historyPeriods > 0 ? trimScenarioHistory(expanded, historyPeriods, options) : expanded;
}

function resolveMaxLag(model: ModelDefinition): number {
  return model.equations.reduce(
    (maxLag, equation) =>
      Math.max(maxLag, maxLagInSource(equation.name), maxLagInSource(equation.expression)),
    1
  );
}

function maxLagInSource(source: string): number {
  let maxLag = 0;
  const lagPattern = /\[-(\d+)\]|\b(?:lag|TSLAG|MOVAVG|TSDELTA|TSDELTALOG|TSDELTAP)\([^,)]*,\s*(\d+)/gi;
  for (const match of source.matchAll(lagPattern)) {
    maxLag = Math.max(maxLag, Number(match[1] ?? match[2] ?? 0));
  }
  return maxLag;
}

function trimScenarioHistory(
  result: SimulationResult,
  historyPeriods: number,
  options: SimulationOptions
): SimulationResult {
  const trim = (values: Float64Array) => values.slice(historyPeriods, historyPeriods + options.periods);
  return {
    ...result,
    options,
    series: Object.fromEntries(Object.entries(result.series).map(([name, values]) => [name, trim(values)])),
    ...(result.observed
      ? { observed: Object.fromEntries(Object.entries(result.observed).map(([name, values]) => [name, trim(values)])) }
      : {})
  };
}
