import type { NodeProps } from "@xyflow/react";

import type { MatrixColumnNodeData } from "../transactionFlowLayout";

const COLUMN_PALETTES = [
  "matrix-column--green",
  "matrix-column--sky",
  "matrix-column--blue",
  "matrix-column--amber",
  "matrix-column--orange",
  "matrix-column--slate"
] as const;

export function MatrixColumnNode({ data, id }: NodeProps) {
  const columnData = data as unknown as MatrixColumnNodeData;
  const paletteIndex =
    Math.abs(id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) %
    COLUMN_PALETTES.length;

  return (
    <div className={`matrix-flow-column ${COLUMN_PALETTES[paletteIndex]}`}>
      <div className="matrix-flow-column__label">{columnData.label}</div>
      <div className="matrix-flow-column__lifeline" aria-hidden="true" />
    </div>
  );
}
