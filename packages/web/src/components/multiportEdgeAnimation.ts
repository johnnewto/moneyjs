import type { Edge } from "@xyflow/react";

export function withMultiportEdgeAnimation(edges: Edge[], animateEdges: boolean): Edge[] {
  return edges.map((edge) =>
    edge.animated === animateEdges ? edge : { ...edge, animated: animateEdges }
  );
}
