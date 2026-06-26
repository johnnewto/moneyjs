import { formatMatrixColumnCellParseError as formatCoreMatrixColumnCellParseError } from "@sfcr/core";

import type { MatrixCell } from "../notebook/types";

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
