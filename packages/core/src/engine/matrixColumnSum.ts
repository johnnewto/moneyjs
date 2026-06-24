import { formatMatrixColumnCellParseError } from "../parser/parseErrors";
import type {
  MatrixColumnSumBindings,
  MatrixColumnSumLocations
} from "../parser/dependencies";
import { evaluateExpression } from "../parser/dependencies";
import { rethrowExpressionParseError } from "../parser/parseErrors";
import { parseExpression } from "../parser/parse";
import type { SolverContext } from "./context";
import { isSkippableMatrixCellSource } from "./matrixCellSource";

export { isSkippableMatrixCellSource } from "./matrixCellSource";

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

export function evaluateMatrixCellSource(source: string, context: SolverContext): number {
  const trimmed = source.trim();
  if (isSkippableMatrixCellSource(trimmed)) {
    return 0;
  }

  try {
    const expression = parseExpression(stripLeadingPlus(trimmed));
    return evaluateExpression(expression, context);
  } catch (error) {
    rethrowExpressionParseError(error, trimmed);
  }
}

export function evaluateMatrixColumnSum(
  columnRef: string,
  bindings: MatrixColumnSumBindings,
  context: SolverContext,
  locations?: MatrixColumnSumLocations
): number {
  const key = columnRef.trim();
  const sources = bindings[key];
  if (!sources) {
    throw new Error(`Matrix column sum is not bound: sum(${columnRef})`);
  }

  const columnLocations = locations?.[key] ?? [];

  return sources.reduce<number>((total, source, index) => {
    try {
      return total + evaluateMatrixCellSource(source, context);
    } catch (error) {
      const location = columnLocations[index];
      if (location) {
        throw new Error(formatMatrixColumnCellParseError(location, source, error));
      }
      throw error;
    }
  }, 0);
}

export function wrapContextWithMatrixColumnSums(
  context: SolverContext,
  bindings: MatrixColumnSumBindings,
  locations?: MatrixColumnSumLocations
): SolverContext {
  if (Object.keys(bindings).length === 0) {
    return context;
  }

  return {
    currentValue: (variable) => context.currentValue(variable),
    lagValue: (variable, offset) => context.lagValue(variable, offset),
    diffValue: (variable) => context.diffValue(variable),
    setCurrentValue: (variable, value) => context.setCurrentValue(variable, value),
    hasSeries: (variable) => context.hasSeries(variable),
    shifted: context.shifted
      ? (offset) => wrapContextWithMatrixColumnSums(context.shifted!(offset), bindings, locations)
      : undefined,
    evaluateMatrixColumnSum: (columnRef) =>
      evaluateMatrixColumnSum(columnRef, bindings, context, locations),
    matrixColumnSums: bindings,
    matrixColumnSumLocations: locations
  };
}
