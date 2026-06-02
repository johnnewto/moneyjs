import { useMemo, type JSX, type MouseEvent as ReactMouseEvent } from "react";

import {
  buildMatrixAccountColumnDisplaySlots,
  buildMatrixAccountColumnHeaderRows,
  buildMatrixColumnDisplaySlots,
  buildMatrixColumnHeaderRows,
  collectMatrixAccountSectorCollapseKeys,
  resolveMatrixAccountColumnCellClasses,
  type MatrixColumnDisplaySlot,
  type MatrixColumnHeaderCell,
  usesMatrixAccountColumnLayout,
  usesMatrixSectorColumnLayout
} from "@sfcr/notebook-core";
import type { MatrixCell } from "../types";

import {
  formatStockRoleLabel,
  formatStockRoleTitle
} from "../matrixSemantics";
import type { MatrixGraphSliceHighlight } from "../graphDocumentHighlight";
import { matrixSliceHeaderClassName } from "../graphDocumentHighlight";

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

    if (
      usesMatrixSectorColumnLayout(cell.columns, cell.sectors, cell.columnBadges, cell.columnTree)
    ) {
      return {
        displaySlots: buildMatrixAccountColumnDisplaySlots(
          cell.columns,
          cell.sectors,
          [],
          collapsedNodeIds,
          { perColumnCollapse: false }
        ),
        headerRows: buildMatrixAccountColumnHeaderRows(
          cell.columns,
          cell.sectors,
          [],
          cell.variables,
          collapsedNodeIds,
          { perColumnCollapse: false }
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
  sectors,
  columnBadges,
  sumColumnIndex,
  collapsedNodeIds,
  editorLinked,
  accountColumnLayout = false,
  sectorGroupedColumns = accountColumnLayout,
  onToggleNode,
  graphLinked = false,
  graphSliceHighlight = null,
  matrixCellId,
  onColumnLabelClick,
  onInspectVariable
}: {
  headerRows: MatrixColumnHeaderCell[][];
  columns: string[];
  sectors?: string[];
  columnBadges?: string[];
  sumColumnIndex: number;
  collapsedNodeIds: ReadonlySet<string>;
  editorLinked: boolean;
  accountColumnLayout?: boolean;
  sectorGroupedColumns?: boolean;
  onToggleNode(nodeId: string): void;
  graphLinked?: boolean;
  graphSliceHighlight?: MatrixGraphSliceHighlight | null;
  matrixCellId: string;
  onColumnLabelClick?(
    event: ReactMouseEvent<HTMLElement>,
    columnIndex: number,
    inspectVariableName: string
  ): void;
  onInspectVariable?(variableName: string): void;
}): JSX.Element {
  const cornerRowSpan = Math.max(headerRows.length, 1);
  const cornerLabel = accountColumnLayout ? "Flow / account" : "Transaction";
  const sumColumnHeaderLabel = sumColumnIndex >= 0 ? columns[sumColumnIndex] : "";

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
                sectorGroupedColumns && rowIndex === 0 && cell.isSectorStart
                  ? "notebook-matrix-sector-start"
                  : undefined,
                ...(accountColumnLayout && cell.columnIndex != null && !cell.isCollapsedStub
                  ? resolveMatrixAccountColumnCellClasses(
                      columns,
                      sectors,
                      columnBadges,
                      cell.columnIndex,
                      sumColumnIndex
                    )
                  : []),
                cell.isLeaf && cell.columnIndex === sumColumnIndex ? "notebook-matrix-sum-column" : undefined,
                cell.columnIndex != null
                  ? matrixSliceHeaderClassName(matrixCellId, "column", cell.columnIndex, graphSliceHighlight)
                  : undefined
              ]
                .filter(Boolean)
                .join(" ") || undefined}
            >
              {renderHeaderCell({
                cell,
                columns,
                collapsedNodeIds,
                editorLinked,
                graphLinked,
                accountColumnLayout,
                onColumnLabelClick,
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
                [
                  "notebook-matrix-sum-column",
                  matrixSliceHeaderClassName(matrixCellId, "column", sumColumnIndex, graphSliceHighlight)
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
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
  graphLinked,
  accountColumnLayout,
  onColumnLabelClick,
  onInspectVariable,
  onToggleNode
}: {
  cell: MatrixColumnHeaderCell;
  columns: string[];
  collapsedNodeIds: ReadonlySet<string>;
  editorLinked: boolean;
  graphLinked: boolean;
  accountColumnLayout: boolean;
  onColumnLabelClick?(
    event: ReactMouseEvent<HTMLElement>,
    columnIndex: number,
    inspectVariableName: string
  ): void;
  onInspectVariable?(variableName: string): void;
  onToggleNode(nodeId: string): void;
}): JSX.Element | string {
  if (cell.isCollapsedStub || cell.isExpandable) {
    const isCollapsed = cell.isCollapsedStub || collapsedNodeIds.has(cell.nodeId);
    const titleLabel =
      accountColumnLayout && cell.fullLabel?.trim()
        ? cell.fullLabel.trim()
        : (cell.fullLabel ?? cell.label);
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
        title={isCollapsed ? `Expand ${titleLabel}` : `Collapse ${titleLabel}`}
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
    const titleLabel = cell.fullLabel?.trim() || cell.label.trim();
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

    const showVariableSymbolLine = Boolean(variableSymbol) && !accountColumnLayout;
    const labelNode = showVariableSymbolLine ? (
      <span className="notebook-matrix-tree-leaf-label-stack">
        <span className="notebook-matrix-tree-leaf-label">{displayLabel}</span>
        <span className="notebook-matrix-tree-leaf-variable">{variableSymbol}</span>
      </span>
    ) : (
      <span className="notebook-matrix-tree-leaf-label">{displayLabel}</span>
    );

    const labelContent = (
      <>
        {badgeButton}
        {(graphLinked || editorLinked) && cell.columnIndex != null && inspectName ? (
          <button
            type="button"
            className="result-variable-button notebook-matrix-tree-leaf-label-button notebook-matrix-slice-label-button"
            title={
              graphLinked
                ? `Graph column ${titleLabel}. Ctrl+click to inspect.`
                : titleLabel
            }
            onClick={(event) => {
              if (onColumnLabelClick) {
                onColumnLabelClick(event, cell.columnIndex!, inspectName);
                return;
              }
              onInspectVariable?.(inspectName);
            }}
          >
            {labelNode}
          </button>
        ) : (
          labelNode
        )}
      </>
    );

    const headerClassName = [
      "notebook-matrix-tree-leaf-header",
      showVariableSymbolLine ? "notebook-matrix-tree-leaf-header-stacked" : undefined
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span className={headerClassName} title={titleLabel}>
        {labelContent}
      </span>
    );
  }

  return cell.label;
}

export function collectMatrixAccountLayoutCollapseKeys(
  cell: Pick<MatrixCell, "columns" | "columnTree" | "sectors" | "columnBadges">
): string[] {
  if (usesMatrixAccountColumnLayout(cell.columnBadges)) {
    return collectMatrixAccountSectorCollapseKeys(cell.sectors);
  }
  if (
    usesMatrixSectorColumnLayout(cell.columns, cell.sectors, cell.columnBadges, cell.columnTree)
  ) {
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
