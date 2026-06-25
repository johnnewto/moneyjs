import { buildOrderedBlocks } from "../graph/blocks";
import type { ModelDefinition, SimulationOptions } from "../model/types";
import { ConvergenceError } from "../model/schema";
import { parseEquation } from "../parser/parse";
import type { SimulationResult } from "../result/result";
import { broydenSolver } from "../solver/broyden";
import { gaussSeidelSolver } from "../solver/gaussSeidel";
import { newtonSolver } from "../solver/newton";
import { wrapContextWithMatrixColumnSums } from "./matrixColumnSum";
import { buildPartialSimulationResult } from "./partialResult";
import { SeriesStore } from "./seriesStore";
import { validateHiddenEquation, validateModel, validateOptions } from "./validate";

export function runBaseline(
  model: ModelDefinition,
  options: SimulationOptions
): SimulationResult {
  validateModel(model);
  validateOptions(options);

  const matrixColumnSums = model.matrixColumnSums ?? {};
  const matrixColumnSumLocations = model.matrixColumnSumLocations;
  const parsed = model.equations.map((equation) =>
    parseEquation(equation.name, equation.expression, { matrixColumnSums })
  );
  const ordered = buildOrderedBlocks(parsed);
  const equationsByName = new Map(parsed.map((equation) => [equation.name, equation]));
  const endogenousNames = parsed.map((equation) => equation.name);
  const externalNames = Object.keys(model.externals);
  const coefficientEntries = Object.entries(model.coefficients ?? {});
  const series = SeriesStore.createForModel(
    endogenousNames,
    [...externalNames, ...coefficientEntries.map(([name]) => name)],
    options
  );
  const observed = buildObservedSeries(model.observed, options.periods);

  for (const variable of Object.keys(series)) {
    series[variable]?.fill(options.defaultInitialValue ?? 1e-15);
  }

  for (const [name, value] of coefficientEntries) {
    series[name]?.fill(value);
  }

  for (const [name, external] of Object.entries(model.externals)) {
    const values = series[name];
    if (!values) {
      continue;
    }
    if (external.kind === "constant") {
      values.fill(external.value);
    } else {
      values.set(external.values.slice(0, options.periods));
      if (external.values.length === 1) {
        values.fill(external.values[0] ?? 0);
      }
    }
  }

  for (const [name, value] of Object.entries(model.initialValues)) {
    const values = series[name];
    if (values) {
      values[0] = value;
    }
  }

  for (const [name, history] of Object.entries(options.initialSeries ?? {})) {
    const values = series[name];
    if (values) {
      values.set(Array.from(history).slice(0, options.periods));
    }
  }

  const solver = selectSolver(options);
  try {
    for (let period = options.startPeriod ?? 1; period < options.periods; period += 1) {
      const context = wrapContextWithMatrixColumnSums(
        SeriesStore.forPeriod(series, period, {
          simType: options.simType ?? "DYNAMIC",
          observed
        }),
        matrixColumnSums,
        matrixColumnSumLocations
      );
      for (const block of ordered.blocks) {
        solver.solveBlock(period, block, equationsByName, context, {
          tolerance: options.tolerance,
          maxIterations: options.maxIterations
        });
      }
    }
  } catch (error) {
    if (error instanceof ConvergenceError) {
      throw new ConvergenceError(
        error.message,
        error.details,
        buildPartialSimulationResult({
          series,
          blocks: ordered.blocks,
          model,
          options,
          failureDetails: error.details
        })
      );
    }
    throw error;
  }

  const result: SimulationResult = {
    series,
    ...(Object.keys(observed).length > 0 ? { observed } : {}),
    blocks: ordered.blocks,
    model,
    options
  };
  const warnings = validateHiddenEquation(result);
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}

function buildObservedSeries(
  observed: Record<string, number[]> | undefined,
  periods: number
): Record<string, Float64Array> {
  const result: Record<string, Float64Array> = {};
  for (const [name, values] of Object.entries(observed ?? {})) {
    const array = new Float64Array(periods);
    array.set(values.slice(0, periods));
    result[name] = array;
  }
  return result;
}

function selectSolver(options: SimulationOptions) {
  switch (options.solverMethod) {
    case "GAUSS_SEIDEL":
      return gaussSeidelSolver;
    case "NEWTON":
      return newtonSolver;
    case "BROYDEN":
      return broydenSolver;
  }
}
