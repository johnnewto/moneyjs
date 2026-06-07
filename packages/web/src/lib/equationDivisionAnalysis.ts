import {
  collectCurrentDependencies,
  collectLagDependencies,
  parseExpression,
  type Expr
} from "@sfcr/core";

export const DEFAULT_ZERO_DENOMINATOR_TOLERANCE = 1e-12;

export function collectDivisionDenominatorNames(expression: Expr): Set<string> {
  const names = new Set<string>();

  function visit(expr: Expr): void {
    switch (expr.type) {
      case "Binary":
        if (expr.op === "/") {
          for (const name of collectCurrentDependencies(expr.right)) {
            names.add(name);
          }
          for (const name of collectLagDependencies(expr.right)) {
            names.add(name);
          }
        }
        visit(expr.left);
        visit(expr.right);
        break;
      case "Unary":
        visit(expr.expr);
        break;
      case "If":
        visit(expr.condition);
        visit(expr.whenTrue);
        visit(expr.whenFalse);
        break;
      case "Function":
        for (const arg of expr.args) {
          visit(arg);
        }
        break;
      case "Integral":
        visit(expr.expr);
        break;
      default:
        break;
    }
  }

  visit(expression);
  return names;
}

export function collectEquationDenominatorVariables(expression: string): Set<string> {
  const trimmed = expression.trim();
  if (!trimmed) {
    return new Set();
  }

  try {
    return collectDivisionDenominatorNames(parseExpression(trimmed));
  } catch {
    return new Set();
  }
}

export function isNearZeroForDivision(
  value: number | undefined,
  tolerance = DEFAULT_ZERO_DENOMINATOR_TOLERANCE
): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= tolerance;
}

export function isZeroDenominatorVariable(args: {
  name: string;
  isLagged: boolean;
  denominatorVariableNames?: Set<string>;
  currentValues?: Record<string, number | undefined>;
  laggedCurrentValues?: Record<string, number | undefined>;
  tolerance?: number;
}): boolean {
  const normalizedName = args.name.trim();
  if (!normalizedName || !args.denominatorVariableNames?.has(normalizedName)) {
    return false;
  }

  const value = args.isLagged
    ? args.laggedCurrentValues?.[normalizedName]
    : args.currentValues?.[normalizedName];
  return isNearZeroForDivision(value, args.tolerance);
}

export function formatZeroDenominatorWarning(args: {
  name: string;
  isLagged: boolean;
  value: number;
  laggedPeriodLabel?: string;
}): string {
  const label = args.isLagged ? `${args.name.trim()}'` : args.name.trim();
  const periodHint = args.laggedPeriodLabel ? ` (${args.laggedPeriodLabel})` : " at this period";
  return `Denominator risk: ${label} ≈ 0${periodHint}`;
}
