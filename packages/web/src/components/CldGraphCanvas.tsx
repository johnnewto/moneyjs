import { useMemo } from "react";
import type { NodeTypes } from "@xyflow/react";

import type { Link } from "@sfcr/core";

import { CldVariableNode } from "./flow/CldVariableNode";
import { FlowGraphShell } from "./flow/FlowGraphShell";
import { buildCldLayout } from "../notebook/cldLayout";

const nodeTypes: NodeTypes = {
  cldVariable: CldVariableNode
};

export function CldGraphCanvas({
  links,
  fitViewRequest = 0,
  onNodeClick
}: {
  links: Link[];
  fitViewRequest?: number;
  onNodeClick?: (variableName: string) => void;
}) {
  const layout = useMemo(() => buildCldLayout(links), [links]);

  return (
    <FlowGraphShell
      ariaLabel="Causal loop diagram"
      canvasHeight={layout.height}
      canvasWidth={layout.width}
      edges={layout.edges}
      fitViewKey={`${layout.width}-${layout.height}-${links.length}`}
      fitViewRequest={fitViewRequest}
      minViewportWidth={360}
      nodes={layout.nodes}
      nodeTypes={nodeTypes}
      nodesDraggable
      onNodeClick={
        onNodeClick
          ? (_event, node) => {
              onNodeClick(node.id);
            }
          : undefined
      }
    />
  );
}
