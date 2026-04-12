import { evaluateExpression } from "../parser/dependencies";

import type { BlockSolver } from "./types";
import { solveLinearSystem } from "./linearSolve";

export const newtonSolver: BlockSolver = {
  solveBlock(period, block, equationsByName, context, options) {
    if (!block.cyclic) {
      const variable = block.equationNames[0];
      if (!variable) {
        throw new Error(`Empty block encountered at period ${period}`);
      }
      const equation = equationsByName.get(variable);
      if (!equation) {
        throw new Error(`Missing equation for variable: ${variable}`);
      }
      context.setCurrentValue(variable, evaluateExpression(equation.expression, context));
      return;
    }

    const variables = block.equationNames;
    const x = variables.map((variable) => context.lagValue(variable));

    for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
      setCurrentValues(context, variables, x);
      const residual = residuals(variables, equationsByName, context);

      if (maxAbs(residual) < options.tolerance) {
        return;
      }

      const jacobian = finiteDifferenceJacobian(variables, equationsByName, context, x, residual);
      const delta = solveLinearSystem(
        jacobian,
        residual.map((value) => -value)
      );

      let maxRelative = 0;
      for (let index = 0; index < x.length; index += 1) {
        x[index] = (x[index] ?? 0) + (delta[index] ?? 0);
        const relative = Math.abs(delta[index] ?? 0) / (Math.abs(x[index] ?? 0) + 1e-15);
        maxRelative = Math.max(maxRelative, relative);
      }

      setCurrentValues(context, variables, x);
      if (maxRelative < options.tolerance) {
        return;
      }
    }

    throw new Error(
      `Newton-Raphson algorithm failed to converge for block ${block.equationNames.join(", ")} at period ${period}`
    );
  }
};

function residuals(
  variables: string[],
  equationsByName: Map<string, { expression: import("../parser/ast").Expr }>,
  context: import("../engine/context").SolverContext
): number[] {
  return variables.map((variable) => {
    const equation = equationsByName.get(variable);
    if (!equation) {
      throw new Error(`Missing equation for variable: ${variable}`);
    }
    return evaluateExpression(equation.expression, context) - context.currentValue(variable);
  });
}

function finiteDifferenceJacobian(
  variables: string[],
  equationsByName: Map<string, { expression: import("../parser/ast").Expr }>,
  context: import("../engine/context").SolverContext,
  x: number[],
  baseResidual: number[]
): number[][] {
  const jacobian = Array.from({ length: variables.length }, () =>
    new Array<number>(variables.length).fill(0)
  );

  for (let col = 0; col < variables.length; col += 1) {
    const shifted = [...x];
    const step = 1e-7 * Math.max(1, Math.abs(shifted[col] ?? 0));
    shifted[col] = (shifted[col] ?? 0) + step;
    setCurrentValues(context, variables, shifted);
    const shiftedResidual = residuals(variables, equationsByName, context);

    for (let row = 0; row < variables.length; row += 1) {
      jacobian[row]![col] = ((shiftedResidual[row] ?? 0) - (baseResidual[row] ?? 0)) / step;
    }
  }

  setCurrentValues(context, variables, x);
  return jacobian;
}

function setCurrentValues(
  context: import("../engine/context").SolverContext,
  variables: string[],
  values: number[]
): void {
  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index];
    if (variable) {
      context.setCurrentValue(variable, values[index] ?? NaN);
    }
  }
}

function maxAbs(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}
