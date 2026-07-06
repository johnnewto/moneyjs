import { sankey, sankeyLinkHorizontal, type SankeyGraph } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";

import type { SankeyLink, SankeyNode } from "../notebook/sankey";

export interface SankeyLayoutNodeRender {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  layer: number;
  group?: string;
}

export interface SankeyLayoutLinkRender {
  path: string;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  value: number;
  label?: string;
}

export interface D3SankeyLayout {
  width: number;
  height: number;
  nodes: SankeyLayoutNodeRender[];
  links: SankeyLayoutLinkRender[];
}

/** Palette inspired by the Florence keynote Sankey scripts (networkD3 ordinal range). */
const SANKEY_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#9333ea",
  "#b45309",
  "#0891b2",
  "#db2777",
  "#ea580c",
  "#65a30d",
  "#7c3aed",
  "#0d9488",
  "#4f46e5",
  "#059669",
  "#d946ef"
] as const;

const MARGIN = { top: 20, right: 160, bottom: 20, left: 24 };
const NODE_WIDTH = 20;
const NODE_PADDING = 12;
const MIN_HEIGHT = 440;
const MAX_HEIGHT = 760;

interface LayoutSankeyNode {
  id: string;
  label: string;
  group?: string;
  layer?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  value?: number;
  index?: number;
}

interface LayoutSankeyLink extends SankeyLink {
  source: LayoutSankeyNode | string;
  target: LayoutSankeyNode | string;
  y0?: number;
  y1?: number;
  width?: number;
}

export function computeLayeredSankeyLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  height = MIN_HEIGHT
): D3SankeyLayout {
  if (nodes.length === 0 || links.length === 0) {
    return { width, height, nodes: [], links: [] };
  }

  const layoutHeight = Math.min(
    MAX_HEIGHT,
    Math.max(MIN_HEIGHT, height, nodes.length * 36 + links.length * 6)
  );

  const graphNodes: LayoutSankeyNode[] = nodes.map((node) => ({
    id: node.id,
    label: node.label,
    group: node.group,
    layer: node.layer
  }));
  const graphLinks: LayoutSankeyLink[] = links.map((link) => ({
    ...link,
    source: link.sourceId,
    target: link.targetId
  }));

  const layout = sankey<LayoutSankeyNode, LayoutSankeyLink>()
    .nodeId((node) => node.id)
    .nodeAlign((node) => node.layer ?? 0)
    .nodeWidth(NODE_WIDTH)
    .nodePadding(NODE_PADDING)
    .extent([
      [MARGIN.left, MARGIN.top],
      [width - MARGIN.right, layoutHeight - MARGIN.bottom]
    ]);

  const graph = layout({
    nodes: graphNodes,
    links: graphLinks
  }) as SankeyGraph<LayoutSankeyNode, LayoutSankeyLink>;

  const colorScale = scaleOrdinal<string, string>(SANKEY_PALETTE).domain(
    graph.nodes.map((node) => nodeColorKey(node))
  );

  const linkPath = sankeyLinkHorizontal<LayoutSankeyNode, LayoutSankeyLink>();

  const renderedNodes: SankeyLayoutNodeRender[] = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    x: node.x0 ?? 0,
    y: node.y0 ?? 0,
    width: Math.max(0, (node.x1 ?? 0) - (node.x0 ?? 0)),
    height: Math.max(0, (node.y1 ?? 0) - (node.y0 ?? 0)),
    fill: colorScale(nodeColorKey(node)),
    layer: node.layer ?? 0,
    group: node.group
  }));

  const renderedLinks: SankeyLayoutLinkRender[] = graph.links.map((link) => {
    const source = link.source as LayoutSankeyNode;
    const sourceColor = colorScale(nodeColorKey(source));
    return {
      path: linkPath(link) ?? "",
      stroke: sourceColor,
      strokeOpacity: 0.55,
      strokeWidth: Math.max(1, link.width ?? 0),
      value: link.value,
      label: link.label
    };
  });

  return {
    width,
    height: layoutHeight,
    nodes: renderedNodes,
    links: renderedLinks.filter((link) => link.path.length > 0)
  };
}

function nodeColorKey(node: Pick<SankeyNode, "id" | "label" | "group">): string {
  if (node.group === "flow" || node.group === "market" || node.group === "output") {
    return node.label;
  }

  if (node.group === "sector-out" || node.group === "sector-in") {
    return node.label;
  }

  if (node.group === "inputs" || node.group === "final-demand") {
    return node.label;
  }

  return node.id;
}
