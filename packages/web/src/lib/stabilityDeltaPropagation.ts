import { computeEigenpair, type SimulationResult, type StabilityAnalysis } from "@sfcr/core";

export type StabilityDeltaShockSource = "zero" | "lag-increment" | "current-increment" | "dominant-mode";

export interface StabilityOperatingPointValues {
  current: number[];
  lag: number[];
  lag2: number[];
  pathDelta: number[];
}

const MIN_RELATIVE_BASE = 1e-12;

export interface StabilityDeltaPropagationRow {
  variable: string;
  deltaLag: number;
  deltaCurrent: number;
  xStar: number;
  xLinear: number;
  pathDelta: number;
  /** xₜ linear / xₜ*, or null when xₜ* is too small */
  linearGain: number | null;
  /** xₜ* / xₜ₋₁ (path step ratio), or null when xₜ₋₁ is too small */
  pathGain: number | null;
}

export function multiplicativeGain(numerator: number, denominator: number): number | null {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    Math.abs(denominator) < MIN_RELATIVE_BASE
  ) {
    return null;
  }

  return numerator / denominator;
}

export function formatRelativeGain(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(3);
  }

  return value.toFixed(4);
}

export interface StabilityDeltaPropagationView {
  shockSource: StabilityDeltaShockSource;
  shockLabel: string;
  canUseLagIncrement: boolean;
  rows: StabilityDeltaPropagationRow[];
}

export function multiplyTransitionMatrix(matrix: number[][], deltaLag: number[]): number[] {
  const n = matrix.length;
  const deltaCurrent = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) {
      sum += (matrix[i]?.[j] ?? 0) * (deltaLag[j] ?? 0);
    }
    deltaCurrent[i] = sum;
  }

  return deltaCurrent;
}

export function buildOperatingPointValues(
  result: SimulationResult,
  variables: string[],
  period: number
): StabilityOperatingPointValues | null {
  if (period < 1) {
    return null;
  }

  const current: number[] = [];
  const lag: number[] = [];
  const lag2: number[] = [];
  const pathDelta: number[] = [];

  for (const variable of variables) {
    const series = result.series[variable];
    if (!series || period >= series.length || period - 1 >= series.length) {
      return null;
    }

    const xCurrent = series[period] ?? NaN;
    const xLag = series[period - 1] ?? NaN;
    current.push(xCurrent);
    lag.push(xLag);
    pathDelta.push(xCurrent - xLag);

    if (period >= 2 && period - 2 < series.length) {
      lag2.push(series[period - 2] ?? NaN);
    } else {
      lag2.push(NaN);
    }
  }

  return { current, lag, lag2, pathDelta };
}

export function buildDeltaLagShock(
  analysis: StabilityAnalysis,
  operatingPoint: StabilityOperatingPointValues,
  source: StabilityDeltaShockSource
): { shock: number[]; label: string } {
  const n = analysis.variables.length;

  switch (source) {
    case "zero":
      return {
        shock: new Array<number>(n).fill(0),
        label: "No shock (Δxₜ₋₁ = 0)"
      };
    case "lag-increment":
      return {
        shock: operatingPoint.lag.map((value, index) => value - (operatingPoint.lag2[index] ?? 0)),
        label: "Lag increment Δxₜ₋₁ = x(p−1) − x(p−2) on the simulation path"
      };
    case "current-increment":
      return {
        shock: [...operatingPoint.pathDelta],
        label: "Current-period path increment used as lag shock (x(p) − x(p−1))"
      };
    case "dominant-mode": {
      const pair = computeEigenpair(analysis.T, analysis.dominantMode.eigenvalue, { seedIndex: 0 });
      const components = pair.eigenvector.map((component) => component.re);
      const maxAbs = components.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      const shock =
        maxAbs > 0 ? components.map((value) => value / maxAbs) : new Array<number>(n).fill(0);
      const complexNote =
        Math.abs(analysis.dominantMode.eigenvalue.im) > 1e-8
          ? " (real part of eigenvector; mode is complex)"
          : "";
      return {
        shock,
        label: `Dominant-mode eigenvector (normalized real part)${complexNote}`
      };
    }
  }
}

export function buildStabilityDeltaPropagationView(
  analysis: StabilityAnalysis,
  result: SimulationResult,
  source: StabilityDeltaShockSource
): StabilityDeltaPropagationView | null {
  const operatingPoint = buildOperatingPointValues(result, analysis.variables, analysis.period);
  if (!operatingPoint) {
    return null;
  }

  const canUseLagIncrement = analysis.period >= 2;
  const effectiveSource =
    source === "lag-increment" && !canUseLagIncrement ? "zero" : source;

  const { shock: deltaLag, label: shockLabel } = buildDeltaLagShock(
    analysis,
    operatingPoint,
    effectiveSource
  );
  const deltaCurrent = multiplyTransitionMatrix(analysis.T, deltaLag);

  const rows = analysis.variables.map((variable, index) => {
    const deltaLagValue = deltaLag[index] ?? 0;
    const deltaCurrentValue = deltaCurrent[index] ?? 0;
    const xStar = operatingPoint.current[index] ?? NaN;

    const pathDeltaValue = operatingPoint.pathDelta[index] ?? NaN;
    const xLinear = xStar + deltaCurrentValue;
    const xLag = xStar - pathDeltaValue;

    return {
      variable,
      deltaLag: deltaLagValue,
      deltaCurrent: deltaCurrentValue,
      xStar,
      xLinear,
      pathDelta: pathDeltaValue,
      linearGain: multiplicativeGain(xLinear, xStar),
      pathGain: multiplicativeGain(xStar, xLag)
    };
  });

  return {
    shockSource: effectiveSource,
    shockLabel,
    canUseLagIncrement,
    rows
  };
}

export const STABILITY_DELTA_SHOCK_SOURCES: Array<{
  id: StabilityDeltaShockSource;
  label: string;
  disabledWhen?: "no-lag-increment";
}> = [
  { id: "lag-increment", label: "Lag path increment", disabledWhen: "no-lag-increment" },
  { id: "current-increment", label: "Current path increment" },
  { id: "dominant-mode", label: "Dominant eigenvector" },
  { id: "zero", label: "No shock" }
];
