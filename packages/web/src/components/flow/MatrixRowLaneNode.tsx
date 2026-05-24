import type { NodeProps } from "@xyflow/react";

import {
  TRANSACTION_FLOW_ROW_HEIGHT,
  type MatrixRowLaneNodeData
} from "../transactionFlowLayout";

export function MatrixRowLaneNode({ data }: NodeProps) {
  const laneData = data as unknown as MatrixRowLaneNodeData;
  const rowIndex = typeof laneData.rowIndex === "number" ? laneData.rowIndex : 0;
  const laneWidth =
    typeof laneData.laneWidth === "number" && laneData.laneWidth > 0 ? laneData.laneWidth : 800;

  return (
    <div
      className="matrix-flow-row-lane"
      style={{ width: laneWidth, height: TRANSACTION_FLOW_ROW_HEIGHT }}
      aria-hidden="true"
    >
      <div className="matrix-flow-row-lane__meta">
        <span className="matrix-flow-row-lane__index">{rowIndex + 1}</span>
        {laneData.rowLabel ? (
          <span className="matrix-flow-row-lane__label">{laneData.rowLabel}</span>
        ) : null}
      </div>
    </div>
  );
}
