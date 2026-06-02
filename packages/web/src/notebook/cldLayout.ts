import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { Link } from "@sfcr/core";

const NODE_WIDTH = 96;
const NODE_HEIGHT = 40;
const CANVAS_PADDING = 72;

export interface CldLayout {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
}

export function buildCldLayout(links: Link[]): CldLayout {
  const nodeNames = collectNodeNames(links);
  const count = Math.max(nodeNames.length, 1);
  const radius = Math.max(140, count * 28);
  const centerX = radius + CANVAS_PADDING;
  const centerY = radius + CANVAS_PADDING;
  const width = centerX * 2;
  const height = centerY * 2;

  const nodes: Node[] = nodeNames.map((name, index) => {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    return {
      id: name,
      type: "cldVariable",
      position: {
        x: centerX + radius * Math.cos(angle) - NODE_WIDTH / 2,
        y: centerY + radius * Math.sin(angle) - NODE_HEIGHT / 2
      },
      data: { label: name },
      draggable: true
    };
  });

  const edges: Edge[] = links.map((link) => ({
    id: `${link.from}->${link.to}`,
    source: link.from,
    target: link.to,
    label: link.polarity,
    className: link.polarity === "-" ? "cld-edge is-negative" : "cld-edge is-positive",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      stroke: link.polarity === "-" ? "#b91c1c" : "#15803d",
      strokeWidth: 2
    },
    labelStyle: {
      fill: link.polarity === "-" ? "#b91c1c" : "#15803d",
      fontWeight: 700
    }
  }));

  return { nodes, edges, width, height };
}

function collectNodeNames(links: Link[]): string[] {
  const names = new Set<string>();
  for (const link of links) {
    names.add(link.from);
    names.add(link.to);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}
