import type { Edge } from "@xyflow/react";

import {
  computeFlowArrowMarkerSize,
  type MatrixFlowEdgeData
} from "./transactionFlowLayout";

/** Normalized marker geometry (scaled via markerWidth/Height in user space). */
const FLOW_ARROW_SHAPE_SIZE = 10;
/** refX at the arrow base so the line ends under the head; tip reaches the target lifeline. */
const FLOW_ARROW_MARKER_REF_X = 0;

export function TransactionFlowSvgOverlay({
  edges,
  height,
  width
}: {
  edges: Edge[];
  height: number;
  width: number;
}) {
  return (
    <svg
      className="transaction-flow-svg-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <defs>
        {edges.map((edge) => {
          const edgeData = edge.data as unknown as MatrixFlowEdgeData | undefined;
          if (!edgeData) {
            return null;
          }
          const color = edgeData.color ?? "#334155";
          const strokeWidth = edgeData.highlighted ? edgeData.strokeWidth + 1 : edgeData.strokeWidth;
          const markerSize = computeFlowArrowMarkerSize(strokeWidth);

          return (
            <marker
              key={`marker-${edge.id}`}
              id={`flow-arrow-${edge.id}`}
              markerHeight={markerSize}
              markerUnits="userSpaceOnUse"
              markerWidth={markerSize}
              orient="auto"
              refX={FLOW_ARROW_MARKER_REF_X}
              refY={FLOW_ARROW_SHAPE_SIZE / 2}
              viewBox={`0 0 ${FLOW_ARROW_SHAPE_SIZE} ${FLOW_ARROW_SHAPE_SIZE}`}
            >
              <path
                d={`M 0 1 L ${FLOW_ARROW_SHAPE_SIZE - 1} ${FLOW_ARROW_SHAPE_SIZE / 2} L 0 ${FLOW_ARROW_SHAPE_SIZE - 1} Z`}
                fill={color}
              />
            </marker>
          );
        })}
      </defs>
      {edges.map((edge) => {
        const edgeData = edge.data as unknown as MatrixFlowEdgeData | undefined;
        if (!edgeData) {
          return null;
        }

        const direction = edgeData.targetX >= edgeData.sourceX ? 1 : -1;
        const laneOffset = (edgeData.laneOffset ?? 0) * 10;
        const rowY = edgeData.rowY + laneOffset;
        const strokeWidth = edgeData.highlighted ? edgeData.strokeWidth + 1 : edgeData.strokeWidth;
        const markerSize = computeFlowArrowMarkerSize(strokeWidth);
        const startX = edgeData.sourceX;
        const lineEndX = edgeData.targetX - direction * markerSize;
        const midX = (startX + lineEndX) / 2;
        const path = `M ${startX} ${rowY} L ${lineEndX} ${rowY}`;
        const expressionLabel =
          edgeData.sourceExpression && edgeData.targetExpression
            ? `${edgeData.sourceExpression} → ${edgeData.targetExpression}`
            : null;
        const labelColor =
          edgeData.magnitude != null && edgeData.magnitude < 0 ? "#b42318" : "#0f172a";

        return (
          <g key={edge.id} className="transaction-flow-edge">
            <path
              className="transaction-flow-edge__path"
              d={path}
              fill="none"
              markerEnd={`url(#flow-arrow-${edge.id})`}
              stroke={edgeData.highlighted ? "#0f172a" : edgeData.color}
              strokeDasharray={edgeData.lineStyle === "dashed" ? "8 6" : undefined}
              strokeLinecap="butt"
              strokeWidth={strokeWidth}
            />
            <foreignObject
              className="transaction-flow-edge__label-host"
              height={48}
              width={164}
              x={midX - 82}
              y={rowY - 44}
            >
              <div className="matrix-flow-edge-label">
                <div className="matrix-flow-edge-label__title">{edgeData.flowLabel}</div>
                {expressionLabel ? (
                  <div className="matrix-flow-edge-label__expr" style={{ color: labelColor }}>
                    {expressionLabel}
                  </div>
                ) : null}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
