import type { NodeProps } from "@xyflow/react";

import type { MatrixNoteNodeData } from "../transactionFlowLayout";

export function MatrixNoteNode({ data }: NodeProps) {
  const noteData = data as unknown as MatrixNoteNodeData;

  return (
    <div className="matrix-flow-note" role="note">
      {noteData.text}
    </div>
  );
}
