import type { SolverContext } from "../engine/context";
import type { Expr } from "./ast";

const DT_VARIABLE = "dt";

export function evaluateExpression(expr: Expr, context: SolverContext): number {
  switch (expr.type) {
    case "Number":
      return expr.value;
    case "Variable":
      if (expr.name === DT_VARIABLE) {
        return 1;
      }
      return context.currentValue(expr.name);
    case "Lag":
      if (expr.name === DT_VARIABLE) {
        return 1;
      }
      return context.lagValue(expr.name);
    case "Diff":
      if (expr.name === DT_VARIABLE) {
        return 0;
      }
      return context.diffValue(expr.name);
    case "Unary":
      return -evaluateExpression(expr.expr, context);
    case "If":
      return truthy(evaluateExpression(expr.condition, context))
        ? evaluateExpression(expr.whenTrue, context)
        : evaluateExpression(expr.whenFalse, context);
    case "Function":
      return evaluateFunction(expr.name, expr.args.map((arg) => evaluateExpression(arg, context)));
    case "Binary": {
      const leftValue = evaluateExpression(expr.left, context);
      const rightValue = evaluateExpression(expr.right, context);
      switch (expr.op) {
        case "+":
          return leftValue + rightValue;
        case "-":
          return leftValue - rightValue;
        case "*":
          return leftValue * rightValue;
        case "/":
          return leftValue / rightValue;
        case "^":
          return Math.pow(leftValue, rightValue);
        case ">":
          return truthy(leftValue > rightValue) ? 1 : 0;
        case ">=":
          return truthy(leftValue >= rightValue) ? 1 : 0;
        case "<":
          return truthy(leftValue < rightValue) ? 1 : 0;
        case "<=":
          return truthy(leftValue <= rightValue) ? 1 : 0;
        case "==":
          return truthy(Math.abs(leftValue - rightValue) < 1e-12) ? 1 : 0;
        case "!=":
          return truthy(Math.abs(leftValue - rightValue) >= 1e-12) ? 1 : 0;
        case "&&":
          return truthy(truthy(leftValue) && truthy(rightValue)) ? 1 : 0;
        case "||":
          return truthy(truthy(leftValue) || truthy(rightValue)) ? 1 : 0;
      }
    }
  }
}

export function collectCurrentDependencies(expr: Expr): Set<string> {
  switch (expr.type) {
    case "Number":
    case "Lag":
      return new Set<string>();
    case "Variable":
      if (expr.name === DT_VARIABLE) {
        return new Set<string>();
      }
      return new Set<string>([expr.name]);
    case "Diff":
      if (expr.name === DT_VARIABLE) {
        return new Set<string>();
      }
      return new Set<string>([expr.name]);
    case "Unary":
      return collectCurrentDependencies(expr.expr);
    case "If":
      return unionSets(
        collectCurrentDependencies(expr.condition),
        collectCurrentDependencies(expr.whenTrue),
        collectCurrentDependencies(expr.whenFalse)
      );
    case "Function":
      return unionSets(...expr.args.map((arg) => collectCurrentDependencies(arg)));
    case "Binary":
      return unionSets(
        collectCurrentDependencies(expr.left),
        collectCurrentDependencies(expr.right)
      );
  }
}

export function collectLagDependencies(expr: Expr): Set<string> {
  switch (expr.type) {
    case "Number":
    case "Variable":
      return new Set<string>();
    case "Lag":
      if (expr.name === DT_VARIABLE) {
        return new Set<string>();
      }
      return new Set<string>([expr.name]);
    case "Diff":
      if (expr.name === DT_VARIABLE) {
        return new Set<string>();
      }
      return new Set<string>([expr.name]);
    case "Unary":
      return collectLagDependencies(expr.expr);
    case "If":
      return unionSets(
        collectLagDependencies(expr.condition),
        collectLagDependencies(expr.whenTrue),
        collectLagDependencies(expr.whenFalse)
      );
    case "Function":
      return unionSets(...expr.args.map((arg) => collectLagDependencies(arg)));
    case "Binary":
      return unionSets(collectLagDependencies(expr.left), collectLagDependencies(expr.right));
  }
}

function evaluateFunction(name: string, values: number[]): number {
  switch (name) {
    case "exp":
      return Math.exp(values[0] ?? NaN);
    case "log":
      return Math.log(values[0] ?? NaN);
    case "abs":
      return Math.abs(values[0] ?? NaN);
    case "sqrt":
      return Math.sqrt(values[0] ?? NaN);
    case "min":
      return Math.min(values[0] ?? NaN, values[1] ?? NaN);
    case "max":
      return Math.max(values[0] ?? NaN, values[1] ?? NaN);
    default:
      throw new Error(`Unsupported function: ${name}`);
  }
}

function unionSets(...sets: ReadonlyArray<Set<string>>): Set<string> {
  const result = new Set<string>();
  for (const set of sets) {
    for (const value of set) {
      result.add(value);
    }
  }
  return result;
}

function truthy(value: number | boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return Math.abs(value) > 1e-15;
}
