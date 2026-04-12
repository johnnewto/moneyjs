import type { EquationBlock } from "../graph/blocks";
import type { ModelDefinition, SimulationOptions } from "../model/types";

export interface SeriesMap {
  [name: string]: Float64Array;
}

export interface SimulationResult {
  series: SeriesMap;
  blocks: EquationBlock[];
  model: ModelDefinition;
  options: SimulationOptions;
}

export function valueAt(
  result: SimulationResult,
  variable: string,
  periodZeroBased: number
): number {
  const series = result.series[variable];
  if (!series) {
    throw new Error(`Unknown variable: ${variable}`);
  }

  return series[periodZeroBased] ?? NaN;
}

export function lastValue(result: SimulationResult, variable: string): number {
  const series = result.series[variable];
  if (!series) {
    throw new Error(`Unknown variable: ${variable}`);
  }

  return series[series.length - 1] ?? NaN;
}
