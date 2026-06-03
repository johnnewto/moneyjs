import { DEFAULT_MIN_ABS_WEIGHT } from "./transitionGraph";
import type { TransitionEdge } from "./transitionGraph";
import type { TransitionMatrixAnalysis } from "./transitionMatrix";

export interface TransitionLoop {
  nodes: string[];
  edges: TransitionEdge[];
  gain: number;
  absGain: number;
}

export interface BuildTransitionLoopsOptions {
  minAbsWeight?: number;
  maxLoops?: number;
  maxLoopLength?: number;
  timeoutMs?: number;
}

export interface TransitionLoopsResult {
  loops: TransitionLoop[];
  truncated: boolean;
  inTransitionState: boolean;
}

const DEFAULT_MAX_LOOPS = 200;
const DEFAULT_MAX_LOOP_LENGTH = 24;
const DEFAULT_TIMEOUT_MS = 2500;

export function buildTransitionLoopsThroughVariable(
  analysis: TransitionMatrixAnalysis,
  variable: string,
  options?: BuildTransitionLoopsOptions
): TransitionLoopsResult {
  const variableIndex = analysis.variables.indexOf(variable);
  if (variableIndex === -1) {
    return {
      loops: [],
      truncated: false,
      inTransitionState: false
    };
  }

  const minAbsWeight = options?.minAbsWeight ?? DEFAULT_MIN_ABS_WEIGHT;
  const maxLoops = options?.maxLoops ?? DEFAULT_MAX_LOOPS;
  const maxLoopLength = Math.min(
    analysis.variables.length,
    options?.maxLoopLength ?? DEFAULT_MAX_LOOP_LENGTH
  );
  const deadline = Date.now() + (options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const weightByEdge = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (let i = 0; i < analysis.variables.length; i += 1) {
    for (let j = 0; j < analysis.variables.length; j += 1) {
      const weight = analysis.T[i]?.[j] ?? 0;
      if (Math.abs(weight) < minAbsWeight) {
        continue;
      }

      const from = analysis.variables[j];
      const to = analysis.variables[i];
      if (!from || !to) {
        continue;
      }

      weightByEdge.set(`${from}->${to}`, weight);
      const neighbors = adjacency.get(from) ?? [];
      if (!neighbors.includes(to)) {
        neighbors.push(to);
      }
      adjacency.set(from, neighbors);
    }
  }

  const found = new Map<string, TransitionLoop>();
  let truncated = false;

  const selfWeight = analysis.T[variableIndex]?.[variableIndex] ?? 0;
  if (Math.abs(selfWeight) >= minAbsWeight) {
    recordLoop(
      [variable, variable],
      weightByEdge,
      found
    );
  }

  function shouldAbort(): boolean {
    if (found.size >= maxLoops) {
      truncated = true;
      return true;
    }
    if (Date.now() >= deadline) {
      truncated = true;
      return true;
    }
    return false;
  }

  function dfs(current: string, path: string[], visited: Set<string>): void {
    if (shouldAbort()) {
      return;
    }

    if (path.length > maxLoopLength) {
      return;
    }

    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (shouldAbort()) {
        return;
      }

      if (next === variable && path.length >= 2) {
        recordLoop([...path, variable], weightByEdge, found);
        continue;
      }

      if (visited.has(next)) {
        continue;
      }

      visited.add(next);
      path.push(next);
      dfs(next, path, visited);
      path.pop();
      visited.delete(next);
    }
  }

  dfs(variable, [variable], new Set([variable]));

  const loops = [...found.values()].sort(compareTransitionLoops);

  return {
    loops,
    truncated,
    inTransitionState: true
  };
}

export function formatTransitionLoopPath(loop: TransitionLoop): string {
  if (loop.nodes.length === 0) {
    return "";
  }

  return loop.nodes.join(" → ");
}

function recordLoop(
  nodes: string[],
  weightByEdge: Map<string, number>,
  found: Map<string, TransitionLoop>
): void {
  if (nodes.length < 2) {
    return;
  }

  const key = nodes.join("\0");
  if (found.has(key)) {
    return;
  }

  const edges: TransitionEdge[] = [];
  let gain = 1;

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    if (!from || !to) {
      return;
    }

    const weight = weightByEdge.get(`${from}->${to}`);
    if (weight === undefined) {
      return;
    }

    edges.push({ from, to, weight });
    gain *= weight;
  }

  found.set(key, {
    nodes,
    edges,
    gain,
    absGain: Math.abs(gain)
  });
}

function compareTransitionLoops(left: TransitionLoop, right: TransitionLoop): number {
  const byAbsGain = right.absGain - left.absGain;
  if (Math.abs(byAbsGain) > 1e-12) {
    return byAbsGain;
  }

  const byLength = left.nodes.length - right.nodes.length;
  if (byLength !== 0) {
    return byLength;
  }

  return formatTransitionLoopPath(left).localeCompare(formatTransitionLoopPath(right));
}
