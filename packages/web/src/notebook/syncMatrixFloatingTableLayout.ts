export function resolveNotebookFloatingHeaderAnchor(
  wrapRect: Pick<DOMRect, "left" | "width">,
  tableRect: Pick<DOMRect, "left" | "width"> | null
): { left: number; width: number } {
  if (!tableRect) {
    return { left: wrapRect.left, width: wrapRect.width };
  }

  const tableOverflowsWrap = tableRect.width > wrapRect.width + 0.5;
  if (tableOverflowsWrap) {
    return { left: wrapRect.left, width: wrapRect.width };
  }

  return { left: tableRect.left, width: tableRect.width };
}

function measureMatrixTableColumnWidth(
  sourceTable: HTMLTableElement,
  sourceHeaderRow: HTMLTableRowElement,
  columnIndex: number
): number {
  const sourceCol = sourceTable.querySelectorAll("colgroup col")[columnIndex];
  if (sourceCol instanceof HTMLElement) {
    const colWidth = sourceCol.getBoundingClientRect().width;
    if (colWidth > 0) {
      return colWidth;
    }
  }

  const bodyRow = sourceTable.tBodies[0]?.rows[0];
  const bodyWidth = bodyRow?.cells[columnIndex]?.getBoundingClientRect().width ?? 0;
  if (bodyWidth > 0) {
    return bodyWidth;
  }

  const sourceCols = sourceTable.querySelectorAll("colgroup col");
  const headerCellsMapPhysicalColumns = sourceHeaderRow.cells.length === sourceCols.length;
  if (headerCellsMapPhysicalColumns) {
    const headerWidth = sourceHeaderRow.cells[columnIndex]?.getBoundingClientRect().width ?? 0;
    if (headerWidth > 0) {
      return headerWidth;
    }
  }

  return 0;
}

function resolveMatrixTableContentWidth(
  sourceTable: HTMLTableElement,
  measuredColumnTotal: number
): number {
  const tableScrollWidth = sourceTable.scrollWidth;
  const tableRectWidth = sourceTable.getBoundingClientRect().width;

  return Math.max(measuredColumnTotal, tableScrollWidth, tableRectWidth);
}

export function syncMatrixFloatingTableColumnWidths(
  sourceHeaderRow: HTMLTableRowElement,
  targetTable: HTMLTableElement
): void {
  const sourceTable = sourceHeaderRow.closest("table");
  const targetHeaderRow = targetTable.tHead?.rows[0];
  if (!sourceTable || !targetHeaderRow) {
    return;
  }

  const targetCells = Array.from(targetHeaderRow.cells);
  const sourceCols = sourceTable.querySelectorAll("colgroup col");
  const targetCols = targetTable.querySelectorAll("colgroup col");
  const columnCount = Math.min(sourceCols.length, targetCols.length);

  if (columnCount === 0) {
    return;
  }

  const widths = Array.from({ length: columnCount }, (_, index) =>
    measureMatrixTableColumnWidth(sourceTable, sourceHeaderRow, index)
  );

  if (widths.every((width) => width <= 0)) {
    return;
  }

  let totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const contentWidth = resolveMatrixTableContentWidth(sourceTable, totalWidth);
  if (contentWidth > totalWidth + 0.5) {
    widths[columnCount - 1] = (widths[columnCount - 1] ?? 0) + (contentWidth - totalWidth);
    totalWidth = contentWidth;
  }

  for (let index = 0; index < columnCount; index += 1) {
    const width = widths[index] ?? 0;
    if (width <= 0) {
      continue;
    }

    const widthPx = `${width}px`;
    const targetCol = targetCols[index];
    const targetCell = targetCells[index];

    if (targetCol instanceof HTMLElement) {
      targetCol.style.width = widthPx;
    }
    if (targetCell instanceof HTMLElement) {
      targetCell.style.width = widthPx;
      targetCell.style.minWidth = widthPx;
    }
  }

  targetTable.style.tableLayout = "fixed";
  targetTable.style.width = `${totalWidth}px`;
  targetTable.style.minWidth = `${totalWidth}px`;
}
