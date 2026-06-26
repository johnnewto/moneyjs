import type { ConvergenceFailureDetails, SimulationResult } from "@sfcr/core";

interface PartialRunError extends Error {
  details?: ConvergenceFailureDetails;
  partialResult?: SimulationResult;
}

export function normalizeSimulationResultSeries(result: SimulationResult): SimulationResult {
  return {
    ...result,
    series: Object.fromEntries(
      Object.entries(result.series).map(([name, values]) => [
        name,
        values instanceof Float64Array ? values : new Float64Array(values as ArrayLike<number>)
      ])
    )
  };
}

export function extractPartialRunResult(error: unknown): SimulationResult | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const partialResult = (error as PartialRunError).partialResult;
  if (!partialResult?.runMetadata?.partial) {
    return null;
  }

  return normalizeSimulationResultSeries(partialResult);
}

export function isPartialSimulationResult(result: SimulationResult): boolean {
  return result.runMetadata?.partial === true;
}

export function partialResultFailurePeriodIndex(result: SimulationResult): number | null {
  const period = result.runMetadata?.convergenceFailure?.period;
  return period ?? null;
}

export function resolvePartialRunMaxPeriodIndex(args: {
  outputs: Record<string, { type: string; result?: SimulationResult } | undefined>;
  status: Record<string, string | undefined>;
}): number | null {
  let maxIndex: number | null = null;

  for (const [cellId, output] of Object.entries(args.outputs)) {
    if (output?.type !== "result" || !output.result?.runMetadata?.partial) {
      continue;
    }
    if (args.status[cellId] !== "error") {
      continue;
    }

    const seriesMax = Math.max(
      0,
      ...Object.values(output.result.series).map((values) => Math.max(values.length - 1, 0))
    );
    maxIndex = maxIndex == null ? seriesMax : Math.min(maxIndex, seriesMax);
  }

  return maxIndex;
}
