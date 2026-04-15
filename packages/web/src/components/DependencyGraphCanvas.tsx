import { useEffect, useMemo, useRef, useState } from "react";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  ParsedDependencyGraph
} from "../notebook/dependencyGraph";

interface DependencyGraphCanvasProps {
  graph: ParsedDependencyGraph;
  variableDescriptions?: VariableDescriptions;
}

interface PositionedNode extends DependencyGraphNode {
  x: number;
  y: number;
}

interface GraphLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  layerLabels: Array<{ layer: number; x: number; label: string }>;
  nodes: PositionedNode[];
}

const MIN_CANVAS_WIDTH = 720;
const SIDE_PADDING = 54;
const TOP_PADDING = 72;
const BOTTOM_PADDING = 40;
const NODE_WIDTH = 148;
const NODE_HEIGHT = 54;
const LAYER_GAP = 188;
const ROW_GAP = 84;

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

export function DependencyGraphCanvas({
  graph,
  variableDescriptions
}: DependencyGraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(MIN_CANVAS_WIDTH);
  const layout = useMemo(() => buildDependencyGraphLayout(graph, width), [graph, width]);
  const nodePositions = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  );

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
        aria-label="Dependency graph"
        role="img"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        <defs>
          <marker
            id="dependency-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>

        <rect x={0} y={0} width={layout.width} height={layout.height} fill="#fcfdfd" />

        {layout.layerLabels.map((layer) => (
          <g key={`layer-${layer.layer}`}>
            <line
              x1={layer.x}
              y1={TOP_PADDING - 22}
              x2={layer.x}
              y2={layout.height - BOTTOM_PADDING / 2}
              stroke="rgba(148, 163, 184, 0.24)"
              strokeDasharray="6 8"
              strokeWidth={2}
            />
            <text
              x={layer.x}
              y={TOP_PADDING - 34}
              fill="#475569"
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontSize={13}
              fontWeight={600}
              textAnchor="middle"
            >
              {layer.label}
            </text>
          </g>
        ))}

        {graph.edges.map((edge) => {
          const source = nodePositions.get(edge.sourceId);
          const target = nodePositions.get(edge.targetId);
          if (!source || !target) {
            return null;
          }
          return (
            <DependencyEdgeShape
              key={edge.id}
              edge={edge}
              nodeHeight={layout.nodeHeight}
              nodeWidth={layout.nodeWidth}
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
            variableDescriptions={variableDescriptions}
          />
        ))}
      </svg>
    </div>
  );
}

function DependencyNodeShape({
  node,
  nodeWidth,
  nodeHeight,
  variableDescriptions
}: {
  node: PositionedNode;
  nodeWidth: number;
  nodeHeight: number;
  variableDescriptions?: VariableDescriptions;
}) {
  const palette = NODE_COLORS[node.variableType];
  const left = node.x - nodeWidth / 2;
  const top = node.y - nodeHeight / 2;

  return (
    <g>
      <title>
        {buildNodeTitle(
          node,
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
        strokeWidth={2}
      />
      <rect
        x={left + 10}
        y={top + 9}
        width={nodeWidth - 20}
        height={6}
        rx={3}
        fill={palette.accent}
        opacity={0.7}
      />
      <text
        x={node.x}
        y={node.y - 4}
        fill="#0f172a"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={15}
        fontWeight={650}
        textAnchor="middle"
      >
        {node.label}
      </text>
      <text
        x={node.x}
        y={node.y + 16}
        fill="#475569"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={11.5}
        textAnchor="middle"
      >
        {formatNodeSubtitle(node)}
        {node.initialValue != null ? ` | init ${formatInitialValue(node.initialValue)}` : ""}
        {node.hasSelfLag ? " | lag" : ""}
        {node.isCyclic ? " | cycle" : ""}
      </text>
    </g>
  );
}

function DependencyEdgeShape({
  edge,
  nodeWidth,
  nodeHeight,
  source,
  target
}: {
  edge: DependencyGraphEdge;
  nodeWidth: number;
  nodeHeight: number;
  source: PositionedNode;
  target: PositionedNode;
}) {
  const startX = source.x + nodeWidth / 2;
  const endX = target.x - nodeWidth / 2;
  const sameLayer = source.layer === target.layer;
  const sourceBelow = source.y > target.y;
  const startY = source.y + (sameLayer && sourceBelow ? -nodeHeight / 4 : nodeHeight / 4);
  const endY = target.y + (sameLayer ? -nodeHeight / 4 : nodeHeight / 4);
  const controlOffsetX = sameLayer ? 44 : Math.max(50, (endX - startX) * 0.42);
  const verticalBend = sameLayer ? Math.max(36, Math.abs(target.y - source.y) * 0.45) : 0;
  const path = sameLayer
    ? `M ${startX} ${startY} C ${startX + controlOffsetX} ${startY - verticalBend}, ${
        endX - controlOffsetX
      } ${endY - verticalBend}, ${endX} ${endY}`
    : `M ${startX} ${startY} C ${startX + controlOffsetX} ${startY}, ${
        endX - controlOffsetX
      } ${endY}, ${endX} ${endY}`;

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
        stroke={edge.lagged && !edge.current ? "rgba(14, 116, 144, 0.7)" : "rgba(71, 85, 105, 0.78)"}
        strokeDasharray={edge.lagged && !edge.current ? "7 5" : undefined}
        strokeWidth={edge.current && edge.lagged ? 2.8 : 2.2}
      />
    </g>
  );
}

function buildDependencyGraphLayout(graph: ParsedDependencyGraph, availableWidth: number): GraphLayout {
  const layerBuckets = new Map<number, DependencyGraphNode[]>();
  graph.nodes.forEach((node) => {
    const bucket = layerBuckets.get(node.layer) ?? [];
    bucket.push(node);
    layerBuckets.set(node.layer, bucket);
  });

  const maxLayer = Math.max(0, ...graph.nodes.map((node) => node.layer));
  const maxRows = Math.max(1, ...Array.from(layerBuckets.values()).map((nodes) => nodes.length));
  const contentWidth = Math.max(
    availableWidth,
    SIDE_PADDING * 2 + maxLayer * LAYER_GAP + NODE_WIDTH + 24
  );
  const height = TOP_PADDING + BOTTOM_PADDING + (maxRows - 1) * ROW_GAP + NODE_HEIGHT;
  const nodes: PositionedNode[] = [];

  layerBuckets.forEach((bucket, layer) => {
    bucket.forEach((node, index) => {
      nodes.push({
        ...node,
        x: SIDE_PADDING + NODE_WIDTH / 2 + layer * LAYER_GAP,
        y: TOP_PADDING + NODE_HEIGHT / 2 + index * ROW_GAP
      });
    });
  });

  return {
    width: contentWidth,
    height,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    layerLabels: Array.from({ length: maxLayer + 1 }, (_, layer) => ({
      layer,
      x: SIDE_PADDING + NODE_WIDTH / 2 + layer * LAYER_GAP,
      label: layer === 0 ? "Layer 0 / Exogenous" : `Layer ${layer}`
    })),
    nodes: nodes.sort((left, right) => {
      if (left.layer !== right.layer) {
        return left.layer - right.layer;
      }
      return left.order - right.order;
    })
  };
}

function buildNodeTitle(node: DependencyGraphNode, description?: string): string {
  const lines = [
    `${node.name} (${node.variableType}${node.equationRole ? `; ${node.equationRole}` : ""})`
  ];
  if (description) {
    lines.push(description);
  }
  if (node.currentDependencyNames.length > 0) {
    lines.push(`Current deps: ${node.currentDependencyNames.join(", ")}`);
  }
  if (node.lagDependencyNames.length > 0) {
    lines.push(`Lag deps: ${node.lagDependencyNames.join(", ")}`);
  }
  return lines.join("\n");
}

function formatNodeSubtitle(node: DependencyGraphNode): string {
  return node.equationRole ? `${node.variableType} | ${node.equationRole}` : node.variableType;
}

function formatInitialValue(value: number): string {
  if (Math.abs(value) >= 100 || Math.abs(value) < 0.01) {
    return value.toExponential(1);
  }
  return value.toFixed(2).replace(/\.00$/, "");
}
