import { Handle, Position, type NodeProps } from "@xyflow/react";

import { VariableMathLabel } from "../VariableMathLabel";

interface SolverBlockDagNodeData {
  label: string;
  blockId: number;
  cyclic: boolean;
  color: string;
}

export function SolverBlockDagNode({ data }: NodeProps) {
  const nodeData = data as unknown as SolverBlockDagNodeData;

  return (
    <div
      className={`solver-block-dag-node${nodeData.cyclic ? " is-cyclic" : ""}`}
      style={{ borderColor: nodeData.color }}
    >
      <Handle type="target" position={Position.Top} />
      <span className="solver-block-dag-node__label">
        <VariableMathLabel name={nodeData.label} />
      </span>
      <span className="solver-block-dag-node__block" style={{ backgroundColor: nodeData.color }}>
        {nodeData.blockId}
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
