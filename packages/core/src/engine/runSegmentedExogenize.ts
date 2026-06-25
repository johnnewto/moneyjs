import type { ExternalDef, ModelDefinition, SimulationOptions } from "../model/types";
import type { SimulationResult } from "../result/result";
import { runBaseline } from "./runBaseline";

/**
 * Describes how a single run is split into an in-sample segment (variables held
 * to data) and an out-of-sample segment (those variables released and solved).
 */
export interface SegmentedExogenizeOptions {
  /**
   * Number of leading periods (1-based, inclusive) for which the in-sample
   * variables stay pinned. Periods after this index release them.
   */
  splitPeriod: number;
  /**
   * Equation target names dropped only for the in-sample segment. These are the
   * windowed variables: pinned to data through `splitPeriod`, then solved by
   * their restored equations for the remaining periods.
   */
  segment1ExogenizedEquationNames: string[];
}

/**
 * Run a single continuous simulation with windowed exogenization, mirroring R
 * `bimets` `Exogenize=list(var=c(start,end))` semantics over one `TSRANGE`.
 *
 * The supplied `model` is the out-of-sample model (whole-range exogenized
 * variables already dropped, windowed variables still endogenous). We:
 *   1. Solve periods `1..splitPeriod` with the windowed equations also dropped,
 *      so those variables track their supplied/observed data in-sample.
 *   2. Seed the in-sample solution as history and solve the remaining periods
 *      with the windowed equations restored, so the variables are released and
 *      the model feeds back its own simulated values dynamically.
 *
 * The second solve writes both segments into one series, so the returned result
 * spans the full range with no concatenation or history trimming.
 */
export function runSegmentedExogenize(
  model: ModelDefinition,
  options: SimulationOptions,
  segmentation: SegmentedExogenizeOptions
): SimulationResult {
  const { splitPeriod } = segmentation;
  if (!Number.isInteger(splitPeriod) || splitPeriod < 1) {
    throw new Error("Segmented exogenize splitPeriod must be an integer >= 1.");
  }
  if (splitPeriod >= options.periods) {
    throw new Error(
      `Segmented exogenize splitPeriod ${splitPeriod} must be less than the run's total periods ${options.periods}.`
    );
  }

  const dropNames = new Set(segmentation.segment1ExogenizedEquationNames);
  const inSampleModel: ModelDefinition = {
    ...model,
    equations: model.equations.filter((equation) => !dropNames.has(equation.name))
  };

  const inSample = runBaseline(inSampleModel, { ...options, periods: splitPeriod });
  const initialSeries = buildSegmentSeed(inSample.series);

  const forecastModel: ModelDefinition = {
    ...model,
    externals: extendExternalsForward(model.externals, options.periods)
  };

  const full = runBaseline(forecastModel, {
    ...options,
    periods: options.periods,
    startPeriod: splitPeriod,
    initialSeries
  });

  return { ...full, options, model };
}

function buildSegmentSeed(
  series: Record<string, Float64Array>
): Record<string, Float64Array> {
  return Object.fromEntries(
    Object.entries(series).map(([name, values]) => [name, values.slice()])
  );
}

/**
 * Hold exogenous series inputs at their last supplied value for the
 * out-of-sample periods, mirroring R `bimets` forecast behaviour where
 * unspecified exogenous paths stay flat. Series already long enough (e.g.
 * explicit add-factor paths) and constants are left untouched.
 */
function extendExternalsForward(
  externals: Record<string, ExternalDef>,
  periods: number
): Record<string, ExternalDef> {
  const result: Record<string, ExternalDef> = {};
  for (const [name, external] of Object.entries(externals)) {
    if (
      external.kind === "series" &&
      external.values.length > 0 &&
      external.values.length < periods
    ) {
      const last = external.values[external.values.length - 1] ?? 0;
      const values = external.values.slice();
      while (values.length < periods) {
        values.push(last);
      }
      result[name] = { kind: "series", values };
    } else {
      result[name] = external;
    }
  }
  return result;
}
