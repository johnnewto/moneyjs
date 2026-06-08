const MIN_RELATIVE_BASE = 1e-12;

/** Relative path increment d(x)/x' = (x - x') / x' for current x and lagged x'. */
export function computeEquationVariableGain(
  current: number | undefined,
  lagged: number | undefined
): number | null {
  if (
    current == null ||
    lagged == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(lagged)
  ) {
    return null;
  }

  if (Math.abs(lagged) < MIN_RELATIVE_BASE) {
    return null;
  }

  return (current - lagged) / lagged;
}

export function formatEquationVariableGain(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(3);
  }

  return value.toFixed(4);
}
