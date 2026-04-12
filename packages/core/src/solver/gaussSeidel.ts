import { evaluateExpression } from "../parser/dependencies";

import type { BlockSolver } from "./types";

export const gaussSeidelSolver: BlockSolver = {
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

    for (let iteration = 0; iteration < options.maxIterations; iteration += 1) {
      let converged = true;

      for (const variable of block.equationNames) {
        const equation = equationsByName.get(variable);
        if (!equation) {
          throw new Error(`Missing equation for variable: ${variable}`);
        }
        const previous = context.currentValue(variable);
        const next = evaluateExpression(equation.expression, context);
        context.setCurrentValue(variable, next);
        const relative = Math.abs(next - previous) / (Math.abs(previous) + 1e-15);
        if (!Number.isFinite(relative) || relative >= options.tolerance) {
          converged = false;
        }
      }

      if (converged) {
        return;
      }
    }

    throw new Error(
      `Gauss-Seidel algorithm failed to converge for block ${block.equationNames.join(", ")} at period ${period}`
    );
  }
};
