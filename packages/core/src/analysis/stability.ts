import {
  computeEigenpair,
  eigenvaluesOfMatrix,
  type EigenpairResult,
  type Eigenvalue
} from "./eigenvalues";
import {
  computeTransitionMatrix,
  type TransitionMatrixAnalysis,
  type TransitionMatrixOptions
} from "./transitionMatrix";
import type { SimulationResult } from "../result/result";

export const DEFAULT_STABILITY_EPS = 1e-6;
export const DEFAULT_UNIT_ROOT_BAND = 1e-3;
export const DEFAULT_PARTICIPATION_MIN_WEIGHT = 0.01;
export const DEFAULT_MAX_ANALYZED_MODES = 6;

export type StabilityClassification = "stable" | "marginal" | "unstable";

export interface ModeParticipation {
  variable: string;
  weight: number;
}

/** @deprecated Use ModeParticipation */
export type DominantModeParticipation = ModeParticipation;

export interface EigenmodeAnalysis {
  eigenvalue: Eigenvalue;
  eigenpairResidualNorm: number;
  eigenpairResidualRelative: number;
  reliable: boolean;
  participation: ModeParticipation[];
}

export interface StabilityAnalysis extends TransitionMatrixAnalysis {
  eigenvalues: Eigenvalue[];
  spectralRadius: number;
  classification: StabilityClassification;
  dominantMode: EigenmodeAnalysis;
  nearUnitRootModes: EigenmodeAnalysis[];
}

export interface StabilityOptions {
  tolerance?: number;
  unitRootBand?: number;
  participationMinWeight?: number;
  maxAnalyzedModes?: number;
  transition?: TransitionMatrixOptions;
}

export function classifyStability(
  spectralRadius: number,
  tolerance = DEFAULT_STABILITY_EPS
): StabilityClassification {
  if (spectralRadius < 1 - tolerance) {
    return "stable";
  }

  if (spectralRadius <= 1 + tolerance) {
    return "marginal";
  }

  return "unstable";
}

export function computeStabilityMetrics(
  result: SimulationResult,
  period: number,
  options?: StabilityOptions
): StabilityAnalysis {
  const transition = computeTransitionMatrix(result, period, options?.transition);
  const tolerance = options?.tolerance ?? DEFAULT_STABILITY_EPS;
  const unitRootBand = options?.unitRootBand ?? DEFAULT_UNIT_ROOT_BAND;
  const participationMinWeight = options?.participationMinWeight ?? DEFAULT_PARTICIPATION_MIN_WEIGHT;
  const maxAnalyzedModes = options?.maxAnalyzedModes ?? DEFAULT_MAX_ANALYZED_MODES;

  const eigenvalues = eigenvaluesOfMatrix(transition.T);
  const spectralRadius = eigenvalues.reduce(
    (max, eigenvalue) => Math.max(max, eigenvalue.abs),
    0
  );
  const classification = classifyStability(spectralRadius, tolerance);
  const modesToAnalyze = selectModesForAnalysis(eigenvalues, unitRootBand, maxAnalyzedModes);
  const analyzedModes = modesToAnalyze.map((eigenvalue, index) =>
    buildEigenmodeAnalysis(transition.variables, transition.T, eigenvalue, index, participationMinWeight)
  );

  const dominantMode = analyzedModes[0] ?? buildEigenmodeAnalysis(
    transition.variables,
    transition.T,
    eigenvalues[0] ?? { re: 0, im: 0, abs: 0 },
    0,
    participationMinWeight
  );
  const nearUnitRootModes = analyzedModes.filter(
    (mode, index) => index > 0 && Math.abs(mode.eigenvalue.abs - 1) <= unitRootBand
  );

  return {
    ...transition,
    eigenvalues,
    spectralRadius,
    classification,
    dominantMode,
    nearUnitRootModes
  };
}

function selectModesForAnalysis(
  eigenvalues: Eigenvalue[],
  unitRootBand: number,
  maxAnalyzedModes: number
): Eigenvalue[] {
  const selected: Eigenvalue[] = [];
  const seen = new Set<string>();

  const pushUnique = (eigenvalue: Eigenvalue) => {
    const key = eigenvalueKey(eigenvalue);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    selected.push(eigenvalue);
  };

  const dominant = eigenvalues[0];
  if (dominant) {
    pushUnique(dominant);
  }

  for (const eigenvalue of eigenvalues) {
    if (Math.abs(eigenvalue.abs - 1) <= unitRootBand) {
      pushUnique(eigenvalue);
    }
    if (selected.length >= maxAnalyzedModes) {
      break;
    }
  }

  for (const eigenvalue of eigenvalues) {
    if (selected.length >= maxAnalyzedModes) {
      break;
    }
    pushUnique(eigenvalue);
  }

  return selected.slice(0, maxAnalyzedModes);
}

function eigenvalueKey(eigenvalue: Eigenvalue): string {
  return `${eigenvalue.re.toFixed(8)}:${eigenvalue.im.toFixed(8)}`;
}

function buildEigenmodeAnalysis(
  variables: string[],
  matrix: number[][],
  eigenvalue: Eigenvalue,
  seedIndex: number,
  participationMinWeight: number
): EigenmodeAnalysis {
  const pair = computeEigenpair(matrix, eigenvalue, { seedIndex });

  return {
    eigenvalue: pair.eigenvalue,
    eigenpairResidualNorm: pair.eigenpairResidualNorm,
    eigenpairResidualRelative: pair.eigenpairResidualRelative,
    reliable: pair.reliable,
    participation: buildParticipation(variables, pair.eigenvector, participationMinWeight)
  };
}

export function buildParticipation(
  variables: string[],
  eigenvector: Array<{ re: number; im: number }>,
  minWeight = DEFAULT_PARTICIPATION_MIN_WEIGHT,
  maxEntries = 5
): ModeParticipation[] {
  const weights = eigenvector.map((component) => Math.hypot(component.re, component.im));
  const maxWeight = weights.reduce((max, weight) => Math.max(max, weight), 0);

  const participation = variables
    .map((variable, index) => ({
      variable,
      weight: maxWeight > 0 ? (weights[index] ?? 0) / maxWeight : 0
    }))
    .filter((entry) => entry.weight >= minWeight)
    .sort((left, right) => {
      const weightDelta = right.weight - left.weight;
      if (Math.abs(weightDelta) > 1e-12) {
        return weightDelta;
      }
      return left.variable.localeCompare(right.variable);
    });

  if (participation.length > 0) {
    return participation.slice(0, maxEntries);
  }

  return variables
    .map((variable, index) => ({
      variable,
      weight: maxWeight > 0 ? (weights[index] ?? 0) / maxWeight : 0
    }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, maxEntries);
}

export function eigenmodeFromPair(
  variables: string[],
  pair: EigenpairResult,
  participationMinWeight = DEFAULT_PARTICIPATION_MIN_WEIGHT
): EigenmodeAnalysis {
  return {
    eigenvalue: pair.eigenvalue,
    eigenpairResidualNorm: pair.eigenpairResidualNorm,
    eigenpairResidualRelative: pair.eigenpairResidualRelative,
    reliable: pair.reliable,
    participation: buildParticipation(variables, pair.eigenvector, participationMinWeight)
  };
}
