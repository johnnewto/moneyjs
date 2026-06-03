import type { EigenmodeAnalysis } from "./stability";
import type { TransitionMatrixAnalysis } from "./transitionMatrix";

export interface TransitionEdge {
  from: string;
  to: string;
  weight: number;
}

export interface BuildTransitionGraphOptions {
  minAbsWeight?: number;
  maxEdges?: number;
  includeSelfLoops?: boolean;
}

export const DEFAULT_MIN_ABS_WEIGHT = 1e-4;
export const DEFAULT_MAX_EDGES = 50;

export function buildTransitionGraph(
  analysis: TransitionMatrixAnalysis,
  options?: BuildTransitionGraphOptions
): TransitionEdge[] {
  const minAbsWeight = options?.minAbsWeight ?? DEFAULT_MIN_ABS_WEIGHT;
  const maxEdges = options?.maxEdges ?? DEFAULT_MAX_EDGES;
  const includeSelfLoops = options?.includeSelfLoops ?? true;

  const edges: TransitionEdge[] = [];

  for (let i = 0; i < analysis.variables.length; i += 1) {
    for (let j = 0; j < analysis.variables.length; j += 1) {
      if (!includeSelfLoops && i === j) {
        continue;
      }

      const weight = analysis.T[i]?.[j] ?? 0;
      if (Math.abs(weight) < minAbsWeight) {
        continue;
      }

      const from = analysis.variables[j];
      const to = analysis.variables[i];
      if (!from || !to) {
        continue;
      }

      edges.push({ from, to, weight });
    }
  }

  sortTransitionEdges(edges);

  if (maxEdges === Number.POSITIVE_INFINITY) {
    return edges;
  }

  return edges.slice(0, maxEdges);
}

export function buildModeTransitionGraph(
  analysis: TransitionMatrixAnalysis,
  mode: EigenmodeAnalysis,
  options?: BuildTransitionGraphOptions & { minParticipation?: number }
): TransitionEdge[] {
  const minParticipation = options?.minParticipation ?? 0.01;
  const participatingVariables = new Set(
    mode.participation
      .filter((entry) => entry.weight >= minParticipation)
      .map((entry) => entry.variable)
  );

  if (participatingVariables.size === 0) {
    for (const entry of mode.participation) {
      participatingVariables.add(entry.variable);
    }
  }

  return buildTransitionGraph(analysis, options).filter(
    (edge) => participatingVariables.has(edge.from) && participatingVariables.has(edge.to)
  );
}

export interface VariableTransitionEffects {
  incoming: TransitionEdge[];
  outgoing: TransitionEdge[];
  inTransitionState: boolean;
}

export function buildTransitionEffectsForVariable(
  analysis: TransitionMatrixAnalysis,
  variable: string,
  options?: BuildTransitionGraphOptions
): VariableTransitionEffects {
  const variableIndex = analysis.variables.indexOf(variable);
  if (variableIndex === -1) {
    return {
      incoming: [],
      outgoing: [],
      inTransitionState: false
    };
  }

  const minAbsWeight = options?.minAbsWeight ?? DEFAULT_MIN_ABS_WEIGHT;
  const incoming: TransitionEdge[] = [];
  const outgoing: TransitionEdge[] = [];

  for (let j = 0; j < analysis.variables.length; j += 1) {
    const weight = analysis.T[variableIndex]?.[j] ?? 0;
    if (Math.abs(weight) < minAbsWeight) {
      continue;
    }

    const from = analysis.variables[j];
    if (!from) {
      continue;
    }

    incoming.push({ from, to: variable, weight });
  }

  for (let i = 0; i < analysis.variables.length; i += 1) {
    const weight = analysis.T[i]?.[variableIndex] ?? 0;
    if (Math.abs(weight) < minAbsWeight) {
      continue;
    }

    const to = analysis.variables[i];
    if (!to) {
      continue;
    }

    outgoing.push({ from: variable, to, weight });
  }

  sortTransitionEdges(incoming);
  sortTransitionEdges(outgoing);

  return {
    incoming,
    outgoing,
    inTransitionState: true
  };
}

function sortTransitionEdges(edges: TransitionEdge[]): void {
  edges.sort((left, right) => {
    const weightDelta = Math.abs(right.weight) - Math.abs(left.weight);
    if (Math.abs(weightDelta) > 1e-12) {
      return weightDelta;
    }

    const fromDelta = left.from.localeCompare(right.from);
    if (fromDelta !== 0) {
      return fromDelta;
    }

    return left.to.localeCompare(right.to);
  });
}
