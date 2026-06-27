const DERIVATIVE_BALANCE_TARGET = /^d\(\s*([A-Za-z_][A-Za-z0-9_.^{}]*)\s*\)$/;

const TRANSFORMED_LHS_TARGET =
  /^(TSDELTALOG|TSDELTAP|TSDELTA)\(\s*([A-Za-z_][A-Za-z0-9_.^{}]*)\s*(?:,\s*(\d+)\s*)?\)$/i;

const INTEGRAL_RHS_PREFIX = /^\s*I\s*\(/;

export function isDerivativeBalanceTarget(name: string): boolean {
  return DERIVATIVE_BALANCE_TARGET.test(name.trim());
}

export function derivativeBalanceStockName(name: string): string | null {
  const match = DERIVATIVE_BALANCE_TARGET.exec(name.trim());
  return match?.[1] ?? null;
}

export type TransformedLhsOperator = "TSDELTA" | "TSDELTALOG" | "TSDELTAP";

export interface TransformedLhsTarget {
  operator: TransformedLhsOperator;
  variable: string;
  offset: number;
}

/**
 * Parses a transformed left-hand side such as `TSDELTALOG(lh,1)`,
 * `TSDELTA(credit,2)`, or `TSDELTAP(oph,1)` into the variable it defines plus
 * the lag offset. These forms are rewritten to level equations by the parser,
 * so the equation defines the inner variable (e.g. `lh`), not the literal
 * transform string.
 */
export function parseTransformedLhsTarget(name: string): TransformedLhsTarget | null {
  const match = TRANSFORMED_LHS_TARGET.exec(name.trim());
  if (!match) {
    return null;
  }
  const variable = match[2];
  if (!variable) {
    return null;
  }
  const operator = (match[1] ?? "").toUpperCase();
  return {
    operator:
      operator === "TSDELTALOG" ? "TSDELTALOG" : operator === "TSDELTAP" ? "TSDELTAP" : "TSDELTA",
    variable,
    offset: Number(match[3] ?? "1")
  };
}

export function transformedLhsTargetName(name: string): string | null {
  return parseTransformedLhsTarget(name)?.variable ?? null;
}

/** The variable an equation name defines, unwrapping `d(stock)` and transformed LHS forms. */
function lhsTargetVariable(trimmedName: string): string | null {
  return derivativeBalanceStockName(trimmedName) ?? transformedLhsTargetName(trimmedName);
}

export function equationDefinesVariable(equationName: string, variable: string): boolean {
  const trimmedName = equationName.trim();
  const trimmedVariable = variable.trim();
  if (!trimmedName || !trimmedVariable) {
    return false;
  }
  if (trimmedName === trimmedVariable) {
    return true;
  }
  return lhsTargetVariable(trimmedName) === trimmedVariable;
}

export function equationOutputVariable(equationName: string): string {
  const trimmedName = equationName.trim();
  return lhsTargetVariable(trimmedName) ?? trimmedName;
}

export interface NormalizedEquationTarget {
  name: string;
  source: string;
  isDerivativeBalance: boolean;
}

export function normalizeDerivativeBalanceTarget(
  name: string,
  source: string
): NormalizedEquationTarget {
  const trimmedName = name.trim();
  const trimmedSource = source.trim();
  const match = DERIVATIVE_BALANCE_TARGET.exec(trimmedName);
  if (!match) {
    return { name: trimmedName, source: trimmedSource, isDerivativeBalance: false };
  }

  const stock = match[1];
  if (!stock) {
    throw new Error("Derivative-balance target requires a stock variable inside d(...).");
  }
  if (stock === "dt") {
    throw new Error("d(dt) is not a valid derivative-balance equation target.");
  }
  if (INTEGRAL_RHS_PREFIX.test(trimmedSource)) {
    throw new Error(
      "Derivative-balance equations cannot combine d(stock) on the lhs with I(...) on the rhs."
    );
  }

  return {
    name: stock,
    source: `I(${trimmedSource})`,
    isDerivativeBalance: true
  };
}
