const DERIVATIVE_BALANCE_TARGET = /^d\(\s*([A-Za-z_][A-Za-z0-9_.^{}]*)\s*\)$/;

const INTEGRAL_RHS_PREFIX = /^\s*I\s*\(/;

export function isDerivativeBalanceTarget(name: string): boolean {
  return DERIVATIVE_BALANCE_TARGET.test(name.trim());
}

export function derivativeBalanceStockName(name: string): string | null {
  const match = DERIVATIVE_BALANCE_TARGET.exec(name.trim());
  return match?.[1] ?? null;
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
  return derivativeBalanceStockName(trimmedName) === trimmedVariable;
}

export function equationOutputVariable(equationName: string): string {
  const trimmedName = equationName.trim();
  return derivativeBalanceStockName(trimmedName) ?? trimmedName;
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
