import { DEFAULT_CLD_LOOP_LIMITS } from "./limits";
import type {
  CldLoopDetectionStopReason,
  DetectLoopsOptions,
  Link,
  Loop,
  LoopEdge,
  LoopPolarity
} from "./types";

export interface DetectLoopsResult {
  loops: Loop[];
  truncated: boolean;
  stopReason?: CldLoopDetectionStopReason;
  maxLoops: number;
  maxLoopLength: number;
  timeoutMs: number;
}

interface DetectLoopsContext {
  maxLoops: number;
  maxLength: number;
  deadline: number;
  found: Map<string, Loop>;
  truncated: boolean;
  stopReason?: CldLoopDetectionStopReason;
}

export function detectLoops(links: Link[], options: DetectLoopsOptions = {}): DetectLoopsResult {
  const nodes = collectNodes(links);
  if (nodes.length === 0) {
    return {
      loops: [],
      truncated: false,
      maxLoops: options.maxLoops ?? DEFAULT_CLD_LOOP_LIMITS.maxLoops,
      maxLoopLength: options.maxLoopLength ?? DEFAULT_CLD_LOOP_LIMITS.maxLoopLength,
      timeoutMs: options.timeoutMs ?? DEFAULT_CLD_LOOP_LIMITS.timeoutMs
    };
  }

  const maxLoops = options.maxLoops ?? DEFAULT_CLD_LOOP_LIMITS.maxLoops;
  const maxLoopLength = Math.min(
    nodes.length,
    options.maxLoopLength ?? DEFAULT_CLD_LOOP_LIMITS.maxLoopLength
  );
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLD_LOOP_LIMITS.timeoutMs;

  const adjacency = buildAdjacency(links);
  const edgeMetaByEdge = buildEdgeMetaMap(links);
  const ctx: DetectLoopsContext = {
    maxLoops,
    maxLength: maxLoopLength,
    deadline: Date.now() + timeoutMs,
    found: new Map<string, Loop>(),
    truncated: false
  };

  for (const start of nodes) {
    if (shouldAbortLoopSearch(ctx)) {
      break;
    }
    enumerateCyclesFrom(start, start, adjacency, edgeMetaByEdge, ctx, [start], new Set([start]));
  }

  return {
    loops: [...ctx.found.values()].sort(compareLoops),
    truncated: ctx.truncated,
    stopReason: ctx.stopReason,
    maxLoops,
    maxLoopLength,
    timeoutMs
  };
}

export function formatLoopSummary(loops: Loop[]): string {
  let reinforcingIndex = 0;
  let balancingIndex = 0;
  const lines: string[] = [];

  for (const loop of loops) {
    const label =
      loop.polarity === "R"
        ? `R${++reinforcingIndex}`
        : `B${++balancingIndex}`;
    lines.push(`${label}: ${formatSignedLoopPath(loop)}`);
  }

  return lines.join("\n");
}

export function formatSignedLoopPath(loop: Loop): string {
  if (loop.edges.length === 0) {
    return "";
  }

  const parts: string[] = [];
  for (const edge of loop.edges) {
    const arrow = edge.lagged ? "⇢" : "➙";
    if (parts.length === 0) {
      parts.push(edge.from);
    }
    if (edge.lagged) {
      const last = parts[parts.length - 1];
      if (last === edge.from) {
        parts[parts.length - 1] = `${edge.from}_-1`;
      }
    }
    parts.push(` ${edge.polarity}${arrow} `);
    parts.push(edge.to);
  }
  return parts.join("");
}

/** Node-only rendering for compatibility. */
export function formatLoopPath(nodes: string[]): string {
  if (nodes.length === 0) {
    return "";
  }
  const closed = nodes[0] === nodes[nodes.length - 1] ? nodes : [...nodes, nodes[0]];
  return closed.join(" → ");
}

function collectNodes(links: Link[]): string[] {
  const nodes = new Set<string>();
  for (const link of links) {
    nodes.add(link.from);
    nodes.add(link.to);
  }
  return [...nodes].sort((left, right) => left.localeCompare(right));
}

function buildAdjacency(links: Link[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const link of links) {
    const neighbors = adjacency.get(link.from) ?? [];
    if (!neighbors.includes(link.to)) {
      neighbors.push(link.to);
    }
    adjacency.set(link.from, neighbors);
  }
  for (const node of collectNodes(links)) {
    if (!adjacency.has(node)) {
      adjacency.set(node, []);
    }
  }
  return adjacency;
}

function buildEdgeMetaMap(links: Link[]): Map<string, { polarity: "+" | "-"; lagged: boolean }> {
  const polarityByEdge = new Map<string, { polarity: "+" | "-"; lagged: boolean }>();
  for (const link of links) {
    polarityByEdge.set(`${link.from}->${link.to}`, {
      polarity: link.polarity,
      lagged: link.lagged
    });
  }
  return polarityByEdge;
}

function shouldAbortLoopSearch(ctx: DetectLoopsContext): boolean {
  if (ctx.found.size >= ctx.maxLoops) {
    if (!ctx.truncated) {
      ctx.truncated = true;
      ctx.stopReason = "maxLoops";
    }
    return true;
  }
  if (Date.now() >= ctx.deadline) {
    if (!ctx.truncated) {
      ctx.truncated = true;
      ctx.stopReason = "timeout";
    }
    return true;
  }
  return false;
}

function enumerateCyclesFrom(
  start: string,
  current: string,
  adjacency: Map<string, string[]>,
  edgeMetaByEdge: Map<string, { polarity: "+" | "-"; lagged: boolean }>,
  ctx: DetectLoopsContext,
  path: string[],
  visited: Set<string>
): void {
  if (shouldAbortLoopSearch(ctx)) {
    return;
  }

  if (path.length > ctx.maxLength) {
    return;
  }

  const neighbors = adjacency.get(current) ?? [];
  for (const next of neighbors) {
    if (shouldAbortLoopSearch(ctx)) {
      return;
    }

    if (next === start && path.length >= 2) {
      recordCycle(path, edgeMetaByEdge, ctx.found);
      continue;
    }

    if (visited.has(next)) {
      continue;
    }

    visited.add(next);
    path.push(next);
    enumerateCyclesFrom(start, next, adjacency, edgeMetaByEdge, ctx, path, visited);
    path.pop();
    visited.delete(next);
  }
}

function recordCycle(
  path: string[],
  edgeMetaByEdge: Map<string, { polarity: "+" | "-"; lagged: boolean }>,
  found: Map<string, Loop>
): void {
  const normalized = normalizeCycle(path);
  const key = normalized.join("\0");
  if (found.has(key)) {
    return;
  }

  let negativeCount = 0;
  const edges: LoopEdge[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const from = normalized[index];
    const to = normalized[index + 1];
    const meta = edgeMetaByEdge.get(`${from}->${to}`) ?? { polarity: "+", lagged: false };
    edges.push({ from, to, polarity: meta.polarity, lagged: meta.lagged });
    if (meta.polarity === "-") {
      negativeCount += 1;
    }
  }

  const polarity: LoopPolarity = negativeCount % 2 === 0 ? "R" : "B";
  found.set(key, { nodes: normalized, edges, polarity });
}

function normalizeCycle(path: string[]): string[] {
  const body = path.slice();
  if (body.length === 0) {
    return [];
  }

  let bestRotation = body;
  for (let offset = 1; offset < body.length; offset += 1) {
    const rotated = [...body.slice(offset), ...body.slice(0, offset)];
    if (compareNodeSequences(rotated, bestRotation) < 0) {
      bestRotation = rotated;
    }
  }

  return [...bestRotation, bestRotation[0]];
}

function compareNodeSequences(left: string[], right: string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const byName = left[index].localeCompare(right[index]);
    if (byName !== 0) {
      return byName;
    }
  }
  return left.length - right.length;
}

function compareLoops(left: Loop, right: Loop): number {
  const polarityRank = (polarity: LoopPolarity) => (polarity === "R" ? 0 : 1);
  const byPolarity = polarityRank(left.polarity) - polarityRank(right.polarity);
  if (byPolarity !== 0) {
    return byPolarity;
  }
  const byLength = left.nodes.length - right.nodes.length;
  if (byLength !== 0) {
    return byLength;
  }
  return compareNodeSequences(left.nodes, right.nodes);
}
