import type { Expr } from "./ast";
import type { ParsedEquation } from "./parse";

export type EquationRole = "accumulation" | "identity" | "target" | "definition" | "behavioral";

export interface EquationRoleHints {
  description?: string;
  explicitRole?: EquationRole;
}

export interface ParsedEquationAnalysis {
  role: EquationRole;
  hasAccumulation: boolean;
  isIdentityLike: boolean;
  isDefinitionLike: boolean;
  isTargetLike: boolean;
}

export function analyzeParsedEquation(
  equation: ParsedEquation,
  hints: EquationRoleHints = {}
): ParsedEquationAnalysis {
  const hasAccumulation = isAccumulationEquation(equation);
  const identityLike = isIdentityLike(equation.sourceExpression);
  const targetLike = isTargetLike(equation, hints);
  const definitionLike = isDefinitionLike(equation);

  return {
    role:
      hints.explicitRole ??
      (hasAccumulation
        ? "accumulation"
        : targetLike
          ? "target"
          : definitionLike
            ? "definition"
            : identityLike
              ? "identity"
              : "behavioral"),
    hasAccumulation,
    isIdentityLike: identityLike,
    isDefinitionLike: definitionLike,
    isTargetLike: targetLike
  };
}

export function isAccumulationEquation(equation: ParsedEquation): boolean {
  return (
    equation.sourceExpression.type === "Integral" || equation.lagDependencies.includes(equation.name)
  );
}

export function isIdentityLike(expr: Expr): boolean {
  switch (expr.type) {
    case "Number":
    case "Variable":
    case "Lag":
    case "Diff":
      return true;
    case "Unary":
      return isIdentityLike(expr.expr);
    case "Binary":
      if (expr.op !== "+" && expr.op !== "-") {
        return false;
      }
      return isIdentityLike(expr.left) && isIdentityLike(expr.right);
    default:
      return false;
  }
}

export function isDefinitionLike(equation: ParsedEquation): boolean {
  const dependencyCount = new Set([
    ...equation.currentDependencies,
    ...equation.lagDependencies
  ]).size;
  return dependencyCount <= 1;
}

export function isTargetLike(
  equation: ParsedEquation,
  hints: Pick<EquationRoleHints, "description"> = {}
): boolean {
  const normalizedDescription = hints.description?.trim().toLowerCase() ?? "";
  if (normalizedDescription.includes("target") || normalizedDescription.includes("desired")) {
    return true;
  }

  return (
    /(?:^|[^a-z])t(?:$|[^a-z])/i.test(equation.name) &&
    !isAccumulationEquation(equation) &&
    !isIdentityLike(equation.sourceExpression)
  );
}
