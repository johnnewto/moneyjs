import { formatMatrixColumnCellParseError as formatCoreMatrixColumnCellParseError } from "@sfcr/core";

import type { MatrixCell } from "../notebook/types";

export function formatMatrixCellParseLabel(
  cell: Pick<MatrixCell, "id" | "title">,
  rowLabel: string,
  columnLabel: string
): string {
  const title = cell.title.trim() || cell.id;
  const row = rowLabel.trim() || "row";
  const column = columnLabel.trim() || "column";
  return `Matrix '${title}' cell (${row} / ${column})`;
}

export function formatMatrixEntryParseMessage(
  cell: Pick<MatrixCell, "id" | "title">,
  rowLabel: string,
  columnLabel: string,
  source: string,
  error: unknown
): string {
  return formatCoreMatrixColumnCellParseError(
    {
      matrixTitle: cell.title.trim() || cell.id,
      rowLabel,
      columnLabel
    },
    source,
    error
  );
}
