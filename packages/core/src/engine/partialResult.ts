import type { ConvergenceFailureDetails } from "../model/schema";
import type { EquationBlock } from "../graph/blocks";
import type { ModelDefinition, SimulationOptions } from "../model/types";
import type { SeriesMap, SimulationResult } from "../result/result";

export function buildPartialSimulationResult(args: {
  series: SeriesMap;
  blocks: EquationBlock[];
  model: ModelDefinition;
  options: SimulationOptions;
  failureDetails: ConvergenceFailureDetails;
}): SimulationResult {
  const lastPeriodIndex = args.failureDetails.period;
  const truncatedSeries = Object.fromEntries(
    Object.entries(args.series).map(([name, values]) => [name, values.slice(0, lastPeriodIndex + 1)])
  );

  return {
    series: truncatedSeries,
    blocks: args.blocks,
    model: args.model,
    options: {
      ...args.options,
      periods: lastPeriodIndex + 1
    },
    runMetadata: {
      partial: true,
      convergenceFailure: args.failureDetails
    }
  };
}
