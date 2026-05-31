import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from "react";

import { evaluateExpression, parseExpression, type SimulationResult } from "@sfcr/core";
import {
  computeMatrixAccountRowTotal,
  resolveMatrixAccountColumnCellClasses,
  type MatrixColumnDisplaySlot,
  usesMatrixAccountColumnLayout
} from "@sfcr/notebook-core";

import type { MatrixEntryDisplayMode } from "../matrixEntryDisplay";

import { HighlightedFormulaInput, highlightFormula } from "../../components/EquationGridEditor";
import { NumericValueText } from "../../components/NumericValueText";
import { VariableLabel } from "../../components/VariableLabel";
import type { EditorState } from "../../lib/editorModel";
import { buildVariableUnitMetadata, inferUnits } from "../../lib/units";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import { useDragScroll } from "../../hooks/useDragScroll";
import {
  classifyMatrixStockRole,
  formatStockRoleLabel,
  formatStockRoleTitle,
  resolveMatrixTableKind
} from "../matrixSemantics";
import { resolveInspectorModelSource, type VariableInspectRequest } from "../../lib/variableInspect";
import { documentHighlightClassName } from "../../lib/variableHighlight";
import { buildEditorStateForNotebookModel } from "../modelSections";
import { NotebookRenderProfiler } from "../notebookProfiler";
import { evaluateMatrixEntryNumber,
  isAccountTransactionsMatrix,
  isEditableAccountSumRowCell,
  resolveAccountSumRowCellBalance
} from "../matrixAccountSumRow";
import { resolveAccountingMatrixKind } from "../validation";
import { useMatrixEntryEdit, type MatrixEditingTarget } from "../useMatrixEntryEdit";
import type { MatrixCell, NotebookCell, RunCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";
import { VariableRenameDialog } from "./EquationRowInlineEditor";
import { useMatrixColumnCollapseState } from "../matrixColumnCollapseStorage";
import { MatrixColumnTreeHeader, useMatrixColumnLayout } from "./MatrixColumnTreeHeader";

const EMPTY_PARAMETER_NAMES = new Set<string>();
const MATRIX_VIRTUALIZATION_ROW_THRESHOLD = 20;
const MATRIX_VIRTUALIZATION_ROW_HEIGHT_PX = 44;
const MATRIX_VIRTUALIZATION_HEADER_HEIGHT_PX = 44;
const MATRIX_VIRTUALIZATION_VIEWPORT_HEIGHT_PX = 480;
const MATRIX_VIRTUALIZATION_OVERSCAN_ROWS = 4;
const MATRIX_VARIABLE_INSPECT_DELAY_MS = 400;

const MATRIX_CELL_DOUBLE_CLICK_IGNORE_SELECTOR =
  "button, .result-variable-button, .formula-token.is-clickable, .notebook-matrix-tree-badge-toggle";

function matrixCellDoubleClickShouldOpenEdit(event: ReactMouseEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element)) {
    return true;
  }
  return target.closest(MATRIX_CELL_DOUBLE_CLICK_IGNORE_SELECTOR) == null;
}

export function MatrixCellView({
  cell,
  cells,
  entryDisplayMode = "both",
  notebookScopeId,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata,
  onCellChange,
  onReplaceCells,
  onVariableInspectRequest,
  highlightedVariable = null
}: {
  cell: MatrixCell;
  cells: NotebookCell[];
  entryDisplayMode?: MatrixEntryDisplayMode;
  notebookScopeId: string;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  highlightedVariable?: string | null;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  onVariableInspectRequest(args: VariableInspectRequest): void;
}) {
  const matrixDragScroll = useDragScroll<HTMLDivElement>();
  const matrixHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const variableInspectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [matrixScrollTop, setMatrixScrollTop] = useState(0);
  const {
    collapsedNodeIds: collapsedColumnTreeNodeIds,
    toggleColumnTreeNode,
    expandAllColumnTreeNodes,
    collapseAllColumnTreeNodes
  } = useMatrixColumnCollapseState(notebookScopeId, cell);
  const columnLayout = useMatrixColumnLayout(cell, collapsedColumnTreeNodeIds);
  const displaySlots = columnLayout.displaySlots;
  const usesColumnTree = columnLayout.usesColumnTree;
  const accountColumnLayout = usesMatrixAccountColumnLayout(cell.columnBadges);
  const result = cell.sourceRunCellId ? runner.getResult(cell.sourceRunCellId) : null;
  const editor = cell.sourceRunCellId ? resolveEditorStateForRunCellId(cells, cell.sourceRunCellId) : null;
  const currentValues = result
    ? Object.fromEntries(
        Object.entries(result.series).map(([name, values]) => [
          name,
          values[Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0))]
        ])
      )
    : {};
  const evaluatedMatrix = useMemo(
    () => buildEvaluatedMatrix(cell, result, selectedPeriodIndex),
    [cell, result, selectedPeriodIndex]
  );
  const matrixKind = useMemo(() => resolveMatrixTableKind(cell), [cell]);
  const sumRowIndex = cell.rows.findIndex((row) => row.label.trim().toLowerCase() === "sum");
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  const renderedBodyColumnCount = usesColumnTree
    ? displaySlots.length + (sumColumnIndex >= 0 ? 1 : 0)
    : cell.columns.length;
  const parameterNames = useMemo(() => {
    if (!editor) {
      return EMPTY_PARAMETER_NAMES;
    }

    return new Set(editor.externals.map((external) => external.name.trim()).filter(Boolean));
  }, [editor]);
  const isVirtualizedMatrix =
    cell.id === "transaction-flow" &&
    evaluatedMatrix.rows.length > MATRIX_VIRTUALIZATION_ROW_THRESHOLD;
  const [rowContextMenu, setRowContextMenu] = useState<{ rowIndex: number; x: number; y: number } | null>(
    null
  );
  const [columnContextMenu, setColumnContextMenu] = useState<{ columnIndex: number; x: number; y: number } | null>(
    null
  );
  const [pendingDeleteRowIndex, setPendingDeleteRowIndex] = useState<number | null>(null);
  const [pendingDeleteColumnIndex, setPendingDeleteColumnIndex] = useState<number | null>(null);
  const rowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const columnContextMenuRef = useRef<HTMLDivElement | null>(null);
  const sourceRunCell = cell.sourceRunCellId
    ? cells.find((entry): entry is RunCell => entry.type === "run" && entry.id === cell.sourceRunCellId)
    : null;
  const modelSource = sourceRunCell ? resolveInspectorModelSource(sourceRunCell) : null;
  const inspectContextRef = useRef({
    currentValues,
    editor,
    modelSource,
    variableDescriptions,
    variableUnitMetadata
  });

  useEffect(() => {
    inspectContextRef.current = {
      currentValues,
      editor,
      modelSource,
      variableDescriptions,
      variableUnitMetadata
    };
  }, [currentValues, editor, modelSource, variableDescriptions, variableUnitMetadata]);

  const closeContextMenus = useCallback(() => {
    setRowContextMenu(null);
    setColumnContextMenu(null);
  }, []);

  useEffect(() => {
    if (rowContextMenu && rowContextMenuRef.current) {
      rowContextMenuRef.current.style.left = `${rowContextMenu.x}px`;
      rowContextMenuRef.current.style.top = `${rowContextMenu.y}px`;
    }
    if (columnContextMenu && columnContextMenuRef.current) {
      columnContextMenuRef.current.style.left = `${columnContextMenu.x}px`;
      columnContextMenuRef.current.style.top = `${columnContextMenu.y}px`;
    }

    if (rowContextMenu == null && columnContextMenu == null) {
      return;
    }

    function handlePointerDown(): void {
      closeContextMenus();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeContextMenus();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContextMenus, columnContextMenu, rowContextMenu]);

  const applyMatrixUpdate = useCallback(
    (updater: (current: MatrixCell) => MatrixCell) => {
      onCellChange(cell.id, (current) => (current.type === "matrix" ? updater(current) : current));
    },
    [cell.id, onCellChange]
  );

  const handleMatrixRowContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, rowIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      setColumnContextMenu(null);
      setRowContextMenu({ rowIndex, x: event.clientX, y: event.clientY });
    },
    []
  );

  const handleMatrixColumnContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, columnIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      setRowContextMenu(null);
      setColumnContextMenu({ columnIndex, x: event.clientX, y: event.clientY });
    },
    []
  );

  const sumRowIndexInCell = cell.rows.findIndex((row) => row.label.trim().toLowerCase() === "sum");
  const sumColumnIndexInCell = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");

  const canMoveMatrixRowUp = (rowIndex: number) =>
    rowIndex > 0 && rowIndex < cell.rows.length && rowIndex !== sumRowIndexInCell;
  const canMoveMatrixRowDown = (rowIndex: number) =>
    rowIndex >= 0 &&
    rowIndex < cell.rows.length - 1 &&
    rowIndex !== sumRowIndexInCell;
  const canDeleteMatrixRow = (rowIndex: number) =>
    cell.rows.length > 1 && rowIndex >= 0 && rowIndex < cell.rows.length && rowIndex !== sumRowIndexInCell;

  const canMoveMatrixColumnLeft = (columnIndex: number) =>
    columnIndex > 0 && columnIndex < cell.columns.length && columnIndex !== sumColumnIndexInCell;
  const canMoveMatrixColumnRight = (columnIndex: number) =>
    columnIndex >= 0 &&
    columnIndex < cell.columns.length - 1 &&
    columnIndex !== sumColumnIndexInCell;
  const canDeleteMatrixColumn = (columnIndex: number) =>
    cell.columns.length > 1 &&
    columnIndex >= 0 &&
    columnIndex < cell.columns.length &&
    columnIndex !== sumColumnIndexInCell;

  const clearDeferredVariableInspect = useCallback(() => {
    if (variableInspectTimeoutRef.current != null) {
      clearTimeout(variableInspectTimeoutRef.current);
      variableInspectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearDeferredVariableInspect(), [clearDeferredVariableInspect]);

  const handleInspectVariable = useCallback(
    (selectedVariable: string) => {
      const context = inspectContextRef.current;
      if (!context.editor) {
        return;
      }

      onVariableInspectRequest({
        currentValues: context.currentValues,
        editor: context.editor,
        modelSource: context.modelSource,
        selectedVariable,
        variableDescriptions: context.variableDescriptions,
        variableUnitMetadata: context.variableUnitMetadata
      });
    },
    [onVariableInspectRequest]
  );

  const scheduleInspectVariable = useCallback(
    (selectedVariable: string) => {
      clearDeferredVariableInspect();
      variableInspectTimeoutRef.current = setTimeout(() => {
        variableInspectTimeoutRef.current = null;
        handleInspectVariable(selectedVariable);
      }, MATRIX_VARIABLE_INSPECT_DELAY_MS);
    },
    [clearDeferredVariableInspect, handleInspectVariable]
  );

  const sourceSelectVariable = editor ? scheduleInspectVariable : undefined;

  const matrixEntryEdit = useMatrixEntryEdit({
    cell,
    cells,
    modelSource,
    onCellChange,
    onReplaceCells
  });

  const cancelMatrixEntryEdit = useCallback(() => {
    clearDeferredVariableInspect();
    matrixEntryEdit.cancelEntryEdit();
  }, [clearDeferredVariableInspect, matrixEntryEdit]);

  const beginMatrixEntryEdit = useCallback(
    (rowIndex: number, columnIndex: number, source: string) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }
      if (
        rowIndex === sumRowIndex &&
        !isEditableAccountSumRowCell(cell, rowIndex, columnIndex, sumRowIndex, sumColumnIndex)
      ) {
        return;
      }

      clearDeferredVariableInspect();
      matrixEntryEdit.beginEntryEdit(rowIndex, columnIndex, source);
    },
    [cell, clearDeferredVariableInspect, matrixEntryEdit, sumColumnIndex, sumRowIndex]
  );

  useEffect(() => {
    if (!matrixEntryEdit.editingTarget) {
      return;
    }

    const row = cell.rows[matrixEntryEdit.editingTarget.rowIndex];
    if (!row) {
      cancelMatrixEntryEdit();
    }
  }, [cancelMatrixEntryEdit, cell.rows, matrixEntryEdit.editingTarget]);
  const virtualizedMatrixWindow = useMemo(() => {
    if (!isVirtualizedMatrix) {
      return {
        bottomSpacerHeight: 0,
        endIndex: evaluatedMatrix.rows.length,
        startIndex: 0,
        topSpacerHeight: 0
      };
    }

    const visibleCount = Math.ceil(
      MATRIX_VIRTUALIZATION_VIEWPORT_HEIGHT_PX / MATRIX_VIRTUALIZATION_ROW_HEIGHT_PX
    );
    const bodyScrollTop = Math.max(0, matrixScrollTop - MATRIX_VIRTUALIZATION_HEADER_HEIGHT_PX);
    const unclampedStartIndex =
      Math.floor(bodyScrollTop / MATRIX_VIRTUALIZATION_ROW_HEIGHT_PX) -
      MATRIX_VIRTUALIZATION_OVERSCAN_ROWS;
    const startIndex = Math.max(0, unclampedStartIndex);
    const endIndex = Math.min(
      evaluatedMatrix.rows.length,
      startIndex + visibleCount + MATRIX_VIRTUALIZATION_OVERSCAN_ROWS * 2
    );

    return {
      bottomSpacerHeight:
        (evaluatedMatrix.rows.length - endIndex) * MATRIX_VIRTUALIZATION_ROW_HEIGHT_PX,
      endIndex,
      startIndex,
      topSpacerHeight: startIndex * MATRIX_VIRTUALIZATION_ROW_HEIGHT_PX
    };
  }, [evaluatedMatrix.rows.length, isVirtualizedMatrix, matrixScrollTop]);
  const renderedMatrixRows = useMemo(
    () => evaluatedMatrix.rows.slice(virtualizedMatrixWindow.startIndex, virtualizedMatrixWindow.endIndex),
    [evaluatedMatrix.rows, virtualizedMatrixWindow.endIndex, virtualizedMatrixWindow.startIndex]
  );
  const matrixColumnGroup = useMemo(
    () => (
      <colgroup>
        <col className="notebook-matrix-row-header-col" />
        {(usesColumnTree
          ? displaySlots.map((slot, slotIndex) => ({ slot, slotIndex }))
          : cell.columns.map((_, columnIndex) => ({ slot: { kind: "leaf" as const, columnIndex }, slotIndex: columnIndex }))
        ).map(({ slot, slotIndex }) => (
          <col
            key={
              slot.kind === "collapsed"
                ? `collapsed-${slot.nodeId}`
                : slot.kind === "hiddenLeaf"
                  ? `hidden-${slot.nodeId}`
                  : `${cell.columns[slot.columnIndex] ?? slot.columnIndex}-${slot.columnIndex}`
            }
            className={
              slot.kind === "collapsed"
                ? "notebook-matrix-collapsed-stub-col"
                : slot.kind === "hiddenLeaf"
                  ? "notebook-matrix-hidden-leaf-col"
                  : slot.kind === "leaf" && slot.columnIndex === sumColumnIndex
                    ? "notebook-matrix-value-col notebook-matrix-value-col-sum"
                    : "notebook-matrix-value-col"
            }
          />
        ))}
        {usesColumnTree && sumColumnIndex >= 0 ? (
          <col className="notebook-matrix-value-col notebook-matrix-value-col-sum" />
        ) : null}
      </colgroup>
    ),
    [cell.columns, displaySlots, sumColumnIndex, usesColumnTree]
  );
  const matrixHeaderRow = usesColumnTree ? (
    <MatrixColumnTreeHeader
      headerRows={columnLayout.headerRows}
      columns={cell.columns}
      sectors={cell.sectors}
      columnBadges={cell.columnBadges}
      sumColumnIndex={sumColumnIndex}
      collapsedNodeIds={collapsedColumnTreeNodeIds}
      editorLinked={editor != null}
      accountColumnLayout={accountColumnLayout}
      onToggleNode={toggleColumnTreeNode}
      onInspectVariable={editor ? handleInspectVariable : undefined}
    />
  ) : (
    <tr>
      <th scope="col">
        {accountColumnLayout
          ? "Flow / account"
          : matrixKind === "stocks"
            ? "Asset / Liability"
            : matrixKind === "flows"
              ? "Transaction"
              : null}
      </th>
      {cell.columns.map((column, columnIndex) => (
        <th
          key={column}
          scope="col"
          className={columnIndex === sumColumnIndex ? "notebook-matrix-sum-column" : undefined}
          onContextMenu={(event) => handleMatrixColumnContextMenu(event, columnIndex)}
        >
          {editor ? (
            <button
              type="button"
              className={documentHighlightClassName(column, highlightedVariable, "result-variable-button")}
              onClick={() => handleInspectVariable(column)}
            >
              <VariableLabel
                currentValues={currentValues}
                name={column}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            </button>
          ) : (
            <VariableLabel
              currentValues={currentValues}
              name={column}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
          )}
        </th>
      ))}
    </tr>
  );
  const matrixBodyRows = (
    <>
      {virtualizedMatrixWindow.topSpacerHeight > 0 ? (
        <tr aria-hidden="true" className="notebook-matrix-virtual-spacer-row">
          <td
            colSpan={renderedBodyColumnCount + 1}
            style={{ height: `${virtualizedMatrixWindow.topSpacerHeight}px` }}
          />
        </tr>
      ) : null}
      {renderedMatrixRows.map((row, visibleRowIndex) => {
        const rowIndex = virtualizedMatrixWindow.startIndex + visibleRowIndex;

        return (
          <tr
            key={row.label}
            className={
              [
                accountColumnLayout && rowIndex === 0 && !row.isSumRow
                  ? "notebook-matrix-flow-start-row"
                  : undefined,
                row.isSumRow ? "notebook-matrix-sum-row" : undefined,
                row.isSumRow && !row.isBalanced ? "matrix-balance-error" : undefined
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            <th scope="row" onContextMenu={(event) => handleMatrixRowContextMenu(event, rowIndex)}>
              <NotebookRenderProfiler
                id="MatrixTableRowLabel"
                metadata={{
                  cellId: cell.id,
                  rowLabel: row.label,
                  selectedPeriodIndex
                }}
              >
                <VariableLabel
                  name={row.label}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                />
              </NotebookRenderProfiler>
            </th>
            {renderMatrixRowDataCells({
              accountColumnLayout,
              cell,
              displaySlots,
              entryDisplayMode,
              highlightedVariable,
              matrixEntryEdit,
              matrixKind,
              onBeginEdit: beginMatrixEntryEdit,
              onCancelEdit: cancelMatrixEntryEdit,
              parameterNames,
              row,
              rowIndex,
              selectedPeriodIndex,
              sourceSelectVariable,
              sumColumnIndex,
              sumRowIndex,
              usesColumnTree,
              variableDescriptions,
              variableUnitMetadata,
              currentValues,
              onColumnContextMenu: handleMatrixColumnContextMenu
            })}
          </tr>
        );
      })}
      {virtualizedMatrixWindow.bottomSpacerHeight > 0 ? (
        <tr aria-hidden="true" className="notebook-matrix-virtual-spacer-row">
          <td
            colSpan={renderedBodyColumnCount + 1}
            style={{ height: `${virtualizedMatrixWindow.bottomSpacerHeight}px` }}
          />
        </tr>
      ) : null}
    </>
  );

  return (
    <NotebookRenderProfiler
      id="MatrixCellBody"
      metadata={{
        cellId: cell.id,
        cellType: cell.type,
        columnCount: cell.columns.length,
        rowCount: evaluatedMatrix.rows.length,
        selectedPeriodIndex
      }}
    >
      <div className="notebook-matrix">
        {usesColumnTree ? (
          <div className="notebook-matrix-tree-controls">
            <button type="button" className="secondary-button" onClick={expandAllColumnTreeNodes}>
              Expand all
            </button>
            <button type="button" className="secondary-button" onClick={collapseAllColumnTreeNodes}>
              Collapse all
            </button>
          </div>
        ) : null}
        <NotebookRenderProfiler
          id="MatrixCellTable"
          metadata={{
            cellId: cell.id,
            cellType: cell.type,
            columnCount: cell.columns.length,
            rowCount: evaluatedMatrix.rows.length,
            selectedPeriodIndex
          }}
        >
          <div
            className={
              isVirtualizedMatrix ? "notebook-matrix-shell notebook-matrix-shell-virtualized" : undefined
            }
          >
            {isVirtualizedMatrix ? (
              <p className="notebook-matrix-scroll-hint">Scroll within the table to inspect all rows.</p>
            ) : null}
            {isVirtualizedMatrix ? (
              <NotebookRenderProfiler
                id="MatrixTableHeader"
                metadata={{
                  cellId: cell.id,
                  columnCount: cell.columns.length,
                  rowCount: evaluatedMatrix.rows.length,
                  selectedPeriodIndex
                }}
              >
                <div
                  ref={matrixHeaderScrollRef}
                  className="notebook-oversize-scroll notebook-matrix-wrap notebook-matrix-wrap-virtualized-header"
                  data-drag-scroll-ignore="true"
                >
                  <table
                    className={[
                      "notebook-matrix-table",
                      "notebook-matrix-table-virtualized",
                      accountColumnLayout ? "notebook-matrix-table-account-columns" : undefined
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {matrixColumnGroup}
                    <thead>{matrixHeaderRow}</thead>
                  </table>
                </div>
              </NotebookRenderProfiler>
            ) : null}
            <div
              ref={(node) => {
                matrixDragScroll.dragScrollRef.current = node;
              }}
              data-drag-scroll-ignore="true"
              className={[
                "notebook-matrix-wrap",
                "notebook-oversize-scroll",
                matrixDragScroll.dragScrollProps.className,
                isVirtualizedMatrix ? "notebook-matrix-wrap-virtualized-body" : undefined
              ]
                .filter(Boolean)
                .join(" ")}
              onClickCapture={matrixDragScroll.dragScrollProps.onClickCapture}
              onMouseDown={matrixDragScroll.dragScrollProps.onMouseDown}
              onScroll={(event) => {
                if (isVirtualizedMatrix) {
                  setMatrixScrollTop(event.currentTarget.scrollTop);
                  if (matrixHeaderScrollRef.current) {
                    matrixHeaderScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
                  }
                }
              }}
            >
              <table
                className={[
                  "notebook-matrix-table",
                  isVirtualizedMatrix ? "notebook-matrix-table-virtualized" : undefined,
                  accountColumnLayout ? "notebook-matrix-table-account-columns" : undefined
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {matrixColumnGroup}
                {!isVirtualizedMatrix ? (
                  <NotebookRenderProfiler
                    id="MatrixTableHeader"
                    metadata={{
                      cellId: cell.id,
                      columnCount: cell.columns.length,
                      rowCount: evaluatedMatrix.rows.length,
                      selectedPeriodIndex
                    }}
                  >
                    <thead>{matrixHeaderRow}</thead>
                  </NotebookRenderProfiler>
                ) : null}
                <NotebookRenderProfiler
                  id="MatrixTableBody"
                  metadata={{
                    cellId: cell.id,
                    columnCount: cell.columns.length,
                    rowCount: evaluatedMatrix.rows.length,
                    visibleRowCount: renderedMatrixRows.length,
                    selectedPeriodIndex
                  }}
                >
                  <tbody>{matrixBodyRows}</tbody>
                </NotebookRenderProfiler>
              </table>
            </div>
          </div>
        </NotebookRenderProfiler>
      </div>
      {rowContextMenu ? (
        <div
          ref={rowContextMenuRef}
          className="notebook-cell-context-menu"
          role="menu"
          aria-label={`Matrix row actions for row ${rowContextMenu.rowIndex + 1}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              applyMatrixUpdate((current) => ({
                ...current,
                rows: insertMatrixRowBelow(current.rows, rowContextMenu.rowIndex, current.columns.length)
              }));
              closeContextMenus();
            }}
          >
            Add row
          </button>
          <div className="notebook-cell-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!canMoveMatrixRowUp(rowContextMenu.rowIndex)}
            onClick={() => {
              applyMatrixUpdate((current) => ({
                ...current,
                rows: moveMatrixRow(current.rows, rowContextMenu.rowIndex, -1)
              }));
              closeContextMenus();
            }}
          >
            Move up
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMoveMatrixRowDown(rowContextMenu.rowIndex)}
            onClick={() => {
              applyMatrixUpdate((current) => ({
                ...current,
                rows: moveMatrixRow(current.rows, rowContextMenu.rowIndex, 1)
              }));
              closeContextMenus();
            }}
          >
            Move down
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={!canDeleteMatrixRow(rowContextMenu.rowIndex)}
            onClick={() => {
              setPendingDeleteRowIndex(rowContextMenu.rowIndex);
              closeContextMenus();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      {columnContextMenu ? (
        <div
          ref={columnContextMenuRef}
          className="notebook-cell-context-menu"
          role="menu"
          aria-label={`Matrix column actions for column ${columnContextMenu.columnIndex + 1}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              applyMatrixUpdate((current) =>
                insertMatrixColumnRight(current, columnContextMenu.columnIndex)
              );
              closeContextMenus();
            }}
          >
            Add column
          </button>
          <div className="notebook-cell-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!canMoveMatrixColumnLeft(columnContextMenu.columnIndex)}
            onClick={() => {
              applyMatrixUpdate((current) =>
                moveMatrixColumn(current, columnContextMenu.columnIndex, -1)
              );
              closeContextMenus();
            }}
          >
            Move left
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMoveMatrixColumnRight(columnContextMenu.columnIndex)}
            onClick={() => {
              applyMatrixUpdate((current) =>
                moveMatrixColumn(current, columnContextMenu.columnIndex, 1)
              );
              closeContextMenus();
            }}
          >
            Move right
          </button>
          <button
            type="button"
            role="menuitem"
            className="is-danger"
            disabled={!canDeleteMatrixColumn(columnContextMenu.columnIndex)}
            onClick={() => {
              setPendingDeleteColumnIndex(columnContextMenu.columnIndex);
              closeContextMenus();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      {pendingDeleteRowIndex != null ? (
        <div className="notebook-cell-delete-dialog-backdrop" onClick={() => setPendingDeleteRowIndex(null)}>
          <div
            className="notebook-cell-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete matrix row ${cell.rows[pendingDeleteRowIndex]?.label.trim() || pendingDeleteRowIndex + 1}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Delete matrix row?</h3>
            <p>
              Delete{" "}
              <strong>
                {cell.rows[pendingDeleteRowIndex]?.label.trim() || `Row ${pendingDeleteRowIndex + 1}`}
              </strong>{" "}
              from this matrix?
            </p>
            <div className="notebook-cell-delete-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingDeleteRowIndex(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  applyMatrixUpdate((current) => ({
                    ...current,
                    rows: removeMatrixRow(current.rows, pendingDeleteRowIndex)
                  }));
                  setPendingDeleteRowIndex(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeleteColumnIndex != null ? (
        <div className="notebook-cell-delete-dialog-backdrop" onClick={() => setPendingDeleteColumnIndex(null)}>
          <div
            className="notebook-cell-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete matrix column ${cell.columns[pendingDeleteColumnIndex]?.trim() || pendingDeleteColumnIndex + 1}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Delete matrix column?</h3>
            <p>
              Delete{" "}
              <strong>
                {cell.columns[pendingDeleteColumnIndex]?.trim() ||
                  `Column ${pendingDeleteColumnIndex + 1}`}
              </strong>{" "}
              from this matrix?
            </p>
            <div className="notebook-cell-delete-dialog-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingDeleteColumnIndex(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => {
                  applyMatrixUpdate((current) => removeMatrixColumn(current, pendingDeleteColumnIndex));
                  setPendingDeleteColumnIndex(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <VariableRenameDialog
        cellCount={matrixEntryEdit.renameReferenceCount.cellCount}
        isOpen={matrixEntryEdit.renameDialog != null}
        newName={matrixEntryEdit.renameDialog?.newName ?? ""}
        oldName={matrixEntryEdit.renameDialog?.oldName ?? ""}
        referenceCount={matrixEntryEdit.renameReferenceCount.referenceCount}
        onCancel={matrixEntryEdit.cancelEntryEdit}
        onConfirmNo={matrixEntryEdit.confirmRenameNo}
        onConfirmYes={matrixEntryEdit.confirmRenameYes}
      />
    </NotebookRenderProfiler>
  );
}

function renderMatrixRowDataCells({
  accountColumnLayout,
  cell,
  currentValues,
  displaySlots,
  entryDisplayMode,
  highlightedVariable,
  matrixEntryEdit,
  matrixKind,
  onBeginEdit,
  onCancelEdit,
  parameterNames,
  row,
  rowIndex,
  selectedPeriodIndex,
  sourceSelectVariable,
  sumColumnIndex,
  sumRowIndex,
  usesColumnTree,
  variableDescriptions,
  variableUnitMetadata,
  onColumnContextMenu
}: {
  accountColumnLayout: boolean;
  cell: MatrixCell;
  currentValues: Record<string, number | undefined>;
  displaySlots: MatrixColumnDisplaySlot[];
  entryDisplayMode: MatrixEntryDisplayMode;
  highlightedVariable?: string | null;
  matrixEntryEdit: ReturnType<typeof useMatrixEntryEdit>;
  matrixKind: ReturnType<typeof resolveMatrixTableKind>;
  onBeginEdit(rowIndex: number, columnIndex: number, source: string): void;
  onCancelEdit(): void;
  parameterNames: Set<string>;
  row: {
    entries: Array<{
      isBalanced: boolean;
      isSumCell: boolean;
      numericValue: number | null;
      resolved: string | null;
      source: string;
    }>;
    label: string;
  };
  rowIndex: number;
  selectedPeriodIndex: number;
  sourceSelectVariable?: (variableName: string) => void;
  sumColumnIndex: number;
  sumRowIndex: number;
  usesColumnTree: boolean;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onColumnContextMenu(event: ReactMouseEvent<HTMLElement>, columnIndex: number): void;
}): JSX.Element[] {
  const cells: JSX.Element[] = [];

  for (const slot of displaySlots) {
    if (slot.kind === "collapsed") {
      const collapsedLabel = slot.label.trim();
      const expandTitle = slot.fullLabel?.trim() || collapsedLabel;
      cells.push(
        <td
          key={`${row.label}-collapsed-${slot.nodeId}`}
          className={
            accountColumnLayout
              ? "notebook-matrix-tree-collapsed-stub notebook-matrix-sector-start"
              : "notebook-matrix-tree-collapsed-stub"
          }
          aria-label={`${expandTitle} collapsed`}
          title={`Expand ${expandTitle}`}
        >
          {accountColumnLayout && collapsedLabel ? collapsedLabel : "—"}
        </td>
      );
      continue;
    }

    if (slot.kind === "hiddenLeaf") {
      cells.push(
        <td
          key={`${row.label}-hidden-${slot.nodeId}`}
          className={
            [
              "notebook-matrix-tree-hidden-leaf-stub",
              ...resolveMatrixAccountColumnCellClasses(
                cell.columns,
                cell.sectors,
                cell.columnBadges,
                slot.columnIndex,
                sumColumnIndex
              )
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-label="Column hidden"
        >
          —
        </td>
      );
      continue;
    }

    cells.push(
      renderMatrixLeafDataCell({
        accountColumnLayout,
        cell,
        columnIndex: slot.columnIndex,
        currentValues,
        entryDisplayMode,
        highlightedVariable,
        matrixEntryEdit,
        matrixKind,
        onBeginEdit,
        onCancelEdit,
        parameterNames,
        row,
        rowIndex,
        selectedPeriodIndex,
        sourceSelectVariable,
        sumColumnIndex,
        sumRowIndex,
        usesColumnTree,
        variableDescriptions,
        variableUnitMetadata,
        onColumnContextMenu
      })
    );
  }

  if (usesColumnTree && sumColumnIndex >= 0) {
    cells.push(
      renderMatrixLeafDataCell({
        accountColumnLayout,
        cell,
        columnIndex: sumColumnIndex,
        currentValues,
        entryDisplayMode,
        highlightedVariable,
        matrixEntryEdit,
        matrixKind,
        onBeginEdit,
        onCancelEdit,
        parameterNames,
        row,
        rowIndex,
        selectedPeriodIndex,
        sourceSelectVariable,
        sumColumnIndex,
        sumRowIndex,
        usesColumnTree,
        variableDescriptions,
        variableUnitMetadata,
        onColumnContextMenu
      })
    );
  }

  return cells;
}

function renderMatrixLeafDataCell({
  accountColumnLayout,
  cell,
  columnIndex,
  currentValues,
  entryDisplayMode,
  highlightedVariable,
  matrixEntryEdit,
  matrixKind,
  onBeginEdit,
  onCancelEdit,
  parameterNames,
  row,
  rowIndex,
  selectedPeriodIndex,
  sourceSelectVariable,
  sumColumnIndex,
  sumRowIndex,
  usesColumnTree,
  variableDescriptions,
  variableUnitMetadata,
  onColumnContextMenu
}: {
  accountColumnLayout: boolean;
  cell: MatrixCell;
  columnIndex: number;
  currentValues: Record<string, number | undefined>;
  entryDisplayMode: MatrixEntryDisplayMode;
  highlightedVariable?: string | null;
  matrixEntryEdit: ReturnType<typeof useMatrixEntryEdit>;
  matrixKind: ReturnType<typeof resolveMatrixTableKind>;
  onBeginEdit(rowIndex: number, columnIndex: number, source: string): void;
  onCancelEdit(): void;
  parameterNames: Set<string>;
  row: {
    entries: Array<{
      isBalanced: boolean;
      isSumCell: boolean;
      numericValue: number | null;
      resolved: string | null;
      source: string;
    }>;
    label: string;
  };
  rowIndex: number;
  selectedPeriodIndex: number;
  sourceSelectVariable?: (variableName: string) => void;
  sumColumnIndex: number;
  sumRowIndex: number;
  usesColumnTree: boolean;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onColumnContextMenu(event: ReactMouseEvent<HTMLElement>, columnIndex: number): void;
}): JSX.Element {
  const entry = row.entries[columnIndex];
  if (!entry) {
    return <td key={`${row.label}-${columnIndex}-missing`} />;
  }

  const isEditingEntry =
    matrixEntryEdit.editingTarget?.rowIndex === rowIndex &&
    matrixEntryEdit.editingTarget?.columnIndex === columnIndex;
  const isEditableAccountSumRow = isEditableAccountSumRowCell(
    cell,
    rowIndex,
    columnIndex,
    sumRowIndex,
    sumColumnIndex
  );
  const isEditableDataCell =
    isEditableAccountSumRow ||
    (!entry.isSumCell && rowIndex !== sumRowIndex && columnIndex !== sumColumnIndex);

  return (
    <td
      key={`${row.label}-${cell.columns[columnIndex] ?? columnIndex}`}
      className={
        [
          ...resolveMatrixAccountColumnCellClasses(
            cell.columns,
            cell.sectors,
            cell.columnBadges,
            columnIndex,
            sumColumnIndex
          ),
          columnIndex === sumColumnIndex ? "notebook-matrix-sum-column" : undefined,
          entry.isSumCell && !entry.isBalanced ? "matrix-balance-error" : undefined,
          isEditableDataCell && !isEditingEntry ? "notebook-matrix-cell-editable" : undefined
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      title={isEditableDataCell ? "Double-click to edit" : undefined}
      onDoubleClickCapture={
        isEditableDataCell && !isEditingEntry
          ? (event) => {
              if (!matrixCellDoubleClickShouldOpenEdit(event)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              onBeginEdit(rowIndex, columnIndex, entry.source);
            }
          : undefined
      }
      onContextMenu={usesColumnTree ? undefined : (event) => onColumnContextMenu(event, columnIndex)}
    >
      {(() => {
        const stockRole =
          matrixKind === "stocks" && !entry.isSumCell
            ? classifyMatrixStockRole(row.label, entry.source, entry.numericValue)
            : null;

        const showEquation =
          isEditingEntry || entryDisplayMode === "equation" || entryDisplayMode === "both";
        const showValue =
          !isEditingEntry &&
          ((entry.isSumCell && entry.resolved != null) ||
            entryDisplayMode === "value" ||
            (entryDisplayMode === "both" && entry.resolved != null));

        return (
          <div className="matrix-entry-inline">
            {stockRole ? (
              <span
                className={`notebook-godley-role notebook-godley-role-${stockRole}`}
                aria-label={formatStockRoleTitle(stockRole)}
                title={formatStockRoleTitle(stockRole)}
              >
                {formatStockRoleLabel(stockRole)}
              </span>
            ) : null}
            {showEquation ? (
              <NotebookRenderProfiler
                id="MatrixEntrySource"
                metadata={{
                  cellId: cell.id,
                  columnLabel: cell.columns[columnIndex] ?? String(columnIndex),
                  rowLabel: row.label
                }}
              >
                <MatrixEntrySource
                  allowSumCellEdit={isEditableAccountSumRow}
                  columnIndex={columnIndex}
                  currentValues={currentValues}
                  draftSource={matrixEntryEdit.draftSource}
                  editingTarget={matrixEntryEdit.editingTarget}
                  isSumCell={entry.isSumCell}
                  parameterNames={parameterNames}
                  rowIndex={rowIndex}
                  source={entry.source}
                  sourceSelectVariable={sourceSelectVariable}
                  highlightedVariable={highlightedVariable}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                  onApply={matrixEntryEdit.applyEntryEdit}
                  onBeginEdit={onBeginEdit}
                  onCancel={onCancelEdit}
                  onDraftChange={matrixEntryEdit.setDraftSource}
                />
              </NotebookRenderProfiler>
            ) : null}
            {showValue ? (
              <NotebookRenderProfiler
                id="MatrixEntryResolved"
                metadata={{
                  cellId: cell.id,
                  columnLabel: cell.columns[columnIndex] ?? String(columnIndex),
                  rowLabel: row.label,
                  selectedPeriodIndex
                }}
              >
                <MatrixEntryResolvedValue
                  columnIndex={columnIndex}
                  entryDisplayMode={entryDisplayMode}
                  isSumCell={entry.isSumCell}
                  resolved={entry.resolved}
                  rowIndex={rowIndex}
                  source={entry.source}
                  variableUnitMetadata={variableUnitMetadata}
                  onBeginEdit={onBeginEdit}
                />
              </NotebookRenderProfiler>
            ) : null}
          </div>
        );
      })()}
    </td>
  );
}

function resolveEditorStateForRunCellId(cells: NotebookCell[], sourceRunCellId: string): EditorState | null {
  const sourceRunCell = cells.find((entry) => entry.id === sourceRunCellId);
  if (!sourceRunCell || sourceRunCell.type !== "run") {
    return null;
  }

  return buildEditorStateForNotebookModel(
    {
      id: "notebook",
      title: "notebook",
      metadata: { version: 1 },
      cells
    },
    sourceRunCell
  );
}

function insertMatrixRowBelow(
  rows: MatrixCell["rows"],
  rowIndex: number,
  columnCount: number
): MatrixCell["rows"] {
  const next = rows.slice();
  next.splice(rowIndex + 1, 0, {
    label: "",
    values: Array.from({ length: columnCount }, () => "")
  });
  return next;
}

function moveMatrixRow(rows: MatrixCell["rows"], rowIndex: number, direction: -1 | 1): MatrixCell["rows"] {
  const targetIndex = rowIndex + direction;
  if (targetIndex < 0 || targetIndex >= rows.length) {
    return rows;
  }
  const next = rows.slice();
  const [moved] = next.splice(rowIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function removeMatrixRow(rows: MatrixCell["rows"], rowIndex: number): MatrixCell["rows"] {
  return rows.filter((_, index) => index !== rowIndex);
}

function insertMatrixColumnRight(cell: MatrixCell, columnIndex: number): MatrixCell {
  const nextColumns = cell.columns.slice();
  nextColumns.splice(columnIndex + 1, 0, "");
  return {
    ...cell,
    columns: nextColumns,
    rows: cell.rows.map((row) => ({
      ...row,
      values: insertMatrixValue(row.values, columnIndex + 1)
    }))
  };
}

function moveMatrixColumn(cell: MatrixCell, columnIndex: number, direction: -1 | 1): MatrixCell {
  const targetIndex = columnIndex + direction;
  if (targetIndex < 0 || targetIndex >= cell.columns.length) {
    return cell;
  }

  const nextColumns = cell.columns.slice();
  const [movedColumn] = nextColumns.splice(columnIndex, 1);
  nextColumns.splice(targetIndex, 0, movedColumn);

  return {
    ...cell,
    columns: nextColumns,
    rows: cell.rows.map((row) => ({ ...row, values: moveMatrixValue(row.values, columnIndex, direction) }))
  };
}

function removeMatrixColumn(cell: MatrixCell, columnIndex: number): MatrixCell {
  const nextColumns = cell.columns.filter((_, index) => index !== columnIndex);
  return {
    ...cell,
    columns: nextColumns,
    rows: cell.rows.map((row) => ({ ...row, values: row.values.filter((_, index) => index !== columnIndex) }))
  };
}

function insertMatrixValue(values: string[], insertIndex: number): string[] {
  const next = values.slice();
  next.splice(insertIndex, 0, "");
  return next;
}

function moveMatrixValue(values: string[], index: number, direction: -1 | 1): string[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= values.length) {
    return values;
  }
  const next = values.slice();
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

function buildEvaluatedMatrix(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number
) {
  const sumRowIndex = cell.rows.findIndex((row) => row.label.trim().toLowerCase() === "sum");
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  // Flow matrices store signed debits/credits in cells; A-L-E applies only to balance-sheet
  // matrices where column badges classify unsigned stock magnitudes.
  const useAccountRowSumRule =
    resolveAccountingMatrixKind(cell) === "balance-sheet" &&
    usesMatrixAccountColumnLayout(cell.columnBadges);
  const numericValues = cell.rows.map((row, rowIndex) =>
    row.values.map((value, columnIndex) => {
      if (rowIndex === sumRowIndex || columnIndex === sumColumnIndex) {
        return null;
      }
      return evaluateMatrixEntryNumber(value, result, selectedPeriodIndex);
    })
  );

  const rows = cell.rows.map((row, rowIndex) => {
    const rowEntries = row.values.map((value, columnIndex) => {
      const isSumCell = rowIndex === sumRowIndex || columnIndex === sumColumnIndex;
      const computedValue = isSumCell
        ? computeMatrixTotal(
            numericValues,
            rowIndex,
            columnIndex,
            sumRowIndex,
            sumColumnIndex,
            useAccountRowSumRule ? cell.columnBadges : undefined
          )
        : numericValues[rowIndex]?.[columnIndex] ?? null;

      const isBalanced = isSumCell
        ? rowIndex === sumRowIndex &&
          columnIndex !== sumColumnIndex &&
          isAccountTransactionsMatrix(cell)
          ? resolveAccountSumRowCellBalance(value, computedValue, result, selectedPeriodIndex)
          : Math.abs(computedValue ?? 0) < 1e-6
        : true;

      return {
        numericValue: computedValue,
        source: value,
        resolved:
          computedValue != null && Number.isFinite(computedValue)
            ? `= ${formatMatrixNumber(computedValue)}`
            : resolveMatrixEntryValue(value, result, selectedPeriodIndex),
        isBalanced,
        isSumCell
      };
    });

    return {
      label: row.label,
      entries: rowEntries,
      isBalanced:
        rowIndex === sumRowIndex
          ? rowEntries.every((entry) => entry.isBalanced)
          : Math.abs(
              computeRowTotal(
                numericValues[rowIndex] ?? [],
                sumColumnIndex,
                useAccountRowSumRule ? cell.columnBadges : undefined
              )
            ) < 1e-6,
      isSumRow: rowIndex === sumRowIndex
    };
  });

  return { rows };
}

function computeMatrixTotal(
  numericValues: Array<Array<number | null>>,
  rowIndex: number,
  columnIndex: number,
  sumRowIndex: number,
  sumColumnIndex: number,
  columnBadges?: string[]
): number | null {
  if (rowIndex === sumRowIndex && columnIndex === sumColumnIndex) {
    return numericValues
      .filter((_, currentRowIndex) => currentRowIndex !== sumRowIndex)
      .flatMap((row) => row.filter((_, currentColumnIndex) => currentColumnIndex !== sumColumnIndex))
      .reduce<number>((total, value) => total + (value ?? 0), 0);
  }
  if (rowIndex === sumRowIndex) {
    return numericValues
      .filter((_, currentRowIndex) => currentRowIndex !== sumRowIndex)
      .reduce<number>((total, row) => total + (row[columnIndex] ?? 0), 0);
  }
  if (columnIndex === sumColumnIndex) {
    return computeRowTotal(numericValues[rowIndex] ?? [], sumColumnIndex, columnBadges);
  }
  return numericValues[rowIndex]?.[columnIndex] ?? null;
}

function computeRowTotal(
  row: Array<number | null>,
  sumColumnIndex: number,
  columnBadges?: string[]
): number {
  if (columnBadges && usesMatrixAccountColumnLayout(columnBadges)) {
    return computeMatrixAccountRowTotal(row, columnBadges, sumColumnIndex);
  }
  return row.reduce<number>(
    (total, value, index) => total + (index === sumColumnIndex ? 0 : value ?? 0),
    0
  );
}

function resolveMatrixEntryValue(
  source: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): string | null {
  const value = evaluateMatrixEntryNumber(source, result, selectedPeriodIndex);
  return value == null ? null : `= ${formatMatrixNumber(value)}`;
}

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

function createResultContext(result: SimulationResult, selectedPeriodIndex: number) {
  return {
    currentValue(variable: string): number {
      const values = result.series[variable];
      if (values) {
        const index = Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0));
        return values[index] ?? NaN;
      }
      return externalValueAt(result, variable, selectedPeriodIndex);
    },
    lagValue(variable: string): number {
      const values = result.series[variable];
      if (values) {
        const index = Math.max(Math.min(selectedPeriodIndex, values.length - 1) - 1, 0);
        return values[index] ?? NaN;
      }
      return externalValueAt(result, variable, Math.max(selectedPeriodIndex - 1, 0));
    },
    diffValue(variable: string): number {
      return this.currentValue(variable) - this.lagValue(variable);
    },
    setCurrentValue(): void {},
    hasSeries(variable: string): boolean {
      return variable in result.series;
    }
  };
}

function externalValueAt(result: SimulationResult, variable: string, periodIndex: number): number {
  const external = result.model.externals[variable];
  if (!external) {
    return NaN;
  }
  if (external.kind === "constant") {
    return external.value;
  }
  const index = Math.min(periodIndex, Math.max(external.values.length - 1, 0));
  return external.values[index] ?? NaN;
}

function formatMatrixNumber(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function MatrixEntryResolvedValue({
  columnIndex,
  entryDisplayMode,
  isSumCell,
  resolved,
  rowIndex,
  source,
  variableUnitMetadata,
  onBeginEdit
}: {
  columnIndex: number;
  entryDisplayMode: MatrixEntryDisplayMode;
  isSumCell: boolean;
  resolved: string | null;
  rowIndex: number;
  source: string;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onBeginEdit(rowIndex: number, columnIndex: number, source: string): void;
}) {
  const content = resolved
    ? formatResolvedMatrixValue(source, resolved, variableUnitMetadata)
    : entryDisplayMode === "value"
      ? ""
      : "—";
  const className =
    entryDisplayMode === "value" && !isSumCell
      ? "matrix-entry-current is-editable"
      : "matrix-entry-current";

  return (
    <span
      className={className}
      onDoubleClick={
        isSumCell || entryDisplayMode !== "value"
          ? undefined
          : (event) => {
              event.preventDefault();
              event.stopPropagation();
              onBeginEdit(rowIndex, columnIndex, source);
            }
      }
      title={entryDisplayMode === "value" && !isSumCell ? "Double-click to edit" : undefined}
    >
      {content}
    </span>
  );
}

function formatResolvedMatrixValue(
  source: string,
  resolved: string,
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>
): JSX.Element | string {
  const valueText = resolved.replace(/^=\s*/, "");
  const numericValue = Number(valueText.replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) {
    return valueText;
  }

  const unitMeta = inferMatrixExpressionUnitMeta(source, variableUnitMetadata);
  return (
    <NumericValueText
      prefix=""
      unitMeta={unitMeta}
      value={numericValue}
      options={{
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }}
    />
  );
}

function inferMatrixExpressionUnitMeta(
  source: string,
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>
) {
  try {
    const expression = parseExpression(stripLeadingPlus(source.trim()));
    const inferred = inferUnits(expression, variableUnitMetadata);
    if (inferred.signature) {
      return { signature: inferred.signature };
    }
  } catch {
    // Fall back to a simple variable lookup when the matrix entry is not parseable.
  }

  const variableName = inferPrimaryVariableName(source);
  return variableName ? variableUnitMetadata.get(variableName) : undefined;
}

function inferPrimaryVariableName(source: string): string | null {
  const match = source.match(/[A-Za-z_][A-Za-z0-9_.^{}]*/);
  return match ? match[0] : null;
}

function MatrixEntrySource({
  allowSumCellEdit = false,
  columnIndex,
  currentValues,
  draftSource,
  editingTarget,
  isSumCell,
  parameterNames,
  rowIndex,
  source,
  sourceSelectVariable,
  highlightedVariable = null,
  variableDescriptions,
  variableUnitMetadata,
  onApply,
  onBeginEdit,
  onCancel,
  onDraftChange
}: {
  allowSumCellEdit?: boolean;
  columnIndex: number;
  currentValues: Record<string, number | undefined>;
  draftSource: string;
  editingTarget: MatrixEditingTarget | null;
  isSumCell: boolean;
  parameterNames: Set<string>;
  rowIndex: number;
  source: string;
  sourceSelectVariable?: (variableName: string) => void;
  highlightedVariable?: string | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onApply(): void;
  onBeginEdit(rowIndex: number, columnIndex: number, source: string): void;
  onCancel(): void;
  onDraftChange(value: string): void;
}) {
  const expressionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const isEditing =
    editingTarget?.rowIndex === rowIndex && editingTarget?.columnIndex === columnIndex;
  const hasDraftChanges = draftSource.trim() !== source.trim();

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    expressionInputRef.current?.focus();
    expressionInputRef.current?.select();
  }, [isEditing]);

  if (isEditing) {
    return (
      <div
        className="matrix-entry-editor"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <HighlightedFormulaInput
          ariaLabel={`Matrix entry for row ${rowIndex + 1}, column ${columnIndex + 1}`}
          className="matrix-entry-formula-input"
          currentValues={currentValues}
          inputRef={(node) => {
            expressionInputRef.current = node;
          }}
          onChange={onDraftChange}
          onEnter={onApply}
          onSelectVariable={sourceSelectVariable}
          documentHighlightedVariable={highlightedVariable}
          parameterNames={parameterNames}
          placeholder="Expression"
          value={draftSource}
          variableDescriptions={variableDescriptions}
          variableUnitMetadata={variableUnitMetadata}
        />
        <div className="matrix-entry-editor-actions">
          <button disabled={!hasDraftChanges} onClick={onApply} type="button">
            Apply
          </button>
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (isSumCell && !allowSumCellEdit) {
    return (
      <span className="matrix-entry-source">
        {highlightFormula(
          source,
          parameterNames,
          undefined,
          variableDescriptions,
          variableUnitMetadata,
          sourceSelectVariable,
          undefined,
          currentValues,
          highlightedVariable,
          true
        )}
      </span>
    );
  }

  const beginEdit = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onBeginEdit(rowIndex, columnIndex, source);
  };

  return (
    <span className="matrix-entry-source is-editable" onDoubleClick={beginEdit} title="Double-click to edit">
      {highlightFormula(
        source,
        parameterNames,
        undefined,
        variableDescriptions,
        variableUnitMetadata,
        sourceSelectVariable,
        undefined,
        currentValues,
        highlightedVariable,
        true
      )}
    </span>
  );
}
