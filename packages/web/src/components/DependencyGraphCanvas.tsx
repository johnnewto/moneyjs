import { useEffect, useMemo, useRef, useState } from "react";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { DependencyRowMembership, DependencyRowTopology } from "../notebook/dependencyRows";
import type { DependencySectorDisplayOccurrences } from "../notebook/dependencySectors";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  ParsedDependencyGraph
} from "../notebook/dependencyGraph";
import {
  buildDependencyGraphLayoutSnapshot,
  type DependencyLayoutDiagnostics,
  type PositionedNode
} from "./dependencyGraphLayout";
import { renderVariableMathSvgLabel } from "./VariableMathLabel";

export { buildDependencyGraphLayoutSnapshot } from "./dependencyGraphLayout";

interface DependencyGraphCanvasProps {
  graph: ParsedDependencyGraph;
  sectorDisplayOccurrences?: DependencySectorDisplayOccurrences | null;
  sectorTopology?: import("@sfcr/core").SectorTopology | null;
  rowTopology?: DependencyRowTopology | null;
  variableDescriptions?: VariableDescriptions;
  onNodeClick?(node: PositionedNode): void;
  showAccountingStrips?: boolean;
  ignoreInferredBandsForPlacement?: boolean;
  debugOverlay?: boolean;
}

const MIN_CANVAS_WIDTH = 720;
const TOP_PADDING = 72;

const NODE_COLORS: Record<
  DependencyGraphNode["variableType"],
  { fill: string; stroke: string; accent: string }
> = {
  exogenous: { fill: "#eef2ff", stroke: "#6366f1", accent: "#4338ca" },
  parameter: { fill: "#eff6ff", stroke: "#3b82f6", accent: "#1d4ed8" },
  auxiliary: { fill: "#f8fafc", stroke: "#64748b", accent: "#334155" },
  flow: { fill: "#ecfeff", stroke: "#0891b2", accent: "#0f766e" },
  stock: { fill: "#fef3c7", stroke: "#d97706", accent: "#b45309" }
};

const MATRIX_BADGE_STYLES = {
  transaction: { fill: "#0f766e", stroke: "#0b5f59", label: "T" },
  balance: { fill: "#b45309", stroke: "#92400e", label: "B" },
  both: { fill: "#334155", stroke: "#0f172a", label: "TB" }
} as const;

export function DependencyGraphCanvas({
  graph,
  sectorDisplayOccurrences,
  sectorTopology,
  rowTopology,
  variableDescriptions,
  onNodeClick,
  showAccountingStrips = false,
  ignoreInferredBandsForPlacement = false,
  debugOverlay = false
}: DependencyGraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(MIN_CANVAS_WIDTH);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const snapshot = useMemo(
    () =>
      buildDependencyGraphLayoutSnapshot({
        graph,
        availableWidth: width,
        rowTopology,
        sectorDisplayOccurrences,
        sectorTopology,
        showAccountingStrips,
        ignoreInferredBandsForPlacement
      }),
    [
      graph,
      rowTopology,
      sectorDisplayOccurrences,
      sectorTopology,
      showAccountingStrips,
      ignoreInferredBandsForPlacement,
      width
    ]
  );
  const { diagnostics, layout, renderGraph } = snapshot;
  const nodePositions = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  );
  const siblingEdges = renderGraph?.siblingEdges ?? [];
  const isDevEnvironment =
    ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false) === true;
  const showDebugOverlay = debugOverlay && isDevEnvironment;
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) {
      return null;
    }
    const ids = new Set<string>([hoveredNodeId]);
    [...(renderGraph?.edges ?? graph.edges), ...siblingEdges].forEach((edge) => {
      const sourceId = "sourceId" in edge ? edge.sourceId : null;
      const targetId = "targetId" in edge ? edge.targetId : null;
      if (sourceId === hoveredNodeId && targetId) {
        ids.add(targetId);
      }
      if (targetId === hoveredNodeId && sourceId) {
        ids.add(sourceId);
      }
    });
    return ids;
  }, [graph.edges, hoveredNodeId, renderGraph?.edges, siblingEdges]);

  useEffect(() => {
    function updateWidth(): void {
      const nextWidth = Math.max(
        MIN_CANVAS_WIDTH,
        Math.round(wrapperRef.current?.clientWidth ?? MIN_CANVAS_WIDTH)
      );
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    }

    updateWidth();

    if (typeof ResizeObserver !== "undefined" && wrapperRef.current) {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(wrapperRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  return (
    <div ref={wrapperRef} className="sequence-canvas-shell dependency-graph-shell">
        <svg
        className="sequence-canvas dependency-graph-canvas"
        aria-label={
          showAccountingStrips
            ? "Dependency graph by sector and accounting strips"
            : "Dependency graph by sector strips"
        }
        role="img"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        <defs>
          <marker
            id="dependency-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5.3"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" fill="#64748b" />
          </marker>
          <marker
            id="debug-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 5 2.5 L 0 5 z" fill="rgba(16, 185, 129, 0.7)" />
          </marker>
        </defs>

        <rect x={0} y={0} width={layout.width} height={layout.height} fill="#fcfdfd" />

        {layout.bands.map((band) => (
          <rect
            key={band.id}
            x={band.x}
            y={band.y}
            width={band.width}
            height={band.height}
            rx={18}
            ry={18}
            fill={band.fill}
            stroke={band.stroke}
          />
        ))}

        {layout.labels.map((label) => (
          <g key={label.id}>
            <text
              x={label.x}
              y={label.y ?? TOP_PADDING - 34}
              fill="#475569"
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontSize={13}
              fontWeight={600}
              textAnchor={label.textAnchor ?? "middle"}
            >
              {label.label}
            </text>
            {label.subtitle ? (
              <text
                x={label.x}
                y={(label.y ?? TOP_PADDING - 34) + 16}
                fill="#64748b"
                fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                fontSize={11}
                textAnchor={label.textAnchor ?? "middle"}
              >
                {label.subtitle}
              </text>
            ) : null}
          </g>
        ))}

        {showDebugOverlay ? (
          <DependencyGraphDebugOverlay diagnostics={diagnostics} />
        ) : null}

        {(renderGraph?.edges ?? graph.edges).map((edge) => {
          const source = nodePositions.get(edge.sourceId);
          const target = nodePositions.get(edge.targetId);
          if (!source || !target) {
            return null;
          }
          return (
            <DependencyEdgeShape
              key={edge.id}
              allNodes={layout.nodes}
              edge={edge}
              dimmed={hoveredNodeId != null && !(edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId)}
              highlighted={edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId}
              nodeHeight={layout.nodeHeight}
              nodeWidth={layout.nodeWidth}
              source={source}
              target={target}
            />
          );
        })}

        {siblingEdges.map((edge) => {
          const source = nodePositions.get(edge.sourceId);
          const target = nodePositions.get(edge.targetId);
          if (!source || !target) {
            return null;
          }
          return (
            <SiblingProxyEdgeShape
              key={edge.id}
              dimmed={hoveredNodeId != null && !(edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId)}
              highlighted={edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId}
              source={source}
              target={target}
            />
          );
        })}

        {layout.nodes.map((node) => (
          <DependencyNodeShape
            key={node.id}
            node={node}
            nodeHeight={layout.nodeHeight}
            nodeWidth={layout.nodeWidth}
            isConnected={connectedNodeIds?.has(node.id) ?? true}
            isHovered={node.id === hoveredNodeId}
            onClick={onNodeClick}
            onHoverChange={setHoveredNodeId}
            rowTopology={rowTopology}
            variableDescriptions={variableDescriptions}
          />
        ))}
      </svg>
    </div>
  );
}

function DependencyGraphDebugOverlay({
  diagnostics
}: {
  diagnostics: DependencyLayoutDiagnostics;
}) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {diagnostics.exogenousPlacements.map((entry) => (
        <g key={`debug-envelope-${entry.nodeId}`}>
          <line
            x1={entry.horizontalMinX}
            y1={entry.finalY}
            x2={entry.horizontalMaxX}
            y2={entry.finalY}
            stroke={entry.isBoundSaturated ? "rgba(245, 158, 11, 0.8)" : "rgba(99, 102, 241, 0.22)"}
            strokeDasharray="6 4"
            strokeWidth={entry.isBoundSaturated ? 1.8 : 1.1}
          />
          <line
            x1={entry.finalX - entry.hardMinHorizontalGap / 2}
            y1={entry.finalY}
            x2={entry.finalX + entry.hardMinHorizontalGap / 2}
            y2={entry.finalY}
            stroke="rgba(14, 165, 233, 0.7)"
            strokeWidth={1.4}
          />
          <circle
            cx={entry.horizontalMinX}
            cy={entry.finalY}
            r={2.4}
            fill={entry.isBoundSaturated ? "rgba(245, 158, 11, 0.9)" : "rgba(99, 102, 241, 0.45)"}
          />
          <circle
            cx={entry.horizontalMaxX}
            cy={entry.finalY}
            r={2.4}
            fill={entry.isBoundSaturated ? "rgba(245, 158, 11, 0.9)" : "rgba(99, 102, 241, 0.45)"}
          />
        </g>
      ))}
      {diagnostics.nodeBoxes.map((box) => (
        <rect
          key={`debug-box-${box.id}`}
          x={box.left}
          y={box.top}
          width={box.width}
          height={box.height}
          fill="none"
          stroke={box.isExogenous ? "rgba(99, 102, 241, 0.7)" : "rgba(148, 163, 184, 0.35)"}
          strokeDasharray={box.isExogenous ? "5 3" : "4 4"}
          strokeWidth={box.isExogenous ? 1.6 : 1}
        />
      ))}
      {diagnostics.exogenousPlacements.map((entry) => (
        <g key={`debug-exogenous-${entry.nodeId}`}>
          <line
            x1={entry.finalX}
            y1={entry.finalY}
            x2={entry.targetX}
            y2={entry.targetY}
            stroke="rgba(99, 102, 241, 0.5)"
            strokeDasharray="4 3"
            strokeWidth={1.2}
          />
          <circle
            cx={entry.targetX}
            cy={entry.targetY}
            r={4}
            fill="rgba(99, 102, 241, 0.18)"
            stroke="rgba(99, 102, 241, 0.8)"
            strokeWidth={1.2}
          />
        </g>
      ))}
      {diagnostics.overlapPairs.map((pair) => {
        const left = diagnostics.nodeBoxes.find((box) => box.id === pair.leftId);
        const right = diagnostics.nodeBoxes.find((box) => box.id === pair.rightId);
        if (!left || !right) {
          return null;
        }
        return (
          <line
            key={`debug-overlap-${pair.leftId}-${pair.rightId}`}
            x1={left.x}
            y1={left.y}
            x2={right.x}
            y2={right.y}
            stroke="rgba(239, 68, 68, 0.55)"
            strokeWidth={Math.max(1.2, Math.min(3, pair.overlapRatio * 8))}
          />
        );
      })}
      {diagnostics.cellSpreadEntries.map((cell) => (
        <g key={`debug-cell-${cell.cellKey}`}>
          <rect
            x={cell.cellX - cell.cellWidth / 2}
            y={cell.cellY - cell.cellHeight / 2}
            width={cell.cellWidth}
            height={cell.cellHeight}
            fill="rgba(16, 185, 129, 0.06)"
            stroke="rgba(16, 185, 129, 0.4)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          {cell.nodes.map((n) => (
            <g key={`debug-spread-${n.id}`}>
              <circle
                cx={n.beforeX}
                cy={n.beforeY}
                r={3}
                fill="none"
                stroke="rgba(239, 68, 68, 0.5)"
                strokeWidth={1}
              />
              <line
                x1={n.beforeX}
                y1={n.beforeY}
                x2={n.afterX}
                y2={n.afterY}
                stroke="rgba(16, 185, 129, 0.6)"
                strokeWidth={1.2}
                markerEnd="url(#debug-arrow)"
              />
              <circle cx={n.afterX} cy={n.afterY} r={2.5} fill="rgba(16, 185, 129, 0.7)" />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function DependencyNodeShape({
  node,
  nodeWidth,
  nodeHeight,
  isConnected,
  isHovered,
  onClick,
  onHoverChange,
  rowTopology,
  variableDescriptions
}: {
  node: PositionedNode;
  nodeWidth: number;
  nodeHeight: number;
  isConnected: boolean;
  isHovered: boolean;
  onClick?(node: PositionedNode): void;
  onHoverChange(next: string | null): void;
  rowTopology?: DependencyRowTopology | null;
  variableDescriptions?: VariableDescriptions;
}) {
  const palette = NODE_COLORS[node.variableType];
  const matrixBadge = getMatrixBadge(rowTopology?.variables[node.name]?.memberships);
  const left = node.x - nodeWidth / 2;
  const top = node.y - nodeHeight / 2;
  const opacity = isConnected ? 1 : 0.26;

  return (
    <g
      cursor={onClick ? "pointer" : undefined}
      opacity={opacity}
      onClick={() => onClick?.(node)}
      onMouseEnter={() => onHoverChange(node.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <title>
        {buildNodeTitle(
          node,
          rowTopology?.variables[node.name],
          variableDescriptions?.get(node.name) ?? node.description ?? undefined
        )}
      </title>
      <rect
        x={left}
        y={top}
        width={nodeWidth}
        height={nodeHeight}
        rx={14}
        ry={14}
        fill={palette.fill}
        stroke={palette.stroke}
        strokeWidth={isHovered ? 2.8 : 2}
      />
      {matrixBadge ? (
        <g aria-label={`Matrix badge: ${matrixBadge.label}`}>
          <rect
            x={left + nodeWidth - 24}
            y={top + 6}
            width={18}
            height={14}
            rx={7}
            ry={7}
            fill={matrixBadge.fill}
            stroke={matrixBadge.stroke}
            strokeWidth={1}
          />
          <text
            x={left + nodeWidth - 15}
            y={top + 16}
            fill="#ffffff"
            fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
            fontSize={8.5}
            fontWeight={700}
            letterSpacing={matrixBadge.label === "TB" ? -0.1 : 0}
            textAnchor="middle"
          >
            {matrixBadge.label}
          </text>
        </g>
      ) : null}
      <text
        x={node.x}
        y={node.y + 5}
        fill="#0f172a"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={12.5}
        fontWeight={650}
        textAnchor="middle"
      >
        {renderVariableMathSvgLabel(node.label)}
      </text>
    </g>
  );
}

function DependencyEdgeShape({
  allNodes,
  edge,
  dimmed,
  highlighted,
  nodeWidth,
  nodeHeight,
  source,
  target
}: {
  allNodes: PositionedNode[];
  edge: DependencyGraphEdge;
  dimmed: boolean;
  highlighted: boolean;
  nodeWidth: number;
  nodeHeight: number;
  source: PositionedNode;
  target: PositionedNode;
}) {
  const start = getNodeBoundaryPoint(source, target, nodeWidth, nodeHeight);
  const end = getNodeBoundaryPoint(target, source, nodeWidth, nodeHeight);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const sameColumn = Math.abs(deltaX) < nodeWidth * 0.2;
  const sameRow = Math.abs(deltaY) < nodeHeight * 0.3;
  const horizontalBias = Math.max(24, Math.abs(deltaX) * 0.38);
  const verticalBias = Math.max(24, Math.abs(deltaY) * 0.38);
  const controls = buildObstacleAwareEdgeControls({
    allNodes,
    end,
    horizontalBias,
    nodeHeight,
    nodeWidth,
    sameColumn,
    sameRow,
    source,
    start,
    target,
    verticalBias
  });
  const path = `M ${start.x} ${start.y} C ${controls.c1x} ${controls.c1y}, ${controls.c2x} ${controls.c2y}, ${end.x} ${end.y}`;

  return (
    <g>
      <title>
        {`${edge.sourceId} -> ${edge.targetId}${
          edge.current && edge.lagged
            ? " (current + lag)"
            : edge.lagged
              ? " (lag)"
              : " (current)"
        }`}
      </title>
      <path
        d={path}
        fill="none"
        markerEnd="url(#dependency-arrow)"
        opacity={dimmed ? 0.16 : 1}
        stroke={
          highlighted
            ? edge.lagged && !edge.current
              ? "rgba(8, 145, 178, 0.95)"
              : "rgba(30, 41, 59, 0.95)"
            : edge.lagged && !edge.current
              ? "rgba(14, 116, 144, 0.7)"
              : "rgba(71, 85, 105, 0.78)"
        }
        strokeDasharray={edge.lagged && !edge.current ? "7 5" : undefined}
        strokeWidth={highlighted ? 2.8 : edge.current && edge.lagged ? 2.5 : 2}
      />
    </g>
  );
}

function SiblingProxyEdgeShape({
  dimmed,
  highlighted,
  source,
  target
}: {
  dimmed: boolean;
  highlighted: boolean;
  source: PositionedNode;
  target: PositionedNode;
}) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const bend = Math.max(10, Math.min(24, Math.abs(dx) * 0.18 + Math.abs(dy) * 0.12));
  const controlX = midX;
  const controlY = midY - bend;
  const path = `M ${source.x} ${source.y} Q ${controlX} ${controlY}, ${target.x} ${target.y}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        opacity={dimmed ? 0.14 : 1}
        stroke={highlighted ? "rgba(14, 165, 233, 0.72)" : "rgba(14, 165, 233, 0.45)"}
        strokeDasharray="5 4"
        strokeWidth={highlighted ? 2 : 1.6}
      />
    </g>
  );
}

function getNodeBoundaryPoint(
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

function buildObstacleAwareEdgeControls(args: {
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

function buildNodeTitle(
  node: Pick<PositionedNode, "name" | "variableType" | "equationRole" | "currentDependencyNames" | "lagDependencyNames" | "displaySector">,
  rowAssignment?: DependencyRowTopology["variables"][string],
  description?: string
): string {
  const lines = [
    `${node.name} (${node.variableType}${node.equationRole ? `; ${node.equationRole}` : ""})`
  ];
  if (description) {
    lines.push(description);
  }
  if (node.displaySector && node.displaySector !== "Unmapped") {
    lines.push(`Sector: ${node.displaySector}`);
  }
  if (rowAssignment?.memberships.length) {
    lines.push(
      `Bands: ${rowAssignment.memberships
        .map((membership) => `${membership.band} [${membership.source}, ${membership.confidence}]`)
        .join("; ")}`
    );
  }
  if (node.currentDependencyNames.length > 0) {
    lines.push(`Current deps: ${node.currentDependencyNames.join(", ")}`);
  }
  if (node.lagDependencyNames.length > 0) {
    lines.push(`Lag deps: ${node.lagDependencyNames.join(", ")}`);
  }
  return lines.join("\n");
}

function getMatrixBadge(memberships?: DependencyRowMembership[]):
  | (typeof MATRIX_BADGE_STYLES)[keyof typeof MATRIX_BADGE_STYLES]
  | null {
  if (!memberships?.length) {
    return null;
  }

  const hasTransaction = memberships.some((membership) => membership.source === "transaction-row");
  const hasBalance = memberships.some((membership) => membership.source === "balance-row");

  if (hasTransaction && hasBalance) {
    return MATRIX_BADGE_STYLES.both;
  }
  if (hasTransaction) {
    return MATRIX_BADGE_STYLES.transaction;
  }
  if (hasBalance) {
    return MATRIX_BADGE_STYLES.balance;
  }
  return null;
}
