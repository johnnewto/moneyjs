import type { SolverContext } from "./context";
import { evaluateExpression, type MatrixColumnSumBindings } from "../parser/dependencies";
import { parseExpression } from "../parser/parse";

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

export function evaluateMatrixCellSource(source: string, context: SolverContext): number {
  const trimmed = source.trim();
  if (!trimmed || trimmed === "0") {
    return 0;
  }

  const expression = parseExpression(stripLeadingPlus(trimmed));
  return evaluateExpression(expression, context);
}

export function evaluateMatrixColumnSum(
  columnRef: string,
  bindings: MatrixColumnSumBindings,
  context: SolverContext
): number {
  const sources = bindings[columnRef.trim()];
  if (!sources) {
    throw new Error(`Matrix column sum is not bound: sum(${columnRef})`);
  }

  return sources.reduce<number>(
    (total, source) => total + evaluateMatrixCellSource(source, context),
    0
  );
}

export function wrapContextWithMatrixColumnSums(
  context: SolverContext,
  bindings: MatrixColumnSumBindings
): SolverContext {
  if (Object.keys(bindings).length === 0) {
    return context;
  }

  return {
    currentValue: (variable) => context.currentValue(variable),
    lagValue: (variable) => context.lagValue(variable),
    diffValue: (variable) => context.diffValue(variable),
    setCurrentValue: (variable, value) => context.setCurrentValue(variable, value),
    hasSeries: (variable) => context.hasSeries(variable),
    evaluateMatrixColumnSum: (columnRef) => evaluateMatrixColumnSum(columnRef, bindings, context)
  };
}
