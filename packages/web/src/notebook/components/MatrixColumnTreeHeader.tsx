import { useMemo, type JSX } from "react";

import {
  buildMatrixAccountColumnDisplaySlots,
  buildMatrixAccountColumnHeaderRows,
  buildMatrixColumnDisplaySlots,
  buildMatrixColumnHeaderRows,
  collectMatrixAccountSectorCollapseKeys,
  MATRIX_ACCOUNT_SUM_COLUMN_LABEL,
  type MatrixColumnDisplaySlot,
  type MatrixColumnHeaderCell,
  usesMatrixAccountColumnLayout
} from "@sfcr/notebook-core";
import type { MatrixCell } from "../types";

import {
  formatStockRoleLabel,
  formatStockRoleTitle
} from "../matrixSemantics";

export function useMatrixColumnLayout(
  cell: Pick<MatrixCell, "columns" | "columnTree" | "sectors" | "columnBadges" | "variables">,
  collapsedNodeIds: ReadonlySet<string>
): {
  displaySlots: MatrixColumnDisplaySlot[];
  headerRows: MatrixColumnHeaderCell[][];
  usesColumnTree: boolean;
} {
  return useMemo(() => {
    if (usesMatrixAccountColumnLayout(cell.columnBadges)) {
      return {
        displaySlots: buildMatrixAccountColumnDisplaySlots(
          cell.columns,
          cell.sectors,
          cell.columnBadges ?? [],
          collapsedNodeIds
        ),
        headerRows: buildMatrixAccountColumnHeaderRows(
          cell.columns,
          cell.sectors,
          cell.columnBadges ?? [],
          cell.variables,
          collapsedNodeIds
        ),
        usesColumnTree: true
      };
    }

    if (cell.columnTree && cell.columnTree.length > 0) {
      return {
        displaySlots: buildMatrixColumnDisplaySlots(cell.columnTree, cell.columns, collapsedNodeIds),
        headerRows: buildMatrixColumnHeaderRows(cell.columnTree, cell.columns, collapsedNodeIds),
        usesColumnTree: true
      };
    }

    return {
      displaySlots: cell.columns.map((_, index) => ({ kind: "leaf" as const, columnIndex: index })),
      headerRows: [],
      usesColumnTree: false
    };
  }, [cell.columnBadges, cell.columnTree, cell.columns, cell.sectors, cell.variables, collapsedNodeIds]);
}

/** @deprecated Use useMatrixColumnLayout */
export const useMatrixColumnTreeLayout = useMatrixColumnLayout;

export function MatrixColumnTreeHeader({
  headerRows,
  columns,
  sumColumnIndex,
  collapsedNodeIds,
  editorLinked,
  accountColumnLayout = false,
  onToggleNode,
  onInspectVariable
}: {
  headerRows: MatrixColumnHeaderCell[][];
  columns: string[];
  sumColumnIndex: number;
  collapsedNodeIds: ReadonlySet<string>;
  editorLinked: boolean;
  accountColumnLayout?: boolean;
  onToggleNode(nodeId: string): void;
  onInspectVariable?(variableName: string): void;
}): JSX.Element {
  const cornerRowSpan = Math.max(headerRows.length, 1);
  const cornerLabel = accountColumnLayout ? "Flow / account" : "Transaction";
  const sumColumnHeaderLabel = accountColumnLayout
    ? MATRIX_ACCOUNT_SUM_COLUMN_LABEL
    : sumColumnIndex >= 0
      ? columns[sumColumnIndex]
      : "";

  return (
    <>
      {headerRows.map((row, rowIndex) => (
        <tr key={`matrix-column-tree-header-${rowIndex}`}>
          {rowIndex === 0 ? (
            <th rowSpan={cornerRowSpan} scope="col">
              {cornerLabel}
            </th>
          ) : null}
          {row.map((cell) => (
            <th
              key={`${cell.nodeId}-${rowIndex}`}
              colSpan={cell.colSpan}
              rowSpan={cell.rowSpan}
              scope="col"
              className={[
                cell.isCollapsedStub ? "notebook-matrix-tree-collapsed-stub-header" : undefined,
                cell.isLeafHidden ? "notebook-matrix-tree-hidden-leaf-header" : undefined,
                cell.isSectorStart ? "notebook-matrix-sector-start" : undefined,
                cell.isLeaf && cell.columnIndex === sumColumnIndex ? "notebook-matrix-sum-column" : undefined
              ]
                .filter(Boolean)
                .join(" ") || undefined}
            >
              {renderHeaderCell({
                cell,
                columns,
                collapsedNodeIds,
                editorLinked,
                onInspectVariable,
                onToggleNode
              })}
            </th>
          ))}
          {rowIndex === 0 && sumColumnIndex >= 0 ? (
            <th
              rowSpan={cornerRowSpan}
              scope="col"
              className={
                accountColumnLayout
                  ? "notebook-matrix-sum-column notebook-matrix-ale-column"
                  : "notebook-matrix-sum-column"
              }
            >
              {sumColumnHeaderLabel}
            </th>
          ) : null}
        </tr>
      ))}
    </>
  );
}

function renderHeaderCell({
  cell,
  columns,
  collapsedNodeIds,
  editorLinked,
  onInspectVariable,
  onToggleNode
}: {
  cell: MatrixColumnHeaderCell;
  columns: string[];
  collapsedNodeIds: ReadonlySet<string>;
  editorLinked: boolean;
  onInspectVariable?(variableName: string): void;
  onToggleNode(nodeId: string): void;
}): JSX.Element | string {
  if (cell.isCollapsedStub || cell.isExpandable) {
    const isCollapsed = cell.isCollapsedStub || collapsedNodeIds.has(cell.nodeId);
    return (
      <button
        type="button"
        className={
          cell.isCollapsedStub
            ? "notebook-matrix-tree-toggle notebook-matrix-tree-collapsed-stub-toggle"
            : "notebook-matrix-tree-toggle"
        }
        aria-expanded={!isCollapsed}
        onClick={() => onToggleNode(cell.nodeId)}
        title={isCollapsed ? `Expand ${cell.label}` : `Collapse ${cell.label}`}
      >
        <span className="notebook-matrix-tree-toggle-icon" aria-hidden="true">
          {isCollapsed ? "▸" : "▾"}
        </span>
        <span>{cell.label}</span>
      </button>
    );
  }

  if (cell.isLeaf) {
    const inspectName = cell.inspectVariable?.trim() || (cell.columnIndex != null ? columns[cell.columnIndex] ?? cell.label : cell.label).trim();
    const displayLabel = cell.label;
    const titleLabel = cell.fullLabel ?? cell.label;
    const variableSymbol = cell.variableSymbol?.trim();
    const isHidden = cell.isLeafHidden === true;
    const badgeButton = cell.stockRole ? (
      <button
        type="button"
        className={`notebook-godley-role notebook-godley-role-${cell.stockRole} notebook-matrix-tree-badge-toggle`}
        aria-expanded={!isHidden}
        aria-label={`${isHidden ? "Show" : "Hide"} ${formatStockRoleTitle(cell.stockRole)} column ${titleLabel}`}
        title={`${isHidden ? "Show" : "Hide"} ${titleLabel}`}
        onClick={() => onToggleNode(cell.nodeId)}
      >
        {formatStockRoleLabel(cell.stockRole)}
      </button>
    ) : null;

    if (isHidden) {
      return <span className="notebook-matrix-tree-leaf-header notebook-matrix-tree-leaf-header-hidden">{badgeButton}</span>;
    }

    const stackedLabel = (
      <span className="notebook-matrix-tree-leaf-label-stack">
        <span className="notebook-matrix-tree-leaf-label">{displayLabel}</span>
        {variableSymbol ? (
          <span className="notebook-matrix-tree-leaf-variable">{variableSymbol}</span>
        ) : null}
      </span>
    );

    const labelContent = (
      <>
        {badgeButton}
        {editorLinked && onInspectVariable && inspectName ? (
          <button
            type="button"
            className="result-variable-button notebook-matrix-tree-leaf-label-button"
            title={titleLabel}
            onClick={() => onInspectVariable(inspectName)}
          >
            {stackedLabel}
          </button>
        ) : (
          stackedLabel
        )}
      </>
    );

    return (
      <span className="notebook-matrix-tree-leaf-header notebook-matrix-tree-leaf-header-stacked" title={titleLabel}>
        {labelContent}
      </span>
    );
  }

  return cell.label;
}

export function collectMatrixAccountLayoutCollapseKeys(
  cell: Pick<MatrixCell, "columnTree" | "sectors" | "columnBadges">
): string[] {
  if (usesMatrixAccountColumnLayout(cell.columnBadges)) {
    return collectMatrixAccountSectorCollapseKeys(cell.sectors);
  }
  if (!cell.columnTree) {
    return [];
  }
  const ids: string[] = [];
  for (const node of cell.columnTree) {
    ids.push(node.id);
  }
  return ids;
}
