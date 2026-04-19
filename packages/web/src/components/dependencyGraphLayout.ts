import type { SectorTopology } from "@sfcr/core";

import {
  buildDerivedAccountingTerms,
  type DerivedAccountingTerm,
  type DependencyRowTopology
} from "../notebook/dependencyRows";
import type {
  DependencySectorDisplayOccurrence,
  DependencySectorDisplayOccurrences
} from "../notebook/dependencySectors";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  ParsedDependencyGraph
} from "../notebook/dependencyGraph";

export type DisplayNode = DependencyGraphNode & {
  canonicalName?: string;
  displaySector?: string;
  expression?: string;
  isMirror?: boolean;
  occurrenceKey?: string;
  occurrenceSign?: DependencySectorDisplayOccurrence["sign"];
  proxyKind?: DerivedAccountingTerm["proxyKind"];
  proxyBand?: string;
  mirrorSector?: string;
  isProxy?: boolean;
};

export interface PositionedNode extends DisplayNode {
  x: number;
  y: number;
}

interface GraphColumnLabel {
  id: string;
  x: number;
  y?: number;
  label: string;
  subtitle?: string;
  textAnchor?: "start" | "middle" | "end";
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
  cellSpreadDiagnostics?: CellSpreadDiagnosticEntry[];
}

interface RenderGraph {
  nodes: DisplayNode[];
  edges: DependencyGraphEdge[];
  primaryNodeIdByVariable: Map<string, string>;
  siblingEdges: Array<{ id: string; sourceId: string; targetId: string }>;
}

interface DependencyNodeBox {
  id: string;
  name: string;
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  isExogenous: boolean;
}

interface DependencyOverlapPair {
  leftId: string;
  rightId: string;
  overlapX: number;
  overlapY: number;
  overlapArea: number;
  overlapRatio: number;
}

interface ExogenousPlacementDiagnostic {
  nodeId: string;
  name: string;
  targetX: number;
  targetY: number;
  finalX: number;
  finalY: number;
  outgoingTargetIds: string[];
  horizontalMinX: number;
  horizontalMaxX: number;
  hardMinHorizontalGap: number;
  isBoundSaturated: boolean;
}

export interface CellSpreadDiagnosticEntry {
  cellKey: string;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  nodeCount: number;
  nodes: Array<{
    id: string;
    name: string;
    beforeX: number;
    beforeY: number;
    afterX: number;
    afterY: number;
  }>;
}

export interface DependencyLayoutDiagnostics {
  nodeBoxes: DependencyNodeBox[];
  overlapPairs: DependencyOverlapPair[];
  maxOverlapRatio: number;
  exogenousPlacements: ExogenousPlacementDiagnostic[];
  cellSpreadEntries: CellSpreadDiagnosticEntry[];
}

interface DependencyGraphLayoutSnapshot {
  layout: GraphLayout;
  renderGraph: RenderGraph | null;
  diagnostics: DependencyLayoutDiagnostics;
}

export interface DependencyGraphLayoutSnapshotArgs {
  graph: ParsedDependencyGraph;
  availableWidth: number;
  sectorDisplayOccurrences?: DependencySectorDisplayOccurrences | null;
  sectorTopology?: SectorTopology | null;
  rowTopology?: DependencyRowTopology | null;
  viewMode?: "layered" | "strips";
  showAccountingStrips?: boolean;
}

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
const HORIZONTAL_BAND_HEIGHT = 148;
const HORIZONTAL_BAND_GAP = 18;
const HORIZONTAL_LABEL_X = 22;
const RELAXATION_ITERATIONS = 48;
const DIAGNOSTIC_BOX_INSET_X = 6;
const DIAGNOSTIC_BOX_INSET_Y = 5;

const BAND_COLORS = [
  { fill: "rgba(236, 253, 245, 0.7)", stroke: "rgba(16, 185, 129, 0.28)" },
  { fill: "rgba(239, 246, 255, 0.74)", stroke: "rgba(59, 130, 246, 0.24)" },
  { fill: "rgba(255, 247, 237, 0.8)", stroke: "rgba(249, 115, 22, 0.24)" },
  { fill: "rgba(248, 250, 252, 0.9)", stroke: "rgba(100, 116, 139, 0.24)" }
] as const;

const PROXY_KIND_PRIORITY: Record<DerivedAccountingTerm["proxyKind"], number> = {
  stock: 0,
  change: 1,
  "row-expression": 2,
  interest: 3
};

export function buildDependencyGraphLayoutSnapshot({
  graph,
  availableWidth,
  sectorDisplayOccurrences,
  sectorTopology,
  rowTopology,
  viewMode = "layered",
  showAccountingStrips = false
}: DependencyGraphLayoutSnapshotArgs): DependencyGraphLayoutSnapshot {
  let renderGraph: RenderGraph | null = null;
  if (showAccountingStrips && rowTopology) {
    renderGraph = buildAccountingRenderGraph(graph, rowTopology);
  }
  if (viewMode === "strips" && sectorTopology && sectorDisplayOccurrences) {
    renderGraph = buildSectorOccurrenceRenderGraph(
      renderGraph ?? buildBaseRenderGraph(graph),
      sectorTopology,
      sectorDisplayOccurrences
    );
  }
  const graphForLayout = renderGraph
    ? { ...graph, nodes: renderGraph.nodes, edges: renderGraph.edges }
    : graph;
  const layout =
    viewMode === "strips" && sectorTopology
      ? showAccountingStrips && rowTopology
        ? buildSectorAccountingDependencyGraphLayout(graphForLayout, availableWidth, sectorTopology, rowTopology)
        : buildStripDependencyGraphLayout(graphForLayout, availableWidth, sectorTopology)
      : showAccountingStrips && rowTopology
        ? buildHorizontalStripDependencyGraphLayout(graphForLayout, availableWidth, rowTopology)
        : buildLayeredDependencyGraphLayout(graphForLayout, availableWidth);
  const layoutWithDisplaySectors = sectorTopology
    ? {
        ...layout,
        nodes: layout.nodes.map((node) => ({
          ...node,
          displaySector: resolveDisplaySector(node, sectorTopology)
        }))
      }
    : layout;

  const diagnostics = computeDependencyLayoutDiagnostics(layoutWithDisplaySectors.nodes, graphForLayout, {
    horizontalMaxX: layoutWithDisplaySectors.width - SIDE_PADDING - NODE_WIDTH / 2,
    horizontalMinX: SIDE_PADDING + NODE_WIDTH / 2,
    hardMinHorizontalGap: NODE_WIDTH + 16
  });
  if (layout.cellSpreadDiagnostics) {
    diagnostics.cellSpreadEntries = layout.cellSpreadDiagnostics;
  }

  return {
    layout: layoutWithDisplaySectors,
    renderGraph,
    diagnostics
  };
}

function buildBaseRenderGraph(graph: ParsedDependencyGraph): RenderGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    primaryNodeIdByVariable: new Map(graph.nodes.map((node) => [node.name, node.id])),
    siblingEdges: []
  };
}

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

function buildAccountingRenderGraph(
  graph: ParsedDependencyGraph,
  rowTopology: DependencyRowTopology
): RenderGraph {
  const proxies = buildDerivedAccountingTerms(rowTopology);
  if (proxies.length === 0) {
    return buildBaseRenderGraph(graph);
  }

  const proxyByCanonical = new Map<string, DerivedAccountingTerm[]>();
  proxies.forEach((proxy) => {
    const bucket = proxyByCanonical.get(proxy.canonicalVariable) ?? [];
    bucket.push(proxy);
    proxyByCanonical.set(proxy.canonicalVariable, bucket);
  });

  const nodes: DisplayNode[] = [];
  const primaryNodeIdByVariable = new Map<string, string>();
  const siblingEdges: RenderGraph["siblingEdges"] = [];
  const canonicalById = new Map(graph.nodes.map((node) => [node.id, node]));

  graph.nodes.forEach((node) => {
    const nodeProxies = proxyByCanonical.get(node.name) ?? [];
    if (nodeProxies.length === 0) {
      nodes.push(node);
      primaryNodeIdByVariable.set(node.name, node.id);
      return;
    }

    const sortedProxies = [...nodeProxies].sort((left, right) => {
      const leftMembership = rowTopology.variables[node.name]?.memberships.find(
        (membership) => membership.band === left.band
      );
      const rightMembership = rowTopology.variables[node.name]?.memberships.find(
        (membership) => membership.band === right.band
      );
      const proxyKindDelta =
        (PROXY_KIND_PRIORITY[left.proxyKind] ?? 99) - (PROXY_KIND_PRIORITY[right.proxyKind] ?? 99);
      if (proxyKindDelta !== 0) {
        return proxyKindDelta;
      }
      if ((rightMembership?.weight ?? 0) !== (leftMembership?.weight ?? 0)) {
        return (rightMembership?.weight ?? 0) - (leftMembership?.weight ?? 0);
      }
      return left.label.localeCompare(right.label);
    });

    sortedProxies.forEach((proxy, index) => {
      const proxyNode: DisplayNode = {
        ...node,
        id: proxy.id,
        label: proxy.label,
        name: node.name,
        description: `${proxy.band}: ${proxy.fullExpression}`,
        canonicalName: node.name,
        expression: proxy.fullExpression,
        proxyKind: proxy.proxyKind,
        proxyBand: proxy.band,
        isProxy: true
      };
      nodes.push(proxyNode);
      if (index === 0) {
        primaryNodeIdByVariable.set(node.name, proxy.id);
      }
    });

    const primaryProxyId = sortedProxies[0]?.id;
    if (primaryProxyId) {
      sortedProxies.slice(1).forEach((proxy) => {
        siblingEdges.push({
          id: `sibling:${primaryProxyId}->${proxy.id}`,
          sourceId: primaryProxyId,
          targetId: proxy.id
        });
      });
    }
  });

  const edges = graph.edges.map((edge) => {
    const sourceNode = canonicalById.get(edge.sourceId);
    const targetNode = canonicalById.get(edge.targetId);
    const sourceId = sourceNode ? primaryNodeIdByVariable.get(sourceNode.name) ?? edge.sourceId : edge.sourceId;
    const targetId = targetNode ? primaryNodeIdByVariable.get(targetNode.name) ?? edge.targetId : edge.targetId;
    return {
      ...edge,
      id: `${sourceId}->${targetId}`,
      sourceId,
      targetId
    };
  });

  const edgeIds = new Set(edges.map((edge) => edge.id));
  proxies.forEach((proxy) => {
    proxy.references.forEach((reference) => {
      if (reference.name === proxy.canonicalVariable) {
        return;
      }
      const sourceId = primaryNodeIdByVariable.get(reference.name) ?? reference.name;
      if (!nodes.some((node) => node.id === sourceId) || sourceId === proxy.id) {
        return;
      }
      const edgeId = `${sourceId}->${proxy.id}`;
      if (edgeIds.has(edgeId)) {
        return;
      }
      edges.push({
        id: edgeId,
        sourceId,
        targetId: proxy.id,
        current: reference.current,
        lagged: reference.lagged
      });
      edgeIds.add(edgeId);
    });
  });

  return { nodes, edges, primaryNodeIdByVariable, siblingEdges };
}

function buildSectorOccurrenceRenderGraph(
  renderGraph: RenderGraph,
  sectorTopology: SectorTopology,
  sectorDisplayOccurrences: DependencySectorDisplayOccurrences
): RenderGraph {
  const nodes: DisplayNode[] = [];
  const siblingEdges = [...renderGraph.siblingEdges];
  let hasExpansion = false;
  let hasOccurrenceLabelUpdates = false;

  renderGraph.nodes.forEach((node) => {
    const canonicalName = node.canonicalName ?? node.name;
    const dedupedOccurrences = new Map<string, DependencySectorDisplayOccurrence>();
    (sectorDisplayOccurrences[canonicalName] ?? []).forEach((occurrence) => {
      const matchesNode = node.isProxy
        ? occurrence.displayLabel === node.label &&
          (occurrence.kind === "proxy" ||
            (occurrence.kind === "direct" && occurrence.displayLabel === canonicalName))
        : occurrence.displayLabel === node.label ||
          (occurrence.kind === "direct" && node.label === canonicalName && occurrence.variable === canonicalName);
      if (
        !matchesNode ||
        occurrence.sector === "Exogenous" ||
        occurrence.sector === "Unmapped"
      ) {
        return;
      }

      const occurrenceKey = `${occurrence.displayLabel}::${occurrence.sector}::${occurrence.sign}`;
      if (!dedupedOccurrences.has(occurrenceKey)) {
        dedupedOccurrences.set(occurrenceKey, occurrence);
      }
    });
    const occurrences = Array.from(dedupedOccurrences.values());
    const primarySector = resolveDisplaySector(node, sectorTopology);
    const orderedOccurrences = [...occurrences].sort((left, right) => {
      if (left.sector === primarySector && right.sector !== primarySector) {
        return -1;
      }
      if (right.sector === primarySector && left.sector !== primarySector) {
        return 1;
      }
      return left.sourceCellKey.localeCompare(right.sourceCellKey);
    });

    if (orderedOccurrences.length === 0) {
      nodes.push(node);
      return;
    }

    const primaryOccurrence = orderedOccurrences[0];
    const primaryNode: DisplayNode = {
      ...node,
      canonicalName,
      label: formatOccurrenceLabel(primaryOccurrence?.displayLabel ?? node.label, primaryOccurrence?.sign),
      mirrorSector: primaryOccurrence?.sector,
      occurrenceKey: primaryOccurrence?.sourceCellKey,
      occurrenceSign: primaryOccurrence?.sign
    };
    if (primaryNode.label !== node.label || primaryNode.mirrorSector !== node.mirrorSector) {
      hasOccurrenceLabelUpdates = true;
    }
    nodes.push(primaryNode);

    orderedOccurrences.slice(1).forEach((occurrence) => {
      hasExpansion = true;
      const mirrorId = `sector-occurrence:${node.id}:${occurrence.sourceCellKey}`;
      nodes.push({
        ...node,
        id: mirrorId,
        canonicalName,
        isMirror: true,
        label: formatOccurrenceLabel(occurrence.displayLabel, occurrence.sign),
        mirrorSector: occurrence.sector,
        occurrenceKey: occurrence.sourceCellKey,
        occurrenceSign: occurrence.sign
      });
      siblingEdges.push({
        id: `sibling:${primaryNode.id}->${mirrorId}`,
        sourceId: primaryNode.id,
        targetId: mirrorId
      });
    });
  });

  if (!hasExpansion && !hasOccurrenceLabelUpdates) {
    return renderGraph;
  }

  return {
    ...renderGraph,
    nodes,
    siblingEdges
  };
}

function formatOccurrenceLabel(
  label: string,
  sign: DependencySectorDisplayOccurrence["sign"] | undefined
): string {
  if (!sign || sign === "neutral") {
    return label;
  }
  return `${sign}${label}`;
}

function buildStripDependencyGraphLayout(
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  availableWidth: number,
  sectorTopology: SectorTopology
): GraphLayout {
  const sectorLayout = buildSectorStripScaffold(graph, availableWidth, sectorTopology);
  const { width, sectorNames, stripWidth, stripCenters, nodesById, globalMaxRow } = sectorLayout;
  const height =
    TOP_PADDING +
    BOTTOM_PADDING +
    Math.max(0, globalMaxRow - 1) * ROW_GAP +
    NODE_HEIGHT +
    STRIP_INNER_GAP;
  const nodes = Array.from(nodesById.values());

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

function buildSectorAccountingDependencyGraphLayout(
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  availableWidth: number,
  sectorTopology: SectorTopology,
  rowTopology: DependencyRowTopology
): GraphLayout {
  const sectorLayout = buildSectorStripScaffold(graph, availableWidth, sectorTopology);
  const { bandCenterByName, bandCenters, bandNames, height } = buildAccountingBandLayoutData(
    graph.nodes,
    rowTopology
  );
  const softAnchorYByNodeId = buildSoftAccountingAnchorYByNode(graph, rowTopology, bandCenterByName);
  const nodes = Array.from(sectorLayout.nodesById.values()).sort((left, right) => {
    if (left.x !== right.x) {
      return left.x - right.x;
    }
    return left.order - right.order;
  });
  const cellSpreadDiagnostics = finalizeAccountingLayoutNodes(nodes, {
    bandCenterByName,
    cellHalfWidth: Math.max(56, (sectorLayout.stripWidth - NODE_WIDTH) / 2 - 4),
    collisionResolver: resolveVerticalCollisionsByX,
    graph,
    horizontalMaxX: sectorLayout.width - SIDE_PADDING - NODE_WIDTH / 2,
    horizontalMinX: SIDE_PADDING + NODE_WIDTH / 2,
    rowTopology,
    softAnchorYByNodeId
  });

  return {
    width: sectorLayout.width,
    height,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    cellSpreadDiagnostics,
    labels: [
      ...sectorLayout.sectorNames.map((sector, index) => ({
        id: `sector-${sector}`,
        x: sectorLayout.stripCenters[index] ?? SIDE_PADDING,
        label: sector,
        subtitle: buildSectorSubtitle(sector, graph, sectorTopology)
      })),
      ...buildAccountingBandLabels(bandNames, bandCenters, graph, rowTopology)
    ],
    bands: [
      ...sectorLayout.sectorNames.map((sector, index) => {
        const palette = BAND_COLORS[index % BAND_COLORS.length];
        return {
          id: `band-sector-${sector}`,
          x: SIDE_PADDING + index * (sectorLayout.stripWidth + STRIP_PADDING_X),
          y: TOP_PADDING - 10,
          width: sectorLayout.stripWidth,
          height: height - TOP_PADDING - BOTTOM_PADDING + 20,
          fill: palette.fill.replace("0.", "0.18"),
          stroke: palette.stroke
        };
      }),
      ...buildAccountingBandRenderBands(bandNames, bandCenters, sectorLayout.width, false)
    ],
    nodes
  };
}

function buildHorizontalStripDependencyGraphLayout(
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  availableWidth: number,
  rowTopology: DependencyRowTopology
): GraphLayout {
  const maxLayer = Math.max(0, ...graph.nodes.map((node) => node.layer));
  const width = Math.max(
    availableWidth,
    SIDE_PADDING * 2 + maxLayer * COLUMN_GAP + NODE_WIDTH + 24
  );
  const { bandCenterByName, bandCenters, bandNames, height } = buildAccountingBandLayoutData(
    graph.nodes,
    rowTopology
  );
  const softAnchorYByNodeId = buildSoftAccountingAnchorYByNode(graph, rowTopology, bandCenterByName);
  const nodes = graph.nodes
    .map((node) => ({
      ...node,
      x: SIDE_PADDING + NODE_WIDTH / 2 + node.layer * COLUMN_GAP,
      y: computeInitialBandY(node, rowTopology, bandCenterByName, softAnchorYByNodeId, node.id)
    }))
    .sort((left, right) => {
      if (left.layer !== right.layer) {
        return left.layer - right.layer;
      }
      return left.order - right.order;
    });
  const cellSpreadDiagnostics = finalizeAccountingLayoutNodes(nodes, {
    bandCenterByName,
    cellHalfWidth: Math.max(52, COLUMN_GAP / 2 - NODE_WIDTH / 2 - 6),
    collisionResolver: resolveVerticalCollisionsByX,
    graph,
    horizontalMaxX: width - SIDE_PADDING - NODE_WIDTH / 2,
    horizontalMinX: SIDE_PADDING + NODE_WIDTH / 2,
    rowTopology,
    softAnchorYByNodeId
  });

  return {
    width,
    height,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    cellSpreadDiagnostics,
    labels: buildAccountingBandLabels(bandNames, bandCenters, graph, rowTopology),
    bands: buildAccountingBandRenderBands(bandNames, bandCenters, width, false),
    nodes
  };
}

function buildSectorStripScaffold(
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  availableWidth: number,
  sectorTopology: SectorTopology
): {
  width: number;
  stripWidth: number;
  stripCenters: number[];
  sectorNames: string[];
  nodesById: Map<string, PositionedNode>;
  globalMaxRow: number;
} {
  const sectorNames = [
    ...sectorTopology.sectors.filter(
      (sector) =>
        sector !== "Exogenous" &&
        sector !== "Unmapped" &&
        graph.nodes.some((node) => resolveDisplaySector(node, sectorTopology) === sector)
    )
  ];
  graph.nodes.forEach((node) => {
    const sector = resolveDisplaySector(node, sectorTopology);
    if (
      sector !== "Exogenous" &&
      sector !== "Unmapped" &&
      !sectorNames.includes(sector)
    ) {
      sectorNames.push(sector);
    }
  });
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
  const nodesBySector = new Map<string, DependencyGraphNode[]>();
  const unmappedNodes: DependencyGraphNode[] = [];
  const nodesById = new Map<string, PositionedNode>();
  let globalMaxRow = 0;

  graph.nodes.forEach((node) => {
    const sector = resolveDisplaySector(node, sectorTopology);
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
      nodesById.set(node.id, {
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
      nodesById.set(node.id, {
        ...node,
        x,
        y: TOP_PADDING + NODE_HEIGHT / 2 + index * ROW_GAP
      });
    });
    globalMaxRow = Math.max(globalMaxRow, bucket.length);
  });

  return { width, stripWidth, stripCenters, sectorNames, nodesById, globalMaxRow };
}

function collectVisibleAccountingBands(
  nodes: Array<Pick<DisplayNode, "name" | "proxyBand">>,
  rowTopology: DependencyRowTopology
): string[] {
  return rowTopology.bands.filter((band) =>
    band !== "Unmapped" &&
    band !== "Exogenous" &&
    nodes.some((node) => {
      if (node.proxyBand === band) {
        return true;
      }
      const assignment = rowTopology.variables[node.name];
      return assignment?.memberships.some((membership) => membership.band === band) ?? false;
    })
  );
}

function buildAccountingBandLayoutData(
  nodes: Array<Pick<DisplayNode, "name" | "proxyBand">>,
  rowTopology: DependencyRowTopology
): {
  bandNames: string[];
  bandCenters: number[];
  bandCenterByName: Map<string, number>;
  height: number;
} {
  const bandNames = collectVisibleAccountingBands(nodes, rowTopology);
  const bandCenters = bandNames.map(
    (_, index) =>
      TOP_PADDING +
      HORIZONTAL_BAND_HEIGHT / 2 +
      index * (HORIZONTAL_BAND_HEIGHT + HORIZONTAL_BAND_GAP)
  );

  return {
    bandNames,
    bandCenters,
    bandCenterByName: new Map(
      bandNames.map((band, index) => [band, bandCenters[index] ?? TOP_PADDING])
    ),
    height:
      bandNames.length > 0
        ? TOP_PADDING +
          (bandNames.length - 1) * (HORIZONTAL_BAND_HEIGHT + HORIZONTAL_BAND_GAP) +
          HORIZONTAL_BAND_HEIGHT +
          BOTTOM_PADDING
        : TOP_PADDING + NODE_HEIGHT + BOTTOM_PADDING
  };
}

function buildAccountingBandLabels(
  bandNames: string[],
  bandCenters: number[],
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  rowTopology: DependencyRowTopology
): GraphColumnLabel[] {
  return bandNames.map((band, index) => ({
    id: `band-${band}`,
    x: HORIZONTAL_LABEL_X,
    y: (bandCenters[index] ?? TOP_PADDING) - 6,
    label: band,
    subtitle: buildBandSubtitle(band, graph, rowTopology),
    textAnchor: "start"
  }));
}

function buildAccountingBandRenderBands(
  bandNames: string[],
  bandCenters: number[],
  width: number,
  useMutedFill: boolean
): GraphBand[] {
  return bandNames.map((band, index) => {
    const palette = BAND_COLORS[index % BAND_COLORS.length];
    const centerY = bandCenters[index] ?? TOP_PADDING;
    return {
      id: `horizontal-band-${band}`,
      x: SIDE_PADDING - 12,
      y: centerY - HORIZONTAL_BAND_HEIGHT / 2,
      width: width - SIDE_PADDING * 2 + 24,
      height: HORIZONTAL_BAND_HEIGHT,
      fill: useMutedFill ? palette.fill.replace("0.", "0.18") : palette.fill,
      stroke: palette.stroke
    };
  });
}

function buildSoftAccountingAnchorYByNode(
  graph: { nodes: Array<DisplayNode>; edges: Array<DependencyGraphEdge> },
  rowTopology: DependencyRowTopology,
  bandCenterByName: Map<string, number>
): Map<string, number> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const scoresByNode = new Map<string, Map<string, number>>();

  graph.nodes.forEach((node) => {
    const assignment = rowTopology.variables[node.name];
    const primaryBand = assignment?.primaryBand ?? "Unmapped";
    if ((primaryBand !== "Unmapped" && primaryBand !== "Exogenous") || node.proxyBand) {
      return;
    }
    scoresByNode.set(node.id, new Map());
  });

  graph.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    const weight = edge.current ? (edge.lagged ? 1.4 : 2) : 0.75;

    if (targetNode && scoresByNode.has(targetNode.id) && sourceNode) {
      accumulateSoftAnchorScores(
        scoresByNode.get(targetNode.id)!,
        rowTopology.variables[sourceNode.name],
        weight
      );
    }
    if (sourceNode && scoresByNode.has(sourceNode.id) && targetNode) {
      accumulateSoftAnchorScores(
        scoresByNode.get(sourceNode.id)!,
        rowTopology.variables[targetNode.name],
        weight * 0.75
      );
    }
  });

  const anchors = new Map<string, number>();
  scoresByNode.forEach((scores, nodeId) => {
    let weightedSum = 0;
    let totalWeight = 0;
    scores.forEach((score, band) => {
      const center = bandCenterByName.get(band);
      if (center == null) {
        return;
      }
      weightedSum += center * score;
      totalWeight += score;
    });
    if (totalWeight > 0) {
      anchors.set(nodeId, weightedSum / totalWeight);
    }
  });

  return anchors;
}

function accumulateSoftAnchorScores(
  scoreByBand: Map<string, number>,
  assignment: DependencyRowTopology["variables"][string],
  edgeWeight: number
): void {
  assignment?.memberships.forEach((membership) => {
    if (membership.band === "Unmapped" || membership.band === "Exogenous") {
      return;
    }
    const score =
      (scoreByBand.get(membership.band) ?? 0) + edgeWeight * Math.max(0.35, membership.weight);
    scoreByBand.set(membership.band, score);
  });
}

function buildRelaxedStripPositions(args: {
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">;
  stripCenters: number[];
  gapCenters: number[];
  sectorNames: string[];
  sectorTopology: SectorTopology;
}): Map<string, number> {
  const nodeById = new Map(args.graph.nodes.map((node) => [node.id, node]));
  const stripIndexBySector = new Map(args.sectorNames.map((sector, index) => [sector, index]));
  const unmappedNodes = args.graph.nodes.filter((node) => {
    const sector = resolveDisplaySector(node, args.sectorTopology);
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
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    const sourceSector = sourceNode ? resolveDisplaySector(sourceNode, args.sectorTopology) : "Unmapped";
    const targetSector = targetNode ? resolveDisplaySector(targetNode, args.sectorTopology) : "Unmapped";
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
    graph: Pick<ParsedDependencyGraph, "nodes" | "edges">;
    stripCenters: number[];
    gapCenters: number[];
    sectorNames: string[];
    sectorTopology: SectorTopology;
  },
  stripIndexBySector: Map<string, number>
): number {
  const nodeById = new Map(args.graph.nodes.map((node) => [node.id, node]));
  const neighborStrips: number[] = [];
  args.graph.edges.forEach((edge) => {
    if (edge.sourceId !== nodeId && edge.targetId !== nodeId) {
      return;
    }
    const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
    const neighborNode = nodeById.get(neighborId);
    const neighborSector = neighborNode ? resolveDisplaySector(neighborNode, args.sectorTopology) : "Unmapped";
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
  const candidates = gapCenters.length > 0 ? gapCenters : stripCenters;
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

function computeInitialBandY(
  node: Pick<DisplayNode, "name" | "proxyBand">,
  rowTopology: DependencyRowTopology,
  bandCenterByName: Map<string, number>,
  softAnchorYByNodeId?: Map<string, number>,
  nodeId?: string
): number {
  if (node.proxyBand) {
    return bandCenterByName.get(node.proxyBand) ?? averageBandCenter(bandCenterByName);
  }

  const assignment = rowTopology.variables[node.name];
  const primaryBand = assignment?.primaryBand ?? "Unmapped";
  if ((primaryBand === "Unmapped" || primaryBand === "Exogenous") && nodeId) {
    const softAnchorY = softAnchorYByNodeId?.get(nodeId);
    if (softAnchorY != null) {
      return softAnchorY;
    }
  }
  if (!assignment || assignment.memberships.length === 0) {
    return averageBandCenter(bandCenterByName);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  assignment.memberships.forEach((membership) => {
    const center = bandCenterByName.get(membership.band);
    if (center == null) {
      return;
    }
    weightedSum += center * membership.weight;
    totalWeight += membership.weight;
  });

  if (totalWeight <= 0) {
    return bandCenterByName.get(assignment.primaryBand) ?? averageBandCenter(bandCenterByName);
  }

  return weightedSum / totalWeight;
}

function averageBandCenter(bandCenterByName: Map<string, number>): number {
  const values = Array.from(bandCenterByName.values());
  if (values.length === 0) {
    return TOP_PADDING + NODE_HEIGHT / 2;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finalizeAccountingLayoutNodes(
  nodes: PositionedNode[],
  args: {
    bandCenterByName: Map<string, number>;
    cellHalfWidth: number;
    collisionResolver: (nodes: PositionedNode[], bandCenterByName: Map<string, number>) => void;
    graph: Pick<ParsedDependencyGraph, "nodes" | "edges">;
    horizontalMinX: number;
    horizontalMaxX: number;
    rowTopology: DependencyRowTopology;
    softAnchorYByNodeId: Map<string, number>;
  }
): CellSpreadDiagnosticEntry[] {
  nodes.forEach((node) => {
    node.y = computeInitialBandY(
      node,
      args.rowTopology,
      args.bandCenterByName,
      args.softAnchorYByNodeId,
      node.id
    );
  });
  relaxHorizontalBandPositions(
    nodes,
    args.graph,
    args.rowTopology,
    args.bandCenterByName,
    args.softAnchorYByNodeId
  );
  const cellSpreadDiagnostics = spreadNodesWithinAccountingCells(nodes, args.rowTopology, {
    cellHalfWidth: args.cellHalfWidth,
    bandCenterByName: args.bandCenterByName
  });
  applyExogenousTargetPlacement(nodes, args.graph, args.rowTopology, args.bandCenterByName, {
    cellHalfWidth: args.cellHalfWidth,
    horizontalMinX: args.horizontalMinX,
    horizontalMaxX: args.horizontalMaxX
  });
  args.collisionResolver(nodes, args.bandCenterByName);
  resolveResidualOverlaps(nodes, args.rowTopology, args.bandCenterByName, {
    horizontalMinX: args.horizontalMinX,
    horizontalMaxX: args.horizontalMaxX
  });
  return cellSpreadDiagnostics;
}

function resolveResidualOverlaps(
  nodes: PositionedNode[],
  rowTopology: DependencyRowTopology,
  bandCenterByName: Map<string, number>,
  bounds: { horizontalMinX: number; horizontalMaxX: number }
): void {
  if (nodes.length <= 1) {
    return;
  }

  const PAD_X = NODE_WIDTH + 6;
  const PAD_Y = NODE_HEIGHT + 6;
  const globalMinY =
    Math.min(...bandCenterByName.values()) - HORIZONTAL_BAND_HEIGHT / 2 + NODE_HEIGHT / 2;
  const globalMaxY =
    Math.max(...bandCenterByName.values()) + HORIZONTAL_BAND_HEIGHT / 2 - NODE_HEIGHT / 2;

  const cellBounds = new Map<
    string,
    { xMin: number; xMax: number; yMin: number; yMax: number }
  >();
  nodes.forEach((node) => {
    const assignment = rowTopology.variables[node.name];
    const primaryBand = node.proxyBand ?? assignment?.primaryBand;
    const bandCenter = primaryBand ? (bandCenterByName.get(primaryBand) ?? null) : null;
    const yMin =
      bandCenter != null
        ? bandCenter - HORIZONTAL_BAND_HEIGHT / 2 + NODE_HEIGHT / 2
        : globalMinY;
    const yMax =
      bandCenter != null
        ? bandCenter + HORIZONTAL_BAND_HEIGHT / 2 - NODE_HEIGHT / 2
        : globalMaxY;
    cellBounds.set(node.id, {
      xMin: bounds.horizontalMinX,
      xMax: bounds.horizontalMaxX,
      yMin,
      yMax
    });
  });

  for (let iteration = 0; iteration < 10; iteration += 1) {
    let anyMoved = false;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx >= PAD_X || dy >= PAD_Y) {
          continue;
        }

        const overlapX = PAD_X - dx;
        const overlapY = PAD_Y - dy;
        const aIsExogenous = a.variableType === "exogenous";
        const bIsExogenous = b.variableType === "exogenous";
        const aShare = aIsExogenous && !bIsExogenous ? 0.8 : bIsExogenous && !aIsExogenous ? 0.2 : 0.5;
        const bShare = 1 - aShare;

        if (overlapX < overlapY) {
          const signA = a.x <= b.x ? -1 : 1;
          a.x += signA * (overlapX * aShare + 0.5);
          b.x -= signA * (overlapX * bShare + 0.5);
        } else {
          const signA = a.y <= b.y ? -1 : 1;
          a.y += signA * (overlapY * aShare + 0.5);
          b.y -= signA * (overlapY * bShare + 0.5);
        }

        const ba = cellBounds.get(a.id);
        const bb = cellBounds.get(b.id);
        if (ba) {
          a.x = clamp(a.x, ba.xMin, ba.xMax);
          a.y = clamp(a.y, ba.yMin, ba.yMax);
        }
        if (bb) {
          b.x = clamp(b.x, bb.xMin, bb.xMax);
          b.y = clamp(b.y, bb.yMin, bb.yMax);
        }
        anyMoved = true;
      }
    }

    if (!anyMoved) {
      break;
    }
  }
}

function relaxHorizontalBandPositions(
  nodes: PositionedNode[],
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  rowTopology: DependencyRowTopology,
  bandCenterByName: Map<string, number>,
  softAnchorYByNodeId: Map<string, number>
): void {
  if (nodes.length === 0) {
    return;
  }

  const positions = new Map(nodes.map((node) => [node.id, node.y]));
  const minY = Math.min(...bandCenterByName.values()) - HORIZONTAL_BAND_HEIGHT / 2 + NODE_HEIGHT / 2;
  const maxY = Math.max(...bandCenterByName.values()) + HORIZONTAL_BAND_HEIGHT / 2 - NODE_HEIGHT / 2;
  const adjacency = new Map<string, Array<{ id: string; weight: number }>>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  graph.edges.forEach((edge) => {
    const weight = edge.current ? (edge.lagged ? 1.4 : 1.8) : 0.7;
    adjacency.get(edge.sourceId)?.push({ id: edge.targetId, weight });
    adjacency.get(edge.targetId)?.push({ id: edge.sourceId, weight });
  });

  for (let iteration = 0; iteration < RELAXATION_ITERATIONS; iteration += 1) {
    const next = new Map(positions);

    nodes.forEach((node) => {
      const assignment = rowTopology.variables[node.name];
      const currentY = positions.get(node.id) ?? node.y;
      const anchorY = computeInitialBandY(node, rowTopology, bandCenterByName, softAnchorYByNodeId, node.id);
      const rigidity = getAccountingBandRigidity(assignment, node);
      let nextY = currentY + (anchorY - currentY) * (0.22 + rigidity * 0.2);

      const neighbors = adjacency.get(node.id) ?? [];
      if (neighbors.length > 0) {
        let weightedSum = 0;
        let totalWeight = 0;
        neighbors.forEach((neighbor) => {
          const neighborY = positions.get(neighbor.id);
          if (neighborY == null) {
            return;
          }
          weightedSum += neighborY * neighbor.weight;
          totalWeight += neighbor.weight;
        });
        if (totalWeight > 0) {
          const neighborAttraction = rigidity >= 0.95 ? 0 : 0.15 * (1 - rigidity * 0.8);
          nextY += ((weightedSum / totalWeight) - currentY) * neighborAttraction;
        }
      }

      nodes.forEach((other) => {
        if (other.id === node.id) {
          return;
        }
        const otherY = positions.get(other.id) ?? other.y;
        const yDelta = currentY - otherY;
        const xDelta = Math.abs(node.x - other.x);
        const minGap = NODE_HEIGHT + 10;
        if (Math.abs(yDelta) >= minGap || xDelta > COLUMN_GAP * 0.8) {
          return;
        }
        const push = ((minGap - Math.abs(yDelta)) / minGap) * 4;
        nextY += (yDelta >= 0 ? 1 : -1) * push;
      });

      const primaryBand = node.proxyBand ?? assignment?.primaryBand;
      const primaryCenter = primaryBand ? (bandCenterByName.get(primaryBand) ?? null) : null;
      const limit = computePrimaryBandLimit(primaryCenter, rigidity);
      const bounded =
        primaryCenter == null
          ? clamp(nextY, minY, maxY)
          : clamp(nextY, primaryCenter - limit, primaryCenter + limit);
      next.set(node.id, bounded);
    });

    next.forEach((value, key) => positions.set(key, value));
  }

  nodes.forEach((node) => {
    node.y = positions.get(node.id) ?? node.y;
  });
}

function getAccountingBandRigidity(
  assignment: DependencyRowTopology["variables"][string],
  node?: Pick<DisplayNode, "proxyBand" | "isProxy">
): number {
  if (node?.isProxy && node.proxyBand) {
    return 1;
  }
  if (!assignment || assignment.memberships.length === 0) {
    return 0;
  }
  if (assignment.primaryBand === "Exogenous") {
    return 0.1;
  }
  if (assignment.primaryBand === "Unmapped") {
    return 0.12;
  }
  if (assignment.memberships.length !== 1) {
    return 0.2;
  }

  const onlyMembership = assignment.memberships[0];
  if (!onlyMembership) {
    return 0;
  }
  if (
    (onlyMembership.source === "transaction-row" || onlyMembership.source === "balance-row") &&
    onlyMembership.confidence === "high"
  ) {
    return 1;
  }
  if (onlyMembership.source === "inferred") {
    return 0.15;
  }
  return 0.55;
}

function computePrimaryBandLimit(primaryCenter: number | null, rigidity: number): number {
  if (primaryCenter == null) {
    return HORIZONTAL_BAND_HEIGHT * 0.8;
  }
  if (rigidity >= 0.95) {
    return 16;
  }
  if (rigidity >= 0.5) {
    return 24;
  }
  return HORIZONTAL_BAND_HEIGHT * 0.65;
}

function resolveVerticalCollisions(
  nodes: PositionedNode[],
  bandCenterByName: Map<string, number>
): void {
  resolveGroupedVerticalCollisions(nodes, bandCenterByName, (node) => String(node.layer));
}

function resolveVerticalCollisionsByX(
  nodes: PositionedNode[],
  bandCenterByName: Map<string, number>
): void {
  resolveGroupedVerticalCollisions(nodes, bandCenterByName, (node) => String(node.x));
}

function resolveGroupedVerticalCollisions(
  nodes: PositionedNode[],
  bandCenterByName: Map<string, number>,
  groupKeyForNode: (node: PositionedNode) => string
): void {
  const buckets = new Map<string, PositionedNode[]>();
  nodes.forEach((node) => {
    const key = groupKeyForNode(node);
    const bucket = buckets.get(key) ?? [];
    bucket.push(node);
    buckets.set(key, bucket);
  });
  const minY = Math.min(...bandCenterByName.values()) - HORIZONTAL_BAND_HEIGHT / 2 + NODE_HEIGHT / 2;
  const maxY = Math.max(...bandCenterByName.values()) + HORIZONTAL_BAND_HEIGHT / 2 - NODE_HEIGHT / 2;

  buckets.forEach((bucket) => {
    bucket.sort((left, right) => left.y - right.y || left.order - right.order);
    let previousBottom = minY - (NODE_HEIGHT + 10);
    bucket.forEach((node) => {
      const minAllowed = previousBottom + NODE_HEIGHT + 10;
      if (node.y < minAllowed) {
        node.y = minAllowed;
      }
      previousBottom = node.y;
    });

    for (let index = bucket.length - 1; index >= 0; index -= 1) {
      const node = bucket[index];
      const nextNode = bucket[index + 1];
      if (node.y > maxY - (bucket.length - 1 - index) * (NODE_HEIGHT + 10)) {
        node.y = maxY - (bucket.length - 1 - index) * (NODE_HEIGHT + 10);
      }
      if (nextNode && nextNode.y - node.y < NODE_HEIGHT + 10) {
        node.y = nextNode.y - (NODE_HEIGHT + 10);
      }
      node.y = clamp(node.y, minY, maxY);
    }
  });
}

function spreadNodesWithinAccountingCells(
  nodes: PositionedNode[],
  rowTopology: DependencyRowTopology,
  args: {
    cellHalfWidth: number;
    bandCenterByName: Map<string, number>;
  }
): CellSpreadDiagnosticEntry[] {
  const groups = new Map<string, PositionedNode[]>();
  const diagnostics: CellSpreadDiagnosticEntry[] = [];

  nodes.forEach((node) => {
    const primaryBand = rowTopology.variables[node.name]?.primaryBand ?? "Unmapped";
    const anchorX = Math.round(node.x);
    const key = `${primaryBand}::${anchorX}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(node);
    groups.set(key, bucket);
  });

  groups.forEach((bucket, key) => {
    if (bucket.length <= 1) {
      return;
    }

    const [bandName, anchorXStr] = key.split("::");
    const keyAnchorX = Number(anchorXStr);
    const keyAnchorY = args.bandCenterByName.get(bandName) ?? bucket[0].y;

    const beforePositions = bucket.map((node) => ({
      id: node.id,
      name: node.name,
      beforeX: node.x,
      beforeY: node.y,
      afterX: node.x,
      afterY: node.y
    }));

    bucket.sort((left, right) => {
      const leftCanonical = left.canonicalName ?? left.name;
      const rightCanonical = right.canonicalName ?? right.name;
      const canonicalDelta = leftCanonical.localeCompare(rightCanonical);
      if (canonicalDelta !== 0) {
        return canonicalDelta;
      }

      const leftProxyPriority =
        left.isProxy && left.proxyKind ? (PROXY_KIND_PRIORITY[left.proxyKind] ?? 99) : -1;
      const rightProxyPriority =
        right.isProxy && right.proxyKind ? (PROXY_KIND_PRIORITY[right.proxyKind] ?? 99) : -1;
      if (leftProxyPriority !== rightProxyPriority) {
        return leftProxyPriority - rightProxyPriority;
      }

      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.label.localeCompare(right.label);
    });
    const anchorX = bucket.reduce((sum, node) => sum + node.x, 0) / bucket.length;
    const anchorY = bucket.reduce((sum, node) => sum + node.y, 0) / bucket.length;
    const isUnmapped = bandName === "Unmapped" || bandName === "Exogenous";
    const cellWidth = isUnmapped ? args.cellHalfWidth * 4 : args.cellHalfWidth * 2;
    const cellHeight = isUnmapped
      ? Math.max(HORIZONTAL_BAND_HEIGHT * 2, (HORIZONTAL_BAND_HEIGHT - NODE_HEIGHT) * 3)
      : HORIZONTAL_BAND_HEIGHT - NODE_HEIGHT;
    const aspect = cellHeight > 0 ? cellWidth / cellHeight : 1;
    const maxSafeColumns = Math.max(1, Math.floor(cellWidth / (NODE_WIDTH + 6)) + 1);
    const columns = Math.min(
      bucket.length,
      maxSafeColumns,
      Math.max(1, Math.round(Math.sqrt(bucket.length * aspect)))
    );
    const rows = Math.ceil(bucket.length / columns);
    const colStep = columns <= 1 ? 0 : cellWidth / (columns - 1);
    const rowStep = rows <= 1 ? 0 : cellHeight / (rows - 1);

    bucket.forEach((node, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      node.x = columns <= 1 ? anchorX : anchorX - cellWidth / 2 + col * colStep;
      node.y = rows <= 1 ? anchorY : anchorY - cellHeight / 2 + row * rowStep;
    });

    bucket.forEach((node, index) => {
      beforePositions[index].afterX = node.x;
      beforePositions[index].afterY = node.y;
    });

    diagnostics.push({
      cellKey: key,
      cellX: keyAnchorX,
      cellY: keyAnchorY,
      cellWidth,
      cellHeight,
      columns,
      rows,
      nodeCount: bucket.length,
      nodes: beforePositions
    });
  });

  return diagnostics;
}

function applyExogenousTargetPlacement(
  nodes: PositionedNode[],
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  rowTopology: DependencyRowTopology,
  bandCenterByName: Map<string, number>,
  args: {
    cellHalfWidth: number;
    horizontalMinX: number;
    horizontalMaxX: number;
  }
): void {
  if (nodes.length === 0 || bandCenterByName.size === 0) {
    return;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const horizontalMidX = (args.horizontalMinX + args.horizontalMaxX) / 2;
  const outgoingEdgesBySource = new Map<string, DependencyGraphEdge[]>();
  graph.edges.forEach((edge) => {
    const bucket = outgoingEdgesBySource.get(edge.sourceId) ?? [];
    bucket.push(edge);
    outgoingEdgesBySource.set(edge.sourceId, bucket);
  });
  const exogenousPlacements = new Map<
    string,
    {
      outgoingTargets: Array<{ target: PositionedNode; weight: number }>;
      primaryTarget: PositionedNode | null;
      siblingSlot: number;
      siblingCount: number;
    }
  >();
  const exogenousByPrimaryTarget = new Map<string, PositionedNode[]>();

  const minY = Math.min(...bandCenterByName.values()) - HORIZONTAL_BAND_HEIGHT / 2 + NODE_HEIGHT / 2;
  const maxY = Math.max(...bandCenterByName.values()) + HORIZONTAL_BAND_HEIGHT / 2 - NODE_HEIGHT / 2;

  nodes.forEach((node) => {
    const assignment = rowTopology.variables[node.name];
    const isExogenous =
      node.variableType === "exogenous" ||
      (assignment?.primaryBand ?? "Unmapped") === "Exogenous";
    if (!isExogenous || node.isProxy) {
      return;
    }

    const outgoingTargets = (outgoingEdgesBySource.get(node.id) ?? [])
      .map((edge) => {
        const target = nodeById.get(edge.targetId);
        if (!target) {
          return null;
        }
        const baseWeight = edge.current ? (edge.lagged ? 1.4 : 2) : 0.8;
        const weight = target.isProxy ? baseWeight * 0.35 : baseWeight;
        return { target, weight };
      })
      .filter((value): value is { target: PositionedNode; weight: number } => value != null);

    const nonProxyTargets = outgoingTargets.filter(({ target }) => !target.isProxy);
    const weightedTargets = nonProxyTargets.length > 0 ? nonProxyTargets : outgoingTargets;

    if (weightedTargets.length === 0) {
      return;
    }

    const primaryTarget =
      weightedTargets.length === 1
        ? weightedTargets[0]?.target ?? null
        : [...weightedTargets].sort(
            (left, right) =>
              right.weight - left.weight ||
              left.target.order - right.target.order ||
              left.target.id.localeCompare(right.target.id)
          )[0]?.target ?? null;

    exogenousPlacements.set(node.id, {
      outgoingTargets: weightedTargets,
      primaryTarget,
      siblingCount: 1,
      siblingSlot: 0
    });

    if (primaryTarget && weightedTargets.length === 1) {
      const bucket = exogenousByPrimaryTarget.get(primaryTarget.id) ?? [];
      bucket.push(node);
      exogenousByPrimaryTarget.set(primaryTarget.id, bucket);
    }
  });

  exogenousByPrimaryTarget.forEach((bucket) => {
    bucket.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
    bucket.forEach((node, index) => {
      const placement = exogenousPlacements.get(node.id);
      if (!placement) {
        return;
      }
      placement.siblingCount = bucket.length;
      placement.siblingSlot = index;
      exogenousPlacements.set(node.id, placement);
    });
  });

  for (let round = 0; round < 5; round += 1) {
    nodes.forEach((node) => {
      const assignment = rowTopology.variables[node.name];
      const isExogenous =
        node.variableType === "exogenous" ||
        (assignment?.primaryBand ?? "Unmapped") === "Exogenous";
      if (!isExogenous || node.isProxy) {
        return;
      }

      const placement = exogenousPlacements.get(node.id);
      const outgoingTargets = placement?.outgoingTargets ?? [];

      if (outgoingTargets.length === 0) {
        return;
      }

      let targetXSum = 0;
      let targetYSum = 0;
      let totalWeight = 0;
      let minTargetX = Number.POSITIVE_INFINITY;
      let maxTargetX = Number.NEGATIVE_INFINITY;

      outgoingTargets.forEach(({ target, weight }) => {
        targetXSum += target.x * weight;
        targetYSum += target.y * weight;
        totalWeight += weight;
        minTargetX = Math.min(minTargetX, target.x);
        maxTargetX = Math.max(maxTargetX, target.x);
      });

      if (totalWeight <= 0) {
        return;
      }

      const targetX = targetXSum / totalWeight;
      const targetY = targetYSum / totalWeight;
      const primaryTarget = placement?.primaryTarget ?? null;
      const hardMinHorizontalGap = NODE_WIDTH + 16;
      let nextX = clamp(targetX, args.horizontalMinX, args.horizontalMaxX);
      let nextY = clamp(targetY, minY, maxY);

      if (primaryTarget && outgoingTargets.length === 1) {
        const preferredSide =
          placement && placement.siblingCount > 1
            ? placement.siblingSlot % 2 === 0
              ? -1
              : 1
            : Math.sign((primaryTarget.x - horizontalMidX) || (targetX - horizontalMidX) || 1);
        const ringIndex =
          placement && placement.siblingCount > 1 ? Math.floor(placement.siblingSlot / 2) : 0;
        const clearance = NODE_WIDTH + 26 + ringIndex * 16;
        const slotStepY = NODE_HEIGHT + 12;
        const slotCenter =
          placement && placement.siblingCount > 1
            ? placement.siblingSlot - (placement.siblingCount - 1) / 2
            : 0;
        nextX = primaryTarget.x + preferredSide * clearance;
        nextY = primaryTarget.y + slotCenter * slotStepY;
      }

      const nearbyNodes = nodes.filter((other) => {
        if (other.id === node.id) {
          return false;
        }
        return (
          Math.abs(other.x - nextX) <= args.cellHalfWidth * 2.25 &&
          Math.abs(other.y - nextY) <= HORIZONTAL_BAND_HEIGHT * 1.15
        );
      });

      if (nearbyNodes.length > 0) {
        const centerX = nearbyNodes.reduce((sum, other) => sum + other.x, 0) / nearbyNodes.length;
        const centerY = nearbyNodes.reduce((sum, other) => sum + other.y, 0) / nearbyNodes.length;
        const outwardX = Math.sign((nextX - centerX) || (targetX - centerX) || ((minTargetX + maxTargetX) / 2 - centerX) || 1);
        const outwardY = Math.sign((nextY - centerY) || (targetY - centerY) || -1);
        nextX += outwardX * 14;
        nextY += outwardY * 6;
      }

      let separationX = 0;
      let separationY = 0;
      const hardMinVerticalGap = NODE_HEIGHT + 8;
      nearbyNodes.forEach((other) => {
        const dx = nextX - other.x;
        const dy = nextY - other.y;
        const overlapX = NODE_WIDTH + 8 - Math.abs(dx);
        const overlapY = NODE_HEIGHT + 8 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) {
          return;
        }

        const directionX = Math.sign(dx || (node.order <= other.order ? -1 : 1));
        const directionY = Math.sign(dy || -1);
        const horizontalPriority = overlapX >= overlapY * 0.6;
        separationX += directionX * (overlapX * (horizontalPriority ? 0.8 : 0.45) + 6);
        separationY += directionY * (overlapY * (horizontalPriority ? 0.2 : 0.45) + 2);
      });

      nextX += separationX;
      nextY += separationY;

      if (primaryTarget && outgoingTargets.length === 1) {
        const dxToTarget = nextX - primaryTarget.x;
        const dyToTarget = nextY - primaryTarget.y;
        const minTargetGapX = NODE_WIDTH + 20;
        const minTargetGapY = NODE_HEIGHT * 0.65;
        if (Math.abs(dyToTarget) < minTargetGapY && Math.abs(dxToTarget) < minTargetGapX) {
          const directionX = Math.sign(dxToTarget || (targetX - primaryTarget.x) || 1);
          nextX = primaryTarget.x + directionX * (minTargetGapX + 2);
        }
      }

      const weightedPosition = chooseWeightedExogenousPosition({
        anchorX: nextX,
        anchorY: nextY,
        graphCenterX: horizontalMidX,
        graphCenterY: (minY + maxY) / 2,
        maxX: args.horizontalMaxX,
        maxY,
        minX: args.horizontalMinX,
        minY,
        nodeId: node.id,
        nodes,
        outgoingTargets,
        targetX,
        targetY,
        twoTargetBalance:
          outgoingTargets.length === 2
            ? {
                left: outgoingTargets[0]?.target ?? null,
                right: outgoingTargets[1]?.target ?? null
              }
            : null
      });
      nextX = weightedPosition.x;
      nextY = weightedPosition.y;

      nearbyNodes.forEach((other) => {
        const dx = nextX - other.x;
        const dy = nextY - other.y;
        if (Math.abs(dy) > hardMinVerticalGap) {
          return;
        }
        const requiredGap = hardMinHorizontalGap - Math.abs(dx);
        if (requiredGap <= 0) {
          return;
        }
        const directionX = Math.sign(dx || (targetX - other.x) || (node.order <= other.order ? -1 : 1));
        nextX += directionX * (requiredGap + 2);
      });

      node.x = clamp(nextX, args.horizontalMinX, args.horizontalMaxX);
      node.y = clamp(nextY, minY, maxY);
    });
  }
}

function chooseWeightedExogenousPosition(args: {
  nodeId: string;
  anchorX: number;
  anchorY: number;
  targetX: number;
  targetY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  graphCenterX: number;
  graphCenterY: number;
  nodes: PositionedNode[];
  outgoingTargets: Array<{ target: PositionedNode; weight: number }>;
  twoTargetBalance: { left: PositionedNode | null; right: PositionedNode | null } | null;
}): { x: number; y: number } {
  const candidateOffsetsX = [0, -24, 24, -48, 48, -72, 72];
  const candidateOffsetsY = [
    0,
    -(NODE_HEIGHT + 10),
    NODE_HEIGHT + 10,
    -(HORIZONTAL_BAND_HEIGHT * 0.55),
    HORIZONTAL_BAND_HEIGHT * 0.55,
    -HORIZONTAL_BAND_HEIGHT,
    HORIZONTAL_BAND_HEIGHT,
    -(HORIZONTAL_BAND_HEIGHT * 1.45),
    HORIZONTAL_BAND_HEIGHT * 1.45
  ];
  const nearbyNodes = args.nodes.filter(
    (other) =>
      other.id !== args.nodeId &&
      Math.abs(other.x - args.anchorX) <= COLUMN_GAP * 1.1 &&
      Math.abs(other.y - args.anchorY) <= HORIZONTAL_BAND_HEIGHT * 2.1
  );
  const localCenterX =
    nearbyNodes.length > 0
      ? nearbyNodes.reduce((sum, other) => sum + other.x, 0) / nearbyNodes.length
      : args.graphCenterX;
  const localCenterY =
    nearbyNodes.length > 0
      ? nearbyNodes.reduce((sum, other) => sum + other.y, 0) / nearbyNodes.length
      : args.graphCenterY;
  let best = {
    x: clamp(args.anchorX, args.minX, args.maxX),
    y: clamp(args.anchorY, args.minY, args.maxY)
  };
  let bestScore = Number.POSITIVE_INFINITY;

  candidateOffsetsX.forEach((offsetX) => {
    candidateOffsetsY.forEach((offsetY) => {
      const candidateX = clamp(args.anchorX + offsetX, args.minX, args.maxX);
      const candidateY = clamp(args.anchorY + offsetY, args.minY, args.maxY);
      let score =
        Math.hypot(candidateX - args.anchorX, candidateY - args.anchorY) * 0.08 +
        Math.hypot(candidateX - args.targetX, candidateY - args.targetY) * 0.12;

      const localDistance = Math.hypot(candidateX - localCenterX, candidateY - localCenterY);
      const graphDistance = Math.hypot(candidateX - args.graphCenterX, candidateY - args.graphCenterY);
      score += 160 / Math.max(24, localDistance);
      score += 40 / Math.max(80, graphDistance);

      nearbyNodes.forEach((other) => {
        const dx = Math.abs(candidateX - other.x);
        const dy = Math.abs(candidateY - other.y);
        const overlapX = NODE_WIDTH + 8 - dx;
        const overlapY = NODE_HEIGHT + 8 - dy;
        if (overlapX > 0 && overlapY > 0) {
          score += 1200 + overlapX * overlapY * 2.4;
          return;
        }
        if (dx < NODE_WIDTH + 18 && dy < NODE_HEIGHT + 14) {
          score += (NODE_WIDTH + 18 - dx) * 6 + (NODE_HEIGHT + 14 - dy) * 4;
        }
      });

      if (args.twoTargetBalance?.left && args.twoTargetBalance?.right) {
        const leftDistance = Math.hypot(
          candidateX - args.twoTargetBalance.left.x,
          candidateY - args.twoTargetBalance.left.y
        );
        const rightDistance = Math.hypot(
          candidateX - args.twoTargetBalance.right.x,
          candidateY - args.twoTargetBalance.right.y
        );
        score += Math.abs(leftDistance - rightDistance) * 0.22;
      }

      if (score < bestScore) {
        bestScore = score;
        best = { x: candidateX, y: candidateY };
      }
    });
  });

  return best;
}

function compareStripNodes(left: DependencyGraphNode, right: DependencyGraphNode): number {
  if (left.equationIndex != null && right.equationIndex != null && left.equationIndex !== right.equationIndex) {
    return left.equationIndex - right.equationIndex;
  }
  return left.order - right.order || left.name.localeCompare(right.name);
}

function resolveDisplaySector(
  node: Pick<DisplayNode, "name" | "canonicalName" | "mirrorSector">,
  sectorTopology: SectorTopology
): string {
  if (node.mirrorSector) {
    return node.mirrorSector;
  }
  const canonicalName = node.canonicalName ?? node.name;
  return sectorTopology.variables[canonicalName]?.sector ?? sectorTopology.variables[node.name]?.sector ?? "Unmapped";
}

function buildSectorSubtitle(
  sector: string,
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  sectorTopology: SectorTopology
): string | undefined {
  const nodes = graph.nodes.filter(
    (node) => resolveDisplaySector(node, sectorTopology) === sector
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

function buildBandSubtitle(
  band: string,
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  rowTopology: DependencyRowTopology
): string | undefined {
  const nodes = graph.nodes.filter((node) => rowTopology.variables[node.name]?.primaryBand === band);
  if (nodes.length === 0) {
    return undefined;
  }
  const explicit = nodes.filter((node) =>
    rowTopology.variables[node.name]?.memberships.some(
      (membership) => membership.band === band && membership.source !== "inferred"
    )
  ).length;
  const inferred = nodes.length - explicit;
  return inferred > 0 ? `${explicit} explicit, ${inferred} inferred` : `${explicit} mapped`;
}