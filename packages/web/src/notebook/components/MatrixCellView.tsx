import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from "react";

import { externalRowsOnly } from "@sfcr/notebook-core";

import { evaluateExpression, parseExpression, type SimulationResult } from "@sfcr/core";
import {
  computeMatrixAccountRowTotal,
  isMatrixEquityColumn,
  isMatrixInitialRow,
  resolveMatrixAccountColumnCellClasses,
  resolveMatrixColumnSumReference,
  usesMatrixAccountColumnLayout,
  usesMatrixSectorColumnLayout,
  type MatrixColumnDisplaySlot
} from "@sfcr/notebook-core";

import type { MatrixEntryDisplayMode } from "../matrixEntryDisplay";

import { HighlightedFormulaInput, highlightFormula } from "../../components/EquationGridEditor";
import { collectEquationDenominatorVariables } from "../../lib/equationDivisionAnalysis";
import { applyFixedMenuPosition } from "../../lib/clampFixedMenuPosition";
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
  resolveMatrixCornerLabel,
  resolveMatrixTableKind
} from "../matrixSemantics";
import { resolveInspectorModelSource, type VariableInspectRequest } from "../../lib/variableInspect";
import { documentHighlightClassName, matrixSourceMatchesHighlight } from "../../lib/variableHighlight";
import { buildEditorStateForNotebookModel } from "../modelSections";
import { NotebookRenderProfiler } from "../notebookProfiler";
import {
  ACCOUNT_SUM_ROW_INTEGRATED_STOCK_UNIT_META,
  evaluateMatrixEntryNumber,
  formatAccountTransactionsSumColumnDisplayLabel,
  formatAccountTransactionsSumRowDisplayLabel,
  isAccountTransactionsMatrix,
  isEditableAccountSumRowCell,
  isEmptyAccountSumRowSource,
  resolveAccountSumRowCellBalance,
  resolveAccountSumRowDisplayValue,
  resolveAccountTransactionsMatrixCellValue,
  resolveMatrixColumnStockVariable,
  formatMatrixIntegralInspectVariable
} from "../matrixAccountSumRow";
import type { UnitMeta } from "../../lib/unitMeta";
import { resolveAccountingMatrixKind } from "../validation";
import { buildIssueMapForMatrixCell } from "../matrixInitialRow";
import {
  collectMatrixColumnGraphSeries,
  collectMatrixRowGraphSeries,
  type MatrixGraphRequest
} from "../matrixSliceGraph";
import { useMatrixEntryEdit, type MatrixEditingTarget } from "../useMatrixEntryEdit";
import type { MatrixCell, NotebookCell, RunCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";
import { VariableRenameDialog } from "./EquationRowInlineEditor";
import {
  matrixSliceColumnClassName,
  matrixSliceHeaderClassName,
  matrixSliceRowClassName,
  type MatrixGraphSliceHighlight
} from "../graphDocumentHighlight";
import { useMatrixColumnCollapseState } from "../matrixColumnCollapseStorage";
import {
  useMatrixFloatingColumnHeader,
  useSyncedHorizontalScroll,
  useSyncedMatrixFloatingTableLayout
} from "../useMatrixFloatingColumnHeader";
import { MatrixColumnTreeHeader, useMatrixColumnLayout } from "./MatrixColumnTreeHeader";

const EMPTY_PARAMETER_NAMES = new Set<string>();
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
  onMatrixGraphRequest,
  onVariableInspectRequest,
  highlightedVariable = null,
  graphSliceHighlight = null,
  viewportRoot = null
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
  graphSliceHighlight?: MatrixGraphSliceHighlight | null;
  viewportRoot?: Element | null;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  onMatrixGraphRequest?(request: MatrixGraphRequest): void;
  onVariableInspectRequest(args: VariableInspectRequest): void;
}) {
  const matrixDragScroll = useDragScroll<HTMLDivElement>();
  const matrixRootRef = useRef<HTMLDivElement | null>(null);
  const matrixWrapRef = useRef<HTMLDivElement | null>(null);
  const matrixColumnRowRef = useRef<HTMLTableRowElement | null>(null);
  const matrixTableRef = useRef<HTMLTableElement | null>(null);
  const matrixFloatingTableRef = useRef<HTMLTableElement | null>(null);
  const matrixFloatingScrollRef = useRef<HTMLDivElement | null>(null);
  const variableInspectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    collapsedNodeIds: collapsedColumnTreeNodeIds,
    toggleColumnTreeNode,
    expandAllColumnTreeNodes,
    collapseAllColumnTreeNodes
  } = useMatrixColumnCollapseState(notebookScopeId, cell);
  const columnLayout = useMatrixColumnLayout(cell, collapsedColumnTreeNodeIds);
  const displaySlots = columnLayout.displaySlots;
  const usesColumnTree = columnLayout.usesColumnTree;
  const usesFloatingColumnHeader = usesColumnTree && columnLayout.headerRows.length >= 2;
  const { visible: floatingColumnHeaderVisible, anchor: floatingColumnHeaderAnchor } =
    useMatrixFloatingColumnHeader({
      scrollRoot: viewportRoot,
      columnRowRef: matrixColumnRowRef,
      tableWrapRef: matrixWrapRef,
      cellRootRef: matrixRootRef,
      enabled: usesFloatingColumnHeader
    });
  useSyncedHorizontalScroll(matrixWrapRef, matrixFloatingScrollRef, floatingColumnHeaderVisible);
  const matrixFloatingLayoutSyncKey = useMemo(
    () =>
      [
        cell.id,
        cell.columns.join("\u0000"),
        [...collapsedColumnTreeNodeIds].sort().join("\u0000"),
        displaySlots.length,
        selectedPeriodIndex
      ].join("|"),
    [cell.columns, cell.id, collapsedColumnTreeNodeIds, displaySlots.length, selectedPeriodIndex]
  );
  useSyncedMatrixFloatingTableLayout({
    enabled: floatingColumnHeaderVisible,
    sourceHeaderRowRef: matrixColumnRowRef,
    targetTableRef: matrixFloatingTableRef,
    syncKey: matrixFloatingLayoutSyncKey
  });
  const accountColumnLayout = usesMatrixAccountColumnLayout(cell.columnBadges);
  const sectorGroupedColumns =
    accountColumnLayout ||
    usesMatrixSectorColumnLayout(cell.columns, cell.sectors, cell.columnBadges, cell.columnTree);
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
  const laggedCurrentValues = result
    ? Object.fromEntries(
        Object.entries(result.series).map(([name, values]) => {
          const lagPeriodIndex = selectedPeriodIndex - 1;
          return [
            name,
            lagPeriodIndex >= 0
              ? values[Math.min(lagPeriodIndex, Math.max(values.length - 1, 0))]
              : undefined
          ];
        })
      )
    : {};
  const laggedPeriodLabel = selectedPeriodIndex > 0 ? `period ${selectedPeriodIndex}` : undefined;
  const evaluatedMatrix = useMemo(
    () => buildEvaluatedMatrix(cell, result, selectedPeriodIndex),
    [cell, result, selectedPeriodIndex]
  );
  const matrixIssueMap = useMemo(() => buildIssueMapForMatrixCell(cells, cell), [cells, cell]);
  const matrixInitialOverrideMessage = matrixIssueMap[`matrix.${cell.id}.initialValues`];
  const matrixKind = useMemo(() => resolveMatrixTableKind(cell), [cell]);
  const sumRowIndex = cell.rows.findIndex((row) => row.label.trim().toLowerCase() === "sum");
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  const parameterNames = useMemo(() => {
    if (!editor) {
      return EMPTY_PARAMETER_NAMES;
    }

    return new Set(externalRowsOnly(editor.externals).map((external) => external.name.trim()).filter(Boolean));
  }, [editor]);
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
  const sourceRunCellId = cell.sourceRunCellId ?? sourceRunCell?.id ?? null;
  const inspectContextRef = useRef({
    currentValues,
    editor,
    modelSource,
    sourceRunCellId,
    variableDescriptions,
    variableUnitMetadata
  });

  useEffect(() => {
    inspectContextRef.current = {
      currentValues,
      editor,
      modelSource,
      sourceRunCellId,
      variableDescriptions,
      variableUnitMetadata
    };
  }, [currentValues, editor, modelSource, sourceRunCellId, variableDescriptions, variableUnitMetadata]);

  const closeContextMenus = useCallback(() => {
    setRowContextMenu(null);
    setColumnContextMenu(null);
  }, []);

  useLayoutEffect(() => {
    if (rowContextMenu && rowContextMenuRef.current) {
      applyFixedMenuPosition(rowContextMenuRef.current, rowContextMenu.x, rowContextMenu.y);
    }
    if (columnContextMenu && columnContextMenuRef.current) {
      applyFixedMenuPosition(columnContextMenuRef.current, columnContextMenu.x, columnContextMenu.y);
    }
  }, [columnContextMenu, rowContextMenu]);

  useEffect(() => {
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

  const canGraphMatrix = Boolean(cell.sourceRunCellId && result && onMatrixGraphRequest);

  const handleGraphRow = useCallback(
    (rowIndex: number, label: string) => {
      if (!canGraphMatrix || !cell.sourceRunCellId || !result || !onMatrixGraphRequest) {
        return;
      }
      if (rowIndex === sumRowIndex) {
        return;
      }

      onMatrixGraphRequest({
        index: rowIndex,
        kind: "row",
        label,
        matrixCellId: cell.id,
        matrixTitle: cell.title,
        sourceRunCellId: cell.sourceRunCellId,
        series: collectMatrixRowGraphSeries(cell, rowIndex, result),
        variableDescriptions,
        variableUnitMetadata
      });
    },
    [
      canGraphMatrix,
      cell,
      onMatrixGraphRequest,
      result,
      sumRowIndex,
      variableDescriptions,
      variableUnitMetadata
    ]
  );

  const handleGraphColumn = useCallback(
    (columnIndex: number) => {
      if (!canGraphMatrix || !cell.sourceRunCellId || !result || !onMatrixGraphRequest) {
        return;
      }
      if (columnIndex === sumColumnIndex) {
        return;
      }

      const label = cell.columns[columnIndex]?.trim() || `Column ${columnIndex + 1}`;
      onMatrixGraphRequest({
        index: columnIndex,
        kind: "column",
        label,
        matrixCellId: cell.id,
        matrixTitle: cell.title,
        sourceRunCellId: cell.sourceRunCellId,
        series: collectMatrixColumnGraphSeries(cell, columnIndex, result),
        variableDescriptions,
        variableUnitMetadata
      });
    },
    [
      canGraphMatrix,
      cell,
      onMatrixGraphRequest,
      result,
      sumColumnIndex,
      variableDescriptions,
      variableUnitMetadata
    ]
  );

  const handleColumnLabelClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>, columnIndex: number, inspectVariableName: string) => {
      if ((event.metaKey || event.ctrlKey) && editor) {
        event.preventDefault();
        event.stopPropagation();
        handleInspectVariable(inspectVariableName);
        return;
      }

      if (canGraphMatrix) {
        event.preventDefault();
        event.stopPropagation();
        handleGraphColumn(columnIndex);
        return;
      }

      if (editor) {
        handleInspectVariable(inspectVariableName);
      }
    },
    [canGraphMatrix, editor, handleGraphColumn, handleInspectVariable]
  );

  const handleRowLabelClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>, rowIndex: number, label: string) => {
      if (!canGraphMatrix || rowIndex === sumRowIndex) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleGraphRow(rowIndex, label);
    },
    [canGraphMatrix, handleGraphRow, sumRowIndex]
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
    onReplaceCells,
    variableUnitMetadata
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
  const matrixColumnTreeHeaderProps = {
    headerRows: columnLayout.headerRows,
    columns: cell.columns,
    sectors: cell.sectors,
    columnBadges: cell.columnBadges,
    sumColumnIndex,
    sumColumnLabel:
      sumColumnIndex >= 0
        ? formatAccountTransactionsSumColumnDisplayLabel(cell, cell.columns[sumColumnIndex] ?? "")
        : undefined,
    collapsedNodeIds: collapsedColumnTreeNodeIds,
    editorLinked: editor != null,
    accountColumnLayout,
    sectorGroupedColumns,
    matrixKind,
    onToggleNode: toggleColumnTreeNode,
    graphLinked: canGraphMatrix,
    graphSliceHighlight,
    matrixCellId: cell.id,
    onColumnLabelClick: canGraphMatrix || editor ? handleColumnLabelClick : undefined,
    onInspectVariable: editor ? handleInspectVariable : undefined
  };
  const matrixHeaderRow = usesColumnTree ? (
    <MatrixColumnTreeHeader {...matrixColumnTreeHeaderProps} columnRowRef={matrixColumnRowRef} />
  ) : (
    <tr ref={matrixColumnRowRef}>
      <th scope="col">
        {resolveMatrixCornerLabel(accountColumnLayout, matrixKind)}
      </th>
      {cell.columns.map((column, columnIndex) => (
        <th
          key={column}
          scope="col"
          className={
            [
              columnIndex === sumColumnIndex ? "notebook-matrix-sum-column" : undefined,
              matrixSliceHeaderClassName(cell.id, "column", columnIndex, graphSliceHighlight)
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onContextMenu={(event) => handleMatrixColumnContextMenu(event, columnIndex)}
        >
          {canGraphMatrix || editor ? (
            <button
              type="button"
              className={documentHighlightClassName(column, highlightedVariable, "result-variable-button notebook-matrix-slice-label-button")}
              title={
                canGraphMatrix
                  ? `Graph column ${column}. Ctrl+click to inspect.`
                  : `Inspect ${column}`
              }
              onClick={(event) => handleColumnLabelClick(event, columnIndex, column)}
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
  const matrixBodyRows = evaluatedMatrix.rows.map((row, rowIndex) => (
    <tr
      key={row.label}
      className={
        [
          sectorGroupedColumns && rowIndex === 0 && !row.isSumRow
            ? "notebook-matrix-flow-start-row"
            : undefined,
          row.isSumRow ? "notebook-matrix-sum-row" : undefined,
          row.isInitialRow ? "notebook-matrix-initial-row" : undefined,
          row.isSumRow && !row.isBalanced ? "matrix-balance-error" : undefined,
          matrixSliceRowClassName(cell.id, rowIndex, graphSliceHighlight)
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <th
        scope="row"
        className={matrixSliceHeaderClassName(cell.id, "row", rowIndex, graphSliceHighlight)}
        onContextMenu={(event) => handleMatrixRowContextMenu(event, rowIndex)}
      >
        <NotebookRenderProfiler
          id="MatrixTableRowLabel"
          metadata={{
            cellId: cell.id,
            rowLabel: row.label,
            selectedPeriodIndex
          }}
        >
          {canGraphMatrix && !row.isSumRow ? (
            <button
              type="button"
              className="notebook-matrix-slice-label-button result-variable-button"
              title={`Graph row ${row.label}`}
              onClick={(event) => handleRowLabelClick(event, rowIndex, row.label)}
            >
              <VariableLabel
                name={row.label}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            </button>
          ) : (
            <VariableLabel
              name={row.label}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
          )}
        </NotebookRenderProfiler>
      </th>
      {renderMatrixRowDataCells({
        accountColumnLayout,
        sectorGroupedColumns,
        cell,
        displaySlots,
        entryDisplayMode,
        graphSliceHighlight,
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
        laggedCurrentValues,
        laggedPeriodLabel,
        onColumnContextMenu: handleMatrixColumnContextMenu
      })}
    </tr>
  ));

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
      <div className="notebook-matrix" ref={matrixRootRef}>
        {matrixInitialOverrideMessage ? (
          <div className="notebook-matrix-initial-override-warning" role="status">
            {matrixInitialOverrideMessage}
          </div>
        ) : null}
        {usesColumnTree && !isAccountTransactionsMatrix(cell) ? (
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
            ref={(node) => {
              matrixDragScroll.dragScrollRef.current = node;
              matrixWrapRef.current = node;
            }}
            data-drag-scroll-ignore="true"
            className={[
              "notebook-matrix-wrap",
              "notebook-oversize-scroll",
              matrixDragScroll.dragScrollProps.className
            ]
              .filter(Boolean)
              .join(" ")}
            onClickCapture={matrixDragScroll.dragScrollProps.onClickCapture}
            onMouseDown={matrixDragScroll.dragScrollProps.onMouseDown}
          >
            <table
              ref={matrixTableRef}
              className={[
                "notebook-matrix-table",
                sectorGroupedColumns ? "notebook-matrix-table-account-columns" : undefined
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {matrixColumnGroup}
              <NotebookRenderProfiler
                id="MatrixTableHeader"
                metadata={{
                  cellId: cell.id,
                  columnCount: cell.columns.length,
                  rowCount: evaluatedMatrix.rows.length,
                  selectedPeriodIndex
                }}
              >
                <thead
                  className={
                    !usesFloatingColumnHeader ? "notebook-matrix-thead-sticky" : undefined
                  }
                >
                  {matrixHeaderRow}
                </thead>
              </NotebookRenderProfiler>
              <NotebookRenderProfiler
                id="MatrixTableBody"
                metadata={{
                  cellId: cell.id,
                  columnCount: cell.columns.length,
                  rowCount: evaluatedMatrix.rows.length,
                  selectedPeriodIndex
                }}
              >
                <tbody>{matrixBodyRows}</tbody>
              </NotebookRenderProfiler>
            </table>
          </div>
          {floatingColumnHeaderVisible ? (
            <div
              className="notebook-floating-header notebook-matrix-floating-column-header"
              style={{
                top: `${floatingColumnHeaderAnchor.top}px`,
                left: `${floatingColumnHeaderAnchor.left}px`,
                width: `${floatingColumnHeaderAnchor.width}px`
              }}
              aria-hidden="true"
            >
              <div
                ref={matrixFloatingScrollRef}
                className="notebook-floating-header-scroll notebook-matrix-floating-column-header-scroll"
              >
                <table
                  ref={matrixFloatingTableRef}
                  className={[
                    "notebook-matrix-table",
                    sectorGroupedColumns ? "notebook-matrix-table-account-columns" : undefined
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {matrixColumnGroup}
                  <thead>
                    <MatrixColumnTreeHeader
                      {...matrixColumnTreeHeaderProps}
                      variant="column-row"
                    />
                  </thead>
                </table>
              </div>
            </div>
          ) : null}
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
        impact={matrixEntryEdit.renameReferenceCount}
        isOpen={matrixEntryEdit.renameDialog != null}
        newName={matrixEntryEdit.renameDialog?.newName ?? ""}
        oldName={matrixEntryEdit.renameDialog?.oldName ?? ""}
        onCancel={matrixEntryEdit.cancelEntryEdit}
        onConfirmNo={matrixEntryEdit.confirmRenameNo}
        onConfirmYes={matrixEntryEdit.confirmRenameYes}
      />
    </NotebookRenderProfiler>
  );
}

function renderMatrixRowDataCells({
  accountColumnLayout,
  sectorGroupedColumns,
  cell,
  currentValues,
  laggedCurrentValues,
  laggedPeriodLabel,
  displaySlots,
  entryDisplayMode,
  graphSliceHighlight,
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
  sectorGroupedColumns: boolean;
  cell: MatrixCell;
  currentValues: Record<string, number | undefined>;
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  displaySlots: MatrixColumnDisplaySlot[];
  entryDisplayMode: MatrixEntryDisplayMode;
  graphSliceHighlight?: MatrixGraphSliceHighlight | null;
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
            sectorGroupedColumns
              ? "notebook-matrix-tree-collapsed-stub notebook-matrix-sector-start"
              : "notebook-matrix-tree-collapsed-stub"
          }
          aria-label={`${expandTitle} collapsed`}
          title={`Expand ${expandTitle}`}
        >
          {sectorGroupedColumns && collapsedLabel ? collapsedLabel : "—"}
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
                sumColumnIndex,
                cell.columnTree
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
        laggedCurrentValues,
        laggedPeriodLabel,
        entryDisplayMode,
        graphSliceHighlight,
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
        laggedCurrentValues,
        laggedPeriodLabel,
        entryDisplayMode,
        graphSliceHighlight,
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
  laggedCurrentValues,
  laggedPeriodLabel,
  entryDisplayMode,
  graphSliceHighlight,
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
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  entryDisplayMode: MatrixEntryDisplayMode;
  graphSliceHighlight?: MatrixGraphSliceHighlight | null;
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
  const showAccountSumRowFlowIntegral =
    isEditableAccountSumRow && isEmptyAccountSumRowSource(entry.source);
  const integralColumnRef = showAccountSumRowFlowIntegral
    ? resolveMatrixColumnSumReference(cell.columns, columnIndex, cell.sectors)
    : null;

  return (
    <td
      key={`${rowIndex}-${columnIndex}`}
      className={
        [
          ...resolveMatrixAccountColumnCellClasses(
            cell.columns,
            cell.sectors,
            cell.columnBadges,
            columnIndex,
            sumColumnIndex,
            cell.columnTree
          ),
          columnIndex === sumColumnIndex ? "notebook-matrix-sum-column" : undefined,
          matrixSliceColumnClassName(cell.id, columnIndex, graphSliceHighlight),
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

        // Equity cells in account-transactions matrices usually carry no explicit
        // equation; their value is implied from the sector's asset/liability columns.
        // In "Cells: Equation" mode such cells would otherwise render blank, so fall
        // back to the resolved value when one is available.
        const isEmptyEquationEquityCell =
          isAccountTransactionsMatrix(cell) &&
          isMatrixEquityColumn(cell.columnBadges, columnIndex) &&
          !entry.isSumCell &&
          isEmptyAccountSumRowSource(entry.source) &&
          entry.resolved != null;

        const showEquation =
          isEditingEntry ||
          ((entryDisplayMode === "equation" || entryDisplayMode === "both") &&
            !isEmptyEquationEquityCell);
        const showValue =
          !isEditingEntry &&
          ((entry.isSumCell && entry.resolved != null) ||
            entryDisplayMode === "value" ||
            (entryDisplayMode === "both" && entry.resolved != null) ||
            isEmptyEquationEquityCell);

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
                  laggedCurrentValues={laggedCurrentValues}
                  laggedPeriodLabel={laggedPeriodLabel}
                  draftSource={matrixEntryEdit.draftSource}
                  draftValidationError={matrixEntryEdit.draftValidationError}
                  editingTarget={matrixEntryEdit.editingTarget}
                  isSumCell={entry.isSumCell}
                  parameterNames={parameterNames}
                  rowIndex={rowIndex}
                  showFlowIntegralPlaceholder={showAccountSumRowFlowIntegral}
                  integralColumnRef={integralColumnRef}
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
                  resolvedUnitMeta={
                    showAccountSumRowFlowIntegral
                      ? ACCOUNT_SUM_ROW_INTEGRATED_STOCK_UNIT_META
                      : undefined
                  }
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

function parseMatrixInitialConstant(source: string): number | null {
  const trimmed = source.trim();
  if (!trimmed || trimmed === "0") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function buildEvaluatedMatrix(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number
) {
  const sumRowIndex = cell.rows.findIndex((row) => row.label.trim().toLowerCase() === "sum");
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
  // Balance-sheet and account-transaction matrices weight column badges as A − L − E
  // (asset +, liability −, equity −) for row totals and the Sum-column grand total.
  const accountingKind = resolveAccountingMatrixKind(cell);
  const useAccountRowSumRule =
    (accountingKind === "balance-sheet" || accountingKind === "account-transactions") &&
    usesMatrixAccountColumnLayout(cell.columnBadges);
  const numericValues = cell.rows.map((row, rowIndex) =>
    row.values.map((value, columnIndex) => {
      if (rowIndex === sumRowIndex || columnIndex === sumColumnIndex) {
        return null;
      }
      if (isAccountTransactionsMatrix(cell)) {
        return resolveAccountTransactionsMatrixCellValue(
          cell,
          rowIndex,
          columnIndex,
          result,
          selectedPeriodIndex
        );
      }
      if (isMatrixInitialRow(row)) {
        return parseMatrixInitialConstant(value);
      }
      return evaluateMatrixEntryNumber(value, result, selectedPeriodIndex);
    })
  );

  const rows = cell.rows.map((row, rowIndex) => {
    const isInitialRow = isMatrixInitialRow(row);
    const rowEntries = row.values.map((value, columnIndex) => {
      const isSumCell = rowIndex === sumRowIndex || columnIndex === sumColumnIndex;
      const columnSum = isSumCell
        ? computeMatrixTotal(
            cell,
            numericValues,
            rowIndex,
            columnIndex,
            sumRowIndex,
            sumColumnIndex,
            useAccountRowSumRule ? cell.columnBadges : undefined
          )
        : null;
      const computedValue = isSumCell
        ? rowIndex === sumRowIndex &&
          columnIndex !== sumColumnIndex &&
          isAccountTransactionsMatrix(cell)
          ? resolveAccountSumRowDisplayValue(value, columnSum, result, selectedPeriodIndex, {
              stockVariable: resolveMatrixColumnStockVariable(cell, columnIndex),
              matrix: cell,
              columnIndex
            })
          : columnSum
        : isAccountTransactionsMatrix(cell)
          ? resolveAccountTransactionsMatrixCellValue(
              cell,
              rowIndex,
              columnIndex,
              result,
              selectedPeriodIndex
            )
          : isInitialRow
            ? parseMatrixInitialConstant(value)
            : numericValues[rowIndex]?.[columnIndex] ?? null;

      const isBalanced = isInitialRow
        ? true
        : isSumCell
          ? rowIndex === sumRowIndex &&
            columnIndex !== sumColumnIndex &&
            isAccountTransactionsMatrix(cell)
            ? resolveAccountSumRowCellBalance(value, columnSum, result, selectedPeriodIndex)
            : Math.abs(computedValue ?? 0) < 1e-6
          : true;

      return {
        numericValue: computedValue,
        source: value,
        resolved:
          isInitialRow && computedValue != null && Number.isFinite(computedValue)
            ? `= ${formatMatrixNumber(computedValue)}`
            : computedValue != null && Number.isFinite(computedValue)
              ? `= ${formatMatrixNumber(computedValue)}`
              : resolveMatrixEntryValue(value, result, selectedPeriodIndex),
        isBalanced,
        isSumCell
      };
    });

    return {
      label: formatAccountTransactionsSumRowDisplayLabel(cell, row.label),
      entries: rowEntries,
      isBalanced: isInitialRow
        ? true
        : rowIndex === sumRowIndex
          ? rowEntries.every((entry) => entry.isBalanced)
          : Math.abs(
              computeRowTotal(
                numericValues[rowIndex] ?? [],
                sumColumnIndex,
                useAccountRowSumRule ? cell.columnBadges : undefined
              )
            ) < 1e-6,
      isSumRow: rowIndex === sumRowIndex,
      isInitialRow
    };
  });

  return { rows };
}

function computeMatrixTotal(
  cell: MatrixCell,
  numericValues: Array<Array<number | null>>,
  rowIndex: number,
  columnIndex: number,
  sumRowIndex: number,
  sumColumnIndex: number,
  columnBadges?: string[]
): number | null {
  if (rowIndex === sumRowIndex && columnIndex === sumColumnIndex) {
    // Grand total is the vertical sum of the Sum column: each row's (badge-weighted)
    // row total, excluding the initial row and the Sum row itself.
    return numericValues.reduce<number>((total, row, currentRowIndex) => {
      if (currentRowIndex === sumRowIndex) {
        return total;
      }
      if (isMatrixInitialRow(cell.rows[currentRowIndex] ?? { label: "" })) {
        return total;
      }
      return total + computeRowTotal(row, sumColumnIndex, columnBadges);
    }, 0);
  }
  if (rowIndex === sumRowIndex) {
    return numericValues
      .filter((_, currentRowIndex) => currentRowIndex !== sumRowIndex)
      .reduce<number>((total, row, currentRowIndex) => {
        if (isMatrixInitialRow(cell.rows[currentRowIndex] ?? { label: "" })) {
          return total;
        }
        return total + (row[columnIndex] ?? 0);
      }, 0);
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
  resolvedUnitMeta,
  rowIndex,
  source,
  variableUnitMetadata,
  onBeginEdit
}: {
  columnIndex: number;
  entryDisplayMode: MatrixEntryDisplayMode;
  isSumCell: boolean;
  resolved: string | null;
  resolvedUnitMeta?: UnitMeta;
  rowIndex: number;
  source: string;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onBeginEdit(rowIndex: number, columnIndex: number, source: string): void;
}) {
  const content = resolved
    ? formatResolvedMatrixValue(source, resolved, variableUnitMetadata, resolvedUnitMeta)
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
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>,
  resolvedUnitMeta?: UnitMeta
): JSX.Element | string {
  const valueText = resolved.replace(/^=\s*/, "");
  const numericValue = Number(valueText.replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) {
    return valueText;
  }

  const unitMeta = resolvedUnitMeta ?? inferMatrixExpressionUnitMeta(source, variableUnitMetadata);
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
  laggedCurrentValues,
  laggedPeriodLabel,
  draftSource,
  draftValidationError,
  editingTarget,
  isSumCell,
  parameterNames,
  rowIndex,
  showFlowIntegralPlaceholder = false,
  integralColumnRef = null,
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
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  draftSource: string;
  draftValidationError: string | null;
  editingTarget: MatrixEditingTarget | null;
  isSumCell: boolean;
  parameterNames: Set<string>;
  rowIndex: number;
  showFlowIntegralPlaceholder?: boolean;
  integralColumnRef?: string | null;
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
  const denominatorVariableNames = useMemo(
    () => collectEquationDenominatorVariables(source),
    [source]
  );
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
          laggedCurrentValues={laggedCurrentValues}
          laggedPeriodLabel={laggedPeriodLabel}
          denominatorVariableNames={denominatorVariableNames}
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
        {draftValidationError ? (
          <div className="notebook-source-validation matrix-entry-validation" role="status" aria-live="polite">
            {draftValidationError}
          </div>
        ) : null}
        <div className="matrix-entry-editor-actions">
          <button
            disabled={!hasDraftChanges || draftValidationError != null}
            onClick={onApply}
            type="button"
          >
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
      <span
        className={withMatrixEntrySourceHighlight(
          source,
          highlightedVariable,
          "matrix-entry-source"
        )}
      >
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
          true,
          laggedCurrentValues,
          laggedPeriodLabel,
          denominatorVariableNames
        )}
      </span>
    );
  }

  const beginEdit = (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onBeginEdit(rowIndex, columnIndex, source);
  };

  if (showFlowIntegralPlaceholder) {
    return (
      <span
        className="matrix-entry-source is-editable matrix-entry-flow-delta result-variable-button"
        onClick={(event) => {
          if (!integralColumnRef || !sourceSelectVariable) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          sourceSelectVariable(formatMatrixIntegralInspectVariable(integralColumnRef));
        }}
        onDoubleClick={beginEdit}
        title="Integrated column flows from the Initial row; click to inspect, double-click to name a stock"
      >
        ∫
      </span>
    );
  }

  return (
    <span
      className={withMatrixEntrySourceHighlight(
        source,
        highlightedVariable,
        "matrix-entry-source is-editable"
      )}
      onDoubleClick={beginEdit}
      title="Double-click to edit"
    >
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
        true,
        laggedCurrentValues,
        laggedPeriodLabel,
        denominatorVariableNames
      )}
    </span>
  );
}

function withMatrixEntrySourceHighlight(
  source: string,
  highlightedVariable: string | null | undefined,
  className: string
): string {
  return matrixSourceMatchesHighlight(source, highlightedVariable)
    ? `${className} is-document-highlighted`
    : className;
}
