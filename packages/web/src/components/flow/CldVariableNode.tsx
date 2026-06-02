import { Handle, Position, type NodeProps } from "@xyflow/react";

import { VariableMathLabel } from "../VariableMathLabel";

export interface CldVariableNodeData {
  label: string;
}

export function CldVariableNode({ data }: NodeProps) {
  const nodeData = data as unknown as CldVariableNodeData;
  return (
    <div className="cld-variable-node">
      <Handle type="target" position={Position.Top} />
      <span className="cld-variable-node__label">
        <VariableMathLabel name={nodeData.label} />
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
