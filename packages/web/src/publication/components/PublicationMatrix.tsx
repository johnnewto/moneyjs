import { useCallback, useMemo } from "react";

import type { SimulationResult } from "@sfcr/core";
import {
  buildMatrixAccountColumnHeaderRows,
  resolveMatrixAccountColumnCellClasses,
  usesMatrixAccountColumnLayout,
  usesMatrixSectorColumnLayout,
  type MatrixColumnHeaderCell
} from "@sfcr/notebook-core";

import { resolveMatrixCornerLabel, resolveMatrixTableKind } from "../../notebook/matrixSemantics";
import {
  formatAccountTransactionsSumRowDisplayLabel,
  isEmptyAccountSumRowSource
} from "../../notebook/matrixAccountSumRow";
import {
  collectMatrixColumnGraphSeries,
  type MatrixGraphRequest
} from "../../notebook/matrixSliceGraph";
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

function PublicationMatrixColumnHeaderLabel({
  canGraph,
  columnIndex,
  label,
  onGraphColumn
}: {
  canGraph: boolean;
  columnIndex: number | null | undefined;
  label: string;
  onGraphColumn(columnIndex: number): void;
}) {
  if (!canGraph || columnIndex == null) {
    return <>{label}</>;
  }

  return (
    <button
      type="button"
      className="publication-matrix-graph-trigger"
      title={`Graph column ${label}`}
      onClick={() => onGraphColumn(columnIndex)}
    >
      {label}
    </button>
  );
}

function PublicationMatrixHeader({
  canGraph,
  cell,
  cornerLabel,
  headerRows,
  onGraphColumn
}: {
  canGraph: boolean;
  cell: MatrixCell;
  cornerLabel: string;
  headerRows: MatrixColumnHeaderCell[][];
  onGraphColumn(columnIndex: number): void;
}) {
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  const sumColumnLabel = sumColumnIndex >= 0 ? cell.columns[sumColumnIndex] : null;
  const cornerRowSpan = Math.max(headerRows.length, 1);

  if (headerRows.length === 0) {
    return (
      <thead>
        <tr>
          <th scope="col">{cornerLabel}</th>
          {cell.columns.map((column, columnIndex) => (
            <th key={column} scope="col">
              <PublicationMatrixColumnHeaderLabel
                canGraph={canGraph && columnIndex !== sumColumnIndex}
                columnIndex={columnIndex}
                label={column}
                onGraphColumn={onGraphColumn}
              />
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
              <PublicationMatrixColumnHeaderLabel
                canGraph={canGraph && headerCell.columnIndex !== sumColumnIndex}
                columnIndex={headerCell.columnIndex}
                label={headerCell.label}
                onGraphColumn={onGraphColumn}
              />
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
  getResult,
  interaction,
  onRequestMatrixGraph
}: {
  cell: MatrixCell;
  getResult?(runCellId: string): SimulationResult | null;
  interaction: PublicationVariableInteraction;
  onRequestMatrixGraph?(request: MatrixGraphRequest): void;
}) {
  const accountColumnLayout = usesMatrixAccountColumnLayout(cell.columnBadges);
  const matrixKind = resolveMatrixTableKind(cell);
  const cornerLabel = resolveMatrixCornerLabel(accountColumnLayout, matrixKind);
  const headerRows = useMemo(() => resolvePublicationMatrixHeaderRows(cell), [cell]);
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  const usesSectorColumns = headerRows.length > 0;

  const result = cell.sourceRunCellId && getResult ? getResult(cell.sourceRunCellId) : null;
  const canGraph = Boolean(cell.sourceRunCellId && result && onRequestMatrixGraph);

  const handleGraphColumn = useCallback(
    (columnIndex: number) => {
      if (!cell.sourceRunCellId || !result || !onRequestMatrixGraph) {
        return;
      }
      if (columnIndex === sumColumnIndex) {
        return;
      }

      const label = cell.columns[columnIndex]?.trim() || `Column ${columnIndex + 1}`;
      onRequestMatrixGraph({
        index: columnIndex,
        kind: "column",
        label,
        matrixCellId: cell.id,
        matrixTitle: cell.title,
        sourceRunCellId: cell.sourceRunCellId,
        series: collectMatrixColumnGraphSeries(cell, columnIndex, result),
        variableDescriptions: interaction.variableDescriptions,
        variableUnitMetadata: interaction.variableUnitMetadata
      });
    },
    [cell, interaction, onRequestMatrixGraph, result, sumColumnIndex]
  );

  return (
    <div className="publication-matrix-wrap">
      <table
        className={`publication-matrix${usesSectorColumns ? " publication-matrix-sector-columns" : ""}`}
      >
        <PublicationMatrixHeader
          canGraph={canGraph}
          cell={cell}
          cornerLabel={cornerLabel}
          headerRows={headerRows}
          onGraphColumn={handleGraphColumn}
        />
        <tbody>
          {cell.rows.map((row) => (
            <tr key={`${row.label}-${row.band ?? ""}`}>
              <th scope="row">{formatAccountTransactionsSumRowDisplayLabel(cell, row.label)}</th>
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
