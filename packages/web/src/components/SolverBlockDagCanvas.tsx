import { useMemo } from "react";
import type { NodeTypes } from "@xyflow/react";

import type { EquationBlock, ModelDefinition } from "@sfcr/core";

import { SolverBlockDagNode } from "./flow/SolverBlockDagNode";
import { FlowGraphShell } from "./flow/FlowGraphShell";
import { buildSolverBlockDagGraph, buildSolverBlockDagLayout } from "../lib/solverBlockDag";

const nodeTypes: NodeTypes = {
  solverBlockDag: SolverBlockDagNode
};

export function SolverBlockDagCanvas({
  blocks,
  fitViewRequest = 0,
  model
}: {
  blocks: EquationBlock[];
  fitViewRequest?: number;
  model: ModelDefinition;
}) {
  const layout = useMemo(() => {
    const graph = buildSolverBlockDagGraph(model, blocks);
    return {
      graph,
      layout: buildSolverBlockDagLayout(graph)
    };
  }, [blocks, model]);

  return (
    <div className="solver-block-dag-canvas">
      <FlowGraphShell
        ariaLabel="Solver block dependency graph"
        canvasHeight={layout.layout.height}
        canvasWidth={layout.layout.width}
        edges={layout.layout.edges}
        fitViewKey={`${layout.layout.width}-${layout.layout.height}-${blocks.length}-${layout.graph.edges.length}`}
        fitViewRequest={fitViewRequest}
        minViewportWidth={360}
        nodes={layout.layout.nodes}
        nodeTypes={nodeTypes}
        nodesDraggable
      />
      {layout.graph.errors.length ? (
        <ul className="validation-list">
          {layout.graph.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
