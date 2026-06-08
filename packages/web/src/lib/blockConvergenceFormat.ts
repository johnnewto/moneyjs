import type { BlockConvergenceAnalysis, BlockConvergenceStatus } from "@sfcr/core";

export function formatBlockConvergenceStatus(status: BlockConvergenceStatus): string {
  switch (status) {
    case "acyclic":
      return "One-step";
    case "converged":
      return "Converged";
    case "max_iterations":
      return "Did not converge";
    case "non_finite":
      return "Non-finite";
    case "singular_jacobian":
      return "Singular Jacobian";
  }
}

export function formatBlockSeedSource(
  seedSource: BlockConvergenceAnalysis["seedSource"]
): string {
  switch (seedSource) {
    case "lag":
      return "Lagged values (period 0 / initial values)";
    case "current_slot":
      return "Current-period slot (Gauss–Seidel default)";
    case "explicit_guess":
      return "Explicit guess";
    case "acyclic":
      return "N/A (acyclic block)";
  }
}

export function blockConvergenceStatusClass(status: BlockConvergenceStatus): string {
  switch (status) {
    case "converged":
    case "acyclic":
      return "is-stable";
    case "max_iterations":
    case "singular_jacobian":
      return "is-unstable";
    case "non_finite":
      return "is-marginal";
  }
}

export function describeBlockSeedSource(
  seedSource: BlockConvergenceAnalysis["seedSource"]
): string | null {
  switch (seedSource) {
    case "lag":
      return "Each variable started from its lag / period-0 value (initial values at period 1).";
    case "current_slot":
      return "Each variable started from the current-period workspace (default initial value or values set by upstream blocks).";
    case "explicit_guess":
      return "Each variable started from an explicit probe guess.";
    case "acyclic":
      return null;
  }
}

export function formatBlockConvergenceValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(3);
  }

  return value.toFixed(4);
}

export function listBlockVariableValues(
  variables: string[],
  values: Record<string, number>
): Array<{ name: string; value: string }> {
  return variables.map((name) => ({
    name,
    value: formatBlockConvergenceValue(values[name] ?? NaN)
  }));
}

export function shouldShowBlockFinalValues(
  status: BlockConvergenceStatus,
  initialGuess: Record<string, number>,
  finalValues?: Record<string, number>
): finalValues is Record<string, number> {
  if (!finalValues || status !== "converged") {
    return false;
  }

  return Object.keys(initialGuess).some(
    (name) => formatBlockConvergenceValue(initialGuess[name] ?? NaN) !== formatBlockConvergenceValue(finalValues[name] ?? NaN)
  );
}
