import { buildOrderedBlocks } from "../graph/blocks";
import type { ModelDefinition, SimulationOptions } from "../model/types";
import { parseEquation } from "../parser/parse";
import type { SimulationResult } from "../result/result";
import { broydenSolver } from "../solver/broyden";
import { gaussSeidelSolver } from "../solver/gaussSeidel";
import { newtonSolver } from "../solver/newton";
import { SeriesStore } from "./seriesStore";
import { validateHiddenEquation, validateModel, validateOptions } from "./validate";

export function runBaseline(
  model: ModelDefinition,
  options: SimulationOptions
): SimulationResult {
  validateModel(model);
  validateOptions(options);

  const parsed = model.equations.map((equation) => parseEquation(equation.name, equation.expression));
  const ordered = buildOrderedBlocks(parsed);
  const equationsByName = new Map(parsed.map((equation) => [equation.name, equation]));
  const endogenousNames = model.equations.map((equation) => equation.name);
  const externalNames = Object.keys(model.externals);
  const series = SeriesStore.createForModel(endogenousNames, externalNames, options);

  for (const variable of Object.keys(series)) {
    series[variable]?.fill(options.defaultInitialValue ?? 1e-15);
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

  const solver = selectSolver(options);
  for (let period = 1; period < options.periods; period += 1) {
    const context = SeriesStore.forPeriod(series, period);
    for (const block of ordered.blocks) {
      solver.solveBlock(period, block, equationsByName, context, {
        tolerance: options.tolerance,
        maxIterations: options.maxIterations
      });
    }
  }

  const result: SimulationResult = {
    series,
    blocks: ordered.blocks,
    model,
    options
  };
  validateHiddenEquation(result);
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
