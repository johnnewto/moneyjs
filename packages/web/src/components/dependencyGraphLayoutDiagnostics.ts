import type { DependencyGraphEdge, ParsedDependencyGraph } from "../notebook/dependencyGraph";
import {
  DIAGNOSTIC_BOX_INSET_X,
  DIAGNOSTIC_BOX_INSET_Y,
  NODE_HEIGHT,
  NODE_WIDTH
} from "./dependencyGraphLayoutConfig";
import type {
  DependencyLayoutDiagnostics,
  DependencyOverlapPair,
  PositionedNode
} from "./dependencyGraphLayoutTypes";

export function computeDependencyLayoutDiagnostics(
  nodes: PositionedNode[],
  graph: Pick<ParsedDependencyGraph, "edges">,
  options?: {
    horizontalMinX?: number;
    horizontalMaxX?: number;
    hardMinHorizontalGap?: number;
  }
): DependencyLayoutDiagnostics {
  const nodeBoxes = nodes.map((node) => ({
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
    left: node.x - NODE_WIDTH / 2 + DIAGNOSTIC_BOX_INSET_X,
    top: node.y - NODE_HEIGHT / 2 + DIAGNOSTIC_BOX_INSET_Y,
    right: node.x + NODE_WIDTH / 2 - DIAGNOSTIC_BOX_INSET_X,
    bottom: node.y + NODE_HEIGHT / 2 - DIAGNOSTIC_BOX_INSET_Y,
    width: NODE_WIDTH - DIAGNOSTIC_BOX_INSET_X * 2,
    height: NODE_HEIGHT - DIAGNOSTIC_BOX_INSET_Y * 2,
    isExogenous: node.variableType === "exogenous"
  }));
  const overlapPairs: DependencyOverlapPair[] = [];

  for (let leftIndex = 0; leftIndex < nodeBoxes.length; leftIndex += 1) {
    const left = nodeBoxes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < nodeBoxes.length; rightIndex += 1) {
      const right = nodeBoxes[rightIndex];
      const overlapX = Math.min(left.right, right.right) - Math.max(left.left, right.left);
      const overlapY = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
      if (overlapX <= 0 || overlapY <= 0) {
        continue;
      }
      const overlapArea = overlapX * overlapY;
      overlapPairs.push({
        leftId: left.id,
        rightId: right.id,
        overlapX,
        overlapY,
        overlapArea,
        overlapRatio: overlapArea / (left.width * left.height)
      });
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingEdgesBySource = new Map<string, DependencyGraphEdge[]>();
  graph.edges.forEach((edge) => {
    const bucket = outgoingEdgesBySource.get(edge.sourceId) ?? [];
    bucket.push(edge);
    outgoingEdgesBySource.set(edge.sourceId, bucket);
  });
  const exogenousPlacements = nodes
    .filter((node) => node.variableType === "exogenous")
    .map((node) => {
      const outgoingTargets = (outgoingEdgesBySource.get(node.id) ?? [])
        .map((edge) => {
          const target = nodeById.get(edge.targetId);
          if (!target) {
            return null;
          }
          const weight = edge.current ? (edge.lagged ? 1.4 : 2) : 0.8;
          return { target, weight };
        })
        .filter((value): value is { target: PositionedNode; weight: number } => value != null);
      const totalWeight = outgoingTargets.reduce((sum, entry) => sum + entry.weight, 0);
      const targetX =
        totalWeight > 0
          ? outgoingTargets.reduce((sum, entry) => sum + entry.target.x * entry.weight, 0) / totalWeight
          : node.x;
      const targetY =
        totalWeight > 0
          ? outgoingTargets.reduce((sum, entry) => sum + entry.target.y * entry.weight, 0) / totalWeight
          : node.y;
      return {
        finalX: node.x,
        finalY: node.y,
        hardMinHorizontalGap: options?.hardMinHorizontalGap ?? NODE_WIDTH + 16,
        horizontalMaxX: options?.horizontalMaxX ?? Number.POSITIVE_INFINITY,
        horizontalMinX: options?.horizontalMinX ?? Number.NEGATIVE_INFINITY,
        isBoundSaturated:
          ((options?.horizontalMinX ?? Number.NEGATIVE_INFINITY) !== Number.NEGATIVE_INFINITY &&
            Math.abs(node.x - (options?.horizontalMinX ?? 0)) < 1.5) ||
          ((options?.horizontalMaxX ?? Number.POSITIVE_INFINITY) !== Number.POSITIVE_INFINITY &&
            Math.abs(node.x - (options?.horizontalMaxX ?? 0)) < 1.5),
        name: node.name,
        nodeId: node.id,
        outgoingTargetIds: outgoingTargets.map((entry) => entry.target.id),
        targetX,
        targetY
      };
    });

  return {
    nodeBoxes,
    overlapPairs,
    maxOverlapRatio: overlapPairs.reduce((max, pair) => Math.max(max, pair.overlapRatio), 0),
    exogenousPlacements,
    cellSpreadEntries: []
  };
}
