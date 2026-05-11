import type { PositionedNode } from "./dependencyGraphLayout";

export function getNodeBoundaryPoint(
  from: Pick<PositionedNode, "x" | "y">,
  toward: Pick<PositionedNode, "x" | "y">,
  nodeWidth: number,
  nodeHeight: number
): { x: number; y: number } {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const halfWidth = nodeWidth / 2;
  const halfHeight = nodeHeight / 2;

  if (dx === 0 && dy === 0) {
    return { x: from.x, y: from.y };
  }

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: from.x + dx * scale,
    y: from.y + dy * scale
  };
}

export function buildObstacleAwareEdgeControls(args: {
  allNodes: PositionedNode[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  source: PositionedNode;
  target: PositionedNode;
  nodeWidth: number;
  nodeHeight: number;
  sameColumn: boolean;
  sameRow: boolean;
  horizontalBias: number;
  verticalBias: number;
}): { c1x: number; c1y: number; c2x: number; c2y: number } {
  const dx = args.end.x - args.start.x;
  const dy = args.end.y - args.start.y;
  const signX = Math.sign(dx || 1);
  const signY = Math.sign(dy || 1);

  if (args.sameColumn) {
    const detourX = computeVerticalDetour(args);
    return {
      c1x: args.start.x + detourX,
      c1y: args.start.y + signY * args.verticalBias,
      c2x: args.end.x + detourX,
      c2y: args.end.y - signY * args.verticalBias
    };
  }

  if (args.sameRow) {
    const detourY = computeHorizontalDetour(args);
    return {
      c1x: args.start.x + signX * args.horizontalBias,
      c1y: args.start.y + detourY,
      c2x: args.end.x - signX * args.horizontalBias,
      c2y: args.end.y + detourY
    };
  }

  const detour = computeDiagonalDetour(args);
  return {
    c1x: args.start.x + signX * args.horizontalBias,
    c1y: args.start.y + dy * 0.12 + detour,
    c2x: args.end.x - signX * args.horizontalBias,
    c2y: args.end.y - dy * 0.12 + detour
  };
}

function computeHorizontalDetour(args: {
  allNodes: PositionedNode[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  source: PositionedNode;
  target: PositionedNode;
  nodeWidth: number;
  nodeHeight: number;
}): number {
  const obstacles = args.allNodes.filter((node) => {
    if (node.id === args.source.id || node.id === args.target.id) {
      return false;
    }
    return (
      node.x > Math.min(args.start.x, args.end.x) - args.nodeWidth * 0.8 &&
      node.x < Math.max(args.start.x, args.end.x) + args.nodeWidth * 0.8 &&
      Math.abs(node.y - args.start.y) < args.nodeHeight * 1.15
    );
  });
  if (obstacles.length === 0) {
    return 0;
  }
  const obstacleCenterY = obstacles.reduce((sum, node) => sum + node.y, 0) / obstacles.length;
  const direction = obstacleCenterY >= args.start.y ? -1 : 1;
  return direction * Math.min(42, 18 + obstacles.length * 7);
}

function computeVerticalDetour(args: {
  allNodes: PositionedNode[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  source: PositionedNode;
  target: PositionedNode;
  nodeWidth: number;
  nodeHeight: number;
}): number {
  const obstacles = args.allNodes.filter((node) => {
    if (node.id === args.source.id || node.id === args.target.id) {
      return false;
    }
    return (
      node.y > Math.min(args.start.y, args.end.y) - args.nodeHeight * 0.8 &&
      node.y < Math.max(args.start.y, args.end.y) + args.nodeHeight * 0.8 &&
      Math.abs(node.x - args.start.x) < args.nodeWidth * 1.15
    );
  });
  if (obstacles.length === 0) {
    return 0;
  }
  const obstacleCenterX = obstacles.reduce((sum, node) => sum + node.x, 0) / obstacles.length;
  const direction = obstacleCenterX >= args.start.x ? -1 : 1;
  return direction * Math.min(36, 16 + obstacles.length * 6);
}

function computeDiagonalDetour(args: {
  allNodes: PositionedNode[];
  start: { x: number; y: number };
  end: { x: number; y: number };
  source: PositionedNode;
  target: PositionedNode;
  nodeWidth: number;
  nodeHeight: number;
}): number {
  const obstacles = args.allNodes.filter((node) => {
    if (node.id === args.source.id || node.id === args.target.id) {
      return false;
    }
    const distance = distancePointToSegment(node.x, node.y, args.start.x, args.start.y, args.end.x, args.end.y);
    return distance < Math.max(args.nodeWidth, args.nodeHeight) * 0.75;
  });
  if (obstacles.length === 0) {
    return 0;
  }
  const midpointY = (args.start.y + args.end.y) / 2;
  const obstacleCenterY = obstacles.reduce((sum, node) => sum + node.y, 0) / obstacles.length;
  const direction = obstacleCenterY >= midpointY ? -1 : 1;
  return direction * Math.min(34, 12 + obstacles.length * 6);
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
