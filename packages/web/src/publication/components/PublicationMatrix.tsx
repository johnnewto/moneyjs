import { useMemo } from "react";

import {
  buildMatrixAccountColumnHeaderRows,
  resolveMatrixAccountColumnCellClasses,
  usesMatrixAccountColumnLayout,
  usesMatrixSectorColumnLayout,
  type MatrixColumnHeaderCell
} from "@sfcr/notebook-core";

import { resolveMatrixCornerLabel, resolveMatrixTableKind } from "../../notebook/matrixSemantics";
import { isEmptyAccountSumRowSource } from "../../notebook/matrixAccountSumRow";
import type { MatrixCell } from "../../notebook/types";
import type { PublicationVariableInteraction } from "../publicationInspect";
import { renderPublicationFormula } from "../publicationFormula";

const EMPTY_COLLAPSED_NODE_IDS = new Set<string>();

function formatPublicationMatrixEntry(source: string, interaction: PublicationVariableInteraction) {
  const trimmed = source.trim();
  if (!trimmed || isEmptyAccountSumRowSource(trimmed)) {
    return trimmed === "0" ? "0" : "";
  }

  return (
    <span className="publication-matrix-entry">{renderPublicationFormula(trimmed, interaction)}</span>
  );
}

function resolvePublicationMatrixHeaderRows(cell: MatrixCell): MatrixColumnHeaderCell[][] {
  const accountColumnLayout = usesMatrixAccountColumnLayout(cell.columnBadges);
  const sectorColumnLayout = usesMatrixSectorColumnLayout(
    cell.columns,
    cell.sectors,
    cell.columnBadges,
    cell.columnTree
  );

  if (!accountColumnLayout && !sectorColumnLayout) {
    return [];
  }

  return buildMatrixAccountColumnHeaderRows(
    cell.columns,
    cell.sectors,
    cell.columnBadges ?? [],
    cell.variables,
    EMPTY_COLLAPSED_NODE_IDS,
    { perColumnCollapse: accountColumnLayout }
  );
}

function resolvePublicationMatrixColumnClassName(
  cell: MatrixCell,
  columnIndex: number | null | undefined,
  sumColumnIndex: number
): string | undefined {
  if (columnIndex == null) {
    return undefined;
  }

  return (
    resolveMatrixAccountColumnCellClasses(
      cell.columns,
      cell.sectors,
      cell.columnBadges,
      columnIndex,
      sumColumnIndex,
      cell.columnTree
    )
      .map((className) => {
        switch (className) {
          case "notebook-matrix-sector-start":
            return "publication-matrix-sector-start";
          case "notebook-matrix-intra-sector-divider":
            return "publication-matrix-intra-sector-divider";
          case "notebook-matrix-sum-column":
            return "publication-matrix-sum-column";
          default:
            return null;
        }
      })
      .filter(Boolean)
      .join(" ") || undefined
  );
}

function PublicationMatrixHeader({
  cell,
  cornerLabel,
  headerRows
}: {
  cell: MatrixCell;
  cornerLabel: string;
  headerRows: MatrixColumnHeaderCell[][];
}) {
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  const sumColumnLabel = sumColumnIndex >= 0 ? cell.columns[sumColumnIndex] : null;
  const cornerRowSpan = Math.max(headerRows.length, 1);

  if (headerRows.length === 0) {
    return (
      <thead>
        <tr>
          <th scope="col">{cornerLabel}</th>
          {cell.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
    );
  }

  return (
    <thead>
      {headerRows.map((row, rowIndex) => (
        <tr key={`publication-matrix-header-${rowIndex}`}>
          {rowIndex === 0 ? (
            <th scope="col" rowSpan={cornerRowSpan}>
              {cornerLabel}
            </th>
          ) : null}
          {row.map((headerCell) => (
            <th
              key={`${headerCell.nodeId}-${rowIndex}`}
              scope="col"
              colSpan={headerCell.colSpan}
              rowSpan={headerCell.rowSpan}
              title={headerCell.fullLabel}
              className={
                rowIndex === 0 && headerCell.isSectorStart
                  ? "publication-matrix-sector-start"
                  : resolvePublicationMatrixColumnClassName(
                      cell,
                      headerCell.columnIndex,
                      sumColumnIndex
                    )
              }
            >
              {headerCell.label}
            </th>
          ))}
          {rowIndex === 0 && sumColumnLabel ? (
            <th scope="col" rowSpan={cornerRowSpan} className="publication-matrix-sum-column">
              {sumColumnLabel}
            </th>
          ) : null}
        </tr>
      ))}
    </thead>
  );
}

export function PublicationMatrix({
  cell,
  interaction
}: {
  cell: MatrixCell;
  interaction: PublicationVariableInteraction;
}) {
  const accountColumnLayout = usesMatrixAccountColumnLayout(cell.columnBadges);
  const matrixKind = resolveMatrixTableKind(cell);
  const cornerLabel = resolveMatrixCornerLabel(accountColumnLayout, matrixKind);
  const headerRows = useMemo(() => resolvePublicationMatrixHeaderRows(cell), [cell]);
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  const usesSectorColumns = headerRows.length > 0;

  return (
    <div className="publication-matrix-wrap">
      <table
        className={`publication-matrix${usesSectorColumns ? " publication-matrix-sector-columns" : ""}`}
      >
        <PublicationMatrixHeader cell={cell} cornerLabel={cornerLabel} headerRows={headerRows} />
        <tbody>
          {cell.rows.map((row) => (
            <tr key={`${row.label}-${row.band ?? ""}`}>
              <th scope="row">{row.label}</th>
              {row.values.map((source, columnIndex) => (
                <td
                  key={`${row.label}-${columnIndex}`}
                  className={resolvePublicationMatrixColumnClassName(
                    cell,
                    columnIndex,
                    sumColumnIndex
                  )}
                >
                  {formatPublicationMatrixEntry(source, interaction)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
