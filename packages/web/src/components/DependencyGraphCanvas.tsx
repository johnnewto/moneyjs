import { useEffect, useMemo, useRef, useState } from "react";

import type { SectorTopology } from "@sfcr/core";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  ParsedDependencyGraph
} from "../notebook/dependencyGraph";

interface DependencyGraphCanvasProps {
  graph: ParsedDependencyGraph;
  sectorTopology?: SectorTopology | null;
  variableDescriptions?: VariableDescriptions;
  viewMode?: "layered" | "strips";
}

interface PositionedNode extends DependencyGraphNode {
  x: number;
  y: number;
}

interface GraphColumnLabel {
  id: string;
  x: number;
  label: string;
  subtitle?: string;
}

interface GraphBand {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
}

interface GraphLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  labels: GraphColumnLabel[];
  bands: GraphBand[];
  nodes: PositionedNode[];
}

const MIN_CANVAS_WIDTH = 720;
const SIDE_PADDING = 54;
const TOP_PADDING = 72;
const BOTTOM_PADDING = 40;
const NODE_WIDTH = 56;
const NODE_HEIGHT = 40;
const COLUMN_GAP = 188;
const ROW_GAP = 84;
const STRIP_INNER_GAP = 34;
const STRIP_PADDING_X = 24;
const STRIP_MIN_WIDTH = 212;
const RELAXATION_ITERATIONS = 48;

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

const BAND_COLORS = [
  { fill: "rgba(236, 253, 245, 0.7)", stroke: "rgba(16, 185, 129, 0.28)" },
  { fill: "rgba(239, 246, 255, 0.74)", stroke: "rgba(59, 130, 246, 0.24)" },
  { fill: "rgba(255, 247, 237, 0.8)", stroke: "rgba(249, 115, 22, 0.24)" },
  { fill: "rgba(248, 250, 252, 0.9)", stroke: "rgba(100, 116, 139, 0.24)" }
] as const;

export function DependencyGraphCanvas({
  graph,
  sectorTopology,
  variableDescriptions,
  viewMode = "layered"
}: DependencyGraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(MIN_CANVAS_WIDTH);
  const layout = useMemo(
    () =>
      viewMode === "strips" && sectorTopology
        ? buildStripDependencyGraphLayout(graph, width, sectorTopology)
        : buildLayeredDependencyGraphLayout(graph, width),
    [graph, sectorTopology, viewMode, width]
  );
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
        aria-label={viewMode === "strips" ? "Dependency graph by sector strips" : "Dependency graph"}
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
              y={TOP_PADDING - 34}
              fill="#475569"
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontSize={13}
              fontWeight={600}
              textAnchor="middle"
            >
              {label.label}
            </text>
            {label.subtitle ? (
              <text
                x={label.x}
                y={TOP_PADDING - 18}
                fill="#64748b"
                fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
                fontSize={11}
                textAnchor="middle"
              >
                {label.subtitle}
              </text>
            ) : null}
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
      <text
        x={node.x}
        y={node.y + 5}
        fill="#0f172a"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={12.5}
        fontWeight={650}
        textAnchor="middle"
      >
        {node.label}
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
  const start = getNodeBoundaryPoint(source, target, nodeWidth, nodeHeight);
  const end = getNodeBoundaryPoint(target, source, nodeWidth, nodeHeight);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const sameColumn = Math.abs(deltaX) < nodeWidth * 0.2;
  const sameRow = Math.abs(deltaY) < nodeHeight * 0.3;
  const horizontalBias = Math.max(24, Math.abs(deltaX) * 0.38);
  const verticalBias = Math.max(24, Math.abs(deltaY) * 0.38);
  const path = sameColumn
    ? `M ${start.x} ${start.y} C ${start.x + Math.sign(deltaX || 1) * 18} ${
        start.y + Math.sign(deltaY || 1) * verticalBias
      }, ${end.x - Math.sign(deltaX || 1) * 18} ${end.y - Math.sign(deltaY || 1) * verticalBias}, ${end.x} ${end.y}`
    : sameRow
      ? `M ${start.x} ${start.y} C ${start.x + Math.sign(deltaX || 1) * horizontalBias} ${start.y}, ${
          end.x - Math.sign(deltaX || 1) * horizontalBias
        } ${end.y}, ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} C ${start.x + Math.sign(deltaX || 1) * horizontalBias} ${
          start.y + deltaY * 0.12
        }, ${end.x - Math.sign(deltaX || 1) * horizontalBias} ${end.y - deltaY * 0.12}, ${end.x} ${end.y}`;

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

function buildLayeredDependencyGraphLayout(
  graph: ParsedDependencyGraph,
  availableWidth: number
): GraphLayout {
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
    SIDE_PADDING * 2 + maxLayer * COLUMN_GAP + NODE_WIDTH + 24
  );
  const height = TOP_PADDING + BOTTOM_PADDING + (maxRows - 1) * ROW_GAP + NODE_HEIGHT;
  const nodes: PositionedNode[] = [];

  layerBuckets.forEach((bucket, layer) => {
    bucket.forEach((node, index) => {
      nodes.push({
        ...node,
        x: SIDE_PADDING + NODE_WIDTH / 2 + layer * COLUMN_GAP,
        y: TOP_PADDING + NODE_HEIGHT / 2 + index * ROW_GAP
      });
    });
  });

  return {
    width: contentWidth,
    height,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    labels: Array.from({ length: maxLayer + 1 }, (_, layer) => ({
      id: `layer-${layer}`,
      x: SIDE_PADDING + NODE_WIDTH / 2 + layer * COLUMN_GAP,
      label: layer === 0 ? "Layer 0 / Exogenous" : `Layer ${layer}`
    })),
    bands: Array.from({ length: maxLayer + 1 }, (_, layer) => ({
      id: `band-layer-${layer}`,
      x: SIDE_PADDING - 6 + layer * COLUMN_GAP,
      y: TOP_PADDING - 10,
      width: NODE_WIDTH + 12,
      height: height - TOP_PADDING - BOTTOM_PADDING + 20,
      fill: "rgba(248, 250, 252, 0.65)",
      stroke: "rgba(148, 163, 184, 0.18)"
    })),
    nodes: nodes.sort((left, right) => {
      if (left.layer !== right.layer) {
        return left.layer - right.layer;
      }
      return left.order - right.order;
    })
  };
}

function buildStripDependencyGraphLayout(
  graph: ParsedDependencyGraph,
  availableWidth: number,
  sectorTopology: SectorTopology
): GraphLayout {
  const sectorNames = sectorTopology.sectors.filter(
    (sector) =>
      sector !== "Unmapped" &&
      graph.nodes.some((node) => (sectorTopology.variables[node.name]?.sector ?? "Unmapped") === sector)
  );
  const stripCount = Math.max(1, sectorNames.length);
  const stripWidth = Math.max(
    STRIP_MIN_WIDTH,
    Math.floor((availableWidth - SIDE_PADDING * 2 - (stripCount - 1) * STRIP_PADDING_X) / stripCount)
  );
  const width = Math.max(
    availableWidth,
    SIDE_PADDING * 2 + stripCount * stripWidth + (stripCount - 1) * STRIP_PADDING_X
  );
  const stripCenters = sectorNames.map(
    (_, sectorIndex) => SIDE_PADDING + sectorIndex * (stripWidth + STRIP_PADDING_X) + stripWidth / 2
  );
  const gapCenters =
    stripCenters.length <= 1
      ? stripCenters
      : stripCenters.slice(0, -1).map((center, index) => (center + stripCenters[index + 1]) / 2);
  const nodes: PositionedNode[] = [];
  const nodesBySector = new Map<string, DependencyGraphNode[]>();
  const unmappedNodes: DependencyGraphNode[] = [];
  let globalMaxRow = 0;

  graph.nodes.forEach((node) => {
    const sector = sectorTopology.variables[node.name]?.sector ?? "Unmapped";
    if (!sectorNames.includes(sector)) {
      unmappedNodes.push(node);
      return;
    }
    const bucket = nodesBySector.get(sector) ?? [];
    bucket.push(node);
    nodesBySector.set(sector, bucket);
  });

  sectorNames.forEach((sector, sectorIndex) => {
    const stripNodes = nodesBySector.get(sector) ?? [];
    const flowLike = stripNodes
      .filter((node) => node.variableType !== "stock")
      .sort(compareStripNodes);
    const stocks = stripNodes.filter((node) => node.variableType === "stock").sort(compareStripNodes);
    const orderedNodes = [...flowLike, ...stocks];
    const stripLeft = SIDE_PADDING + sectorIndex * (stripWidth + STRIP_PADDING_X);
    const x = stripLeft + stripWidth / 2;

    orderedNodes.forEach((node, index) => {
      const stockOffset = stocks.length > 0 && index >= flowLike.length ? STRIP_INNER_GAP : 0;
      nodes.push({
        ...node,
        x,
        y: TOP_PADDING + NODE_HEIGHT / 2 + index * ROW_GAP + stockOffset
      });
    });

    const rows = orderedNodes.length + (stocks.length > 0 && flowLike.length > 0 ? 1 : 0);
    globalMaxRow = Math.max(globalMaxRow, rows);
  });

  const relaxedXByNode = buildRelaxedStripPositions({
    graph,
    stripCenters,
    gapCenters,
    sectorNames,
    sectorTopology
  });

  const unmappedBuckets = new Map<string, DependencyGraphNode[]>();
  unmappedNodes.sort(compareStripNodes).forEach((node) => {
    const x = relaxedXByNode.get(node.name) ?? gapCenters[0] ?? stripCenters[0] ?? SIDE_PADDING;
    const bucketKey = String(x);
    const bucket = unmappedBuckets.get(bucketKey) ?? [];
    bucket.push(node);
    unmappedBuckets.set(bucketKey, bucket);
  });

  unmappedBuckets.forEach((bucket, xKey) => {
    const x = Number(xKey);
    bucket.forEach((node, index) => {
      nodes.push({
        ...node,
        x,
        y: TOP_PADDING + NODE_HEIGHT / 2 + index * ROW_GAP
      });
    });
    globalMaxRow = Math.max(globalMaxRow, bucket.length);
  });

  const height = TOP_PADDING + BOTTOM_PADDING + Math.max(0, globalMaxRow - 1) * ROW_GAP + NODE_HEIGHT + STRIP_INNER_GAP;

  return {
    width,
    height,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    labels: sectorNames.map((sector, index) => ({
      id: `sector-${sector}`,
      x: stripCenters[index] ?? SIDE_PADDING,
      label: sector,
      subtitle: buildSectorSubtitle(sector, graph, sectorTopology)
    })),
    bands: sectorNames.map((sector, index) => {
      const palette = BAND_COLORS[index % BAND_COLORS.length];
      return {
        id: `band-sector-${sector}`,
        x: SIDE_PADDING + index * (stripWidth + STRIP_PADDING_X),
        y: TOP_PADDING - 10,
        width: stripWidth,
        height: height - TOP_PADDING - BOTTOM_PADDING + 20,
        fill: palette.fill,
        stroke: palette.stroke
      };
    }),
    nodes: nodes.sort((left, right) => {
      if (left.x !== right.x) {
        return left.x - right.x;
      }
      return left.y - right.y;
    })
  };
}

function buildRelaxedStripPositions(args: {
  graph: ParsedDependencyGraph;
  stripCenters: number[];
  gapCenters: number[];
  sectorNames: string[];
  sectorTopology: SectorTopology;
}): Map<string, number> {
  const stripIndexBySector = new Map(args.sectorNames.map((sector, index) => [sector, index]));
  const unmappedNodes = args.graph.nodes.filter((node) => {
    const sector = args.sectorTopology.variables[node.name]?.sector ?? "Unmapped";
    return sector === "Unmapped" || !stripIndexBySector.has(sector);
  });
  const unmappedIds = new Set(unmappedNodes.map((node) => node.id));
  const minX = Math.min(...args.stripCenters);
  const maxX = Math.max(...args.stripCenters);
  const positions = new Map<string, number>();
  const adjacency = new Map<
    string,
    Array<{ id: string; weight: number; fixedX?: number }>
  >();

  unmappedNodes.forEach((node) => {
    positions.set(node.id, initialRelaxedX(node.id, args, stripIndexBySector));
    adjacency.set(node.id, []);
  });

  args.graph.edges.forEach((edge) => {
    const sourceSector = args.sectorTopology.variables[edge.sourceId]?.sector ?? "Unmapped";
    const targetSector = args.sectorTopology.variables[edge.targetId]?.sector ?? "Unmapped";
    if (sourceSector === "Exogenous" || targetSector === "Exogenous") {
      return;
    }

    const weight = edge.current ? (edge.lagged ? 1.4 : 2) : 0.6;
    const sourceUnmapped = unmappedIds.has(edge.sourceId);
    const targetUnmapped = unmappedIds.has(edge.targetId);

    if (sourceUnmapped && targetUnmapped) {
      adjacency.get(edge.sourceId)?.push({ id: edge.targetId, weight });
      adjacency.get(edge.targetId)?.push({ id: edge.sourceId, weight });
      return;
    }

    const sourceStripIndex = stripIndexBySector.get(sourceSector);
    const targetStripIndex = stripIndexBySector.get(targetSector);

    if (sourceUnmapped && targetStripIndex != null) {
      adjacency.get(edge.sourceId)?.push({
        id: edge.targetId,
        weight,
        fixedX: args.stripCenters[targetStripIndex]
      });
    }
    if (targetUnmapped && sourceStripIndex != null) {
      adjacency.get(edge.targetId)?.push({
        id: edge.sourceId,
        weight,
        fixedX: args.stripCenters[sourceStripIndex]
      });
    }
  });

  for (let iteration = 0; iteration < RELAXATION_ITERATIONS; iteration += 1) {
    const nextPositions = new Map(positions);
    unmappedNodes.forEach((node) => {
      const neighbors = adjacency.get(node.id) ?? [];
      if (neighbors.length === 0) {
        return;
      }

      let weightedSum = 0;
      let totalWeight = 0;
      neighbors.forEach((neighbor) => {
        const neighborX = neighbor.fixedX ?? positions.get(neighbor.id);
        if (neighborX == null) {
          return;
        }
        weightedSum += neighborX * neighbor.weight;
        totalWeight += neighbor.weight;
      });

      if (totalWeight === 0) {
        return;
      }

      const currentX = positions.get(node.id) ?? minX;
      const targetX = weightedSum / totalWeight;
      const relaxedX = currentX + (targetX - currentX) * 0.35;
      nextPositions.set(node.id, clamp(relaxedX, minX, maxX));
    });
    positions.clear();
    nextPositions.forEach((value, key) => positions.set(key, value));
  }

  const snappedPositions = new Map<string, number>();
  positions.forEach((position, nodeId) => {
    snappedPositions.set(nodeId, snapRelaxedX(position, args.stripCenters, args.gapCenters));
  });
  return snappedPositions;
}

function initialRelaxedX(
  nodeId: string,
  args: {
    graph: ParsedDependencyGraph;
    stripCenters: number[];
    gapCenters: number[];
    sectorNames: string[];
    sectorTopology: SectorTopology;
  },
  stripIndexBySector: Map<string, number>
): number {
  const neighborStrips: number[] = [];
  args.graph.edges.forEach((edge) => {
    if (edge.sourceId !== nodeId && edge.targetId !== nodeId) {
      return;
    }
    const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
    const neighborSector = args.sectorTopology.variables[neighborId]?.sector ?? "Unmapped";
    if (neighborSector === "Exogenous") {
      return;
    }
    const stripIndex = stripIndexBySector.get(neighborSector);
    if (stripIndex != null) {
      neighborStrips.push(stripIndex);
    }
  });
  if (neighborStrips.length === 0) {
    return args.gapCenters[0] ?? args.stripCenters[0] ?? SIDE_PADDING;
  }
  const averageStripIndex = neighborStrips.reduce((sum, index) => sum + index, 0) / neighborStrips.length;
  const boundedGapIndex = Math.max(
    0,
    Math.min(args.gapCenters.length - 1, Math.round(averageStripIndex - 0.5))
  );
  return args.gapCenters[boundedGapIndex] ?? args.stripCenters[0] ?? SIDE_PADDING;
}

function snapRelaxedX(position: number, stripCenters: number[], gapCenters: number[]): number {
  const candidates = [...gapCenters, ...stripCenters];
  if (candidates.length === 0) {
    return position;
  }
  let best = candidates[0];
  let bestDistance = Math.abs(position - best);
  candidates.slice(1).forEach((candidate) => {
    const distance = Math.abs(position - candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function compareStripNodes(left: DependencyGraphNode, right: DependencyGraphNode): number {
  if (left.equationIndex != null && right.equationIndex != null && left.equationIndex !== right.equationIndex) {
    return left.equationIndex - right.equationIndex;
  }
  return left.order - right.order || left.name.localeCompare(right.name);
}

function buildSectorSubtitle(
  sector: string,
  graph: ParsedDependencyGraph,
  sectorTopology: SectorTopology
): string | undefined {
  const nodes = graph.nodes.filter(
    (node) => (sectorTopology.variables[node.name]?.sector ?? "Unmapped") === sector
  );
  if (nodes.length === 0) {
    return undefined;
  }
  const stocks = nodes.filter((node) => node.variableType === "stock").length;
  const flows = nodes.filter((node) => node.variableType === "flow").length;
  if (stocks === 0 && flows === 0) {
    return `${nodes.length} vars`;
  }
  return `${flows} flows, ${stocks} stocks`;
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
