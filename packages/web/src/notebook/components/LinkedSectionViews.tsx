import { useEffect, useMemo, useRef, useState } from "react";

import {
  countDataRows,
  formatCompactRowCommentText,
  isRowComment,
  type ExternalListItem,
  type InitialValueListItem
} from "@sfcr/notebook-core";

import { ExternalEditor } from "../../components/ExternalEditor";
import { InitialValuesEditor } from "../../components/InitialValuesEditor";
import { SolverPanel } from "../../components/SolverPanel";
import type { EditorState } from "../../lib/editorModel";
import { buildVariableDescriptions, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../../lib/units";
import { useDragScroll } from "../../hooks/useDragScroll";
import type { VariableInspectRequest } from "../../lib/variableInspect";
import { countModelSectionIssues } from "../modelSections";
import { newRowComment } from "../rowCommentHelpers";
import { useInlineCommentRowEdit } from "../useInlineCommentRowEdit";
import { useInlineExternalRowEdit } from "../useInlineExternalRowEdit";
import { useInlineInitialValueRowEdit } from "../useInlineInitialValueRowEdit";
import { CommentRowReadView } from "./CommentRowReadView";
import type { ExternalsCell, InitialValuesCell, NotebookCell, SolverCell } from "../types";
import {
  canMoveRowDown,
  canMoveRowUp,
  GridRowContextMenu,
  GridRowDeleteDialog,
  useGridRowContextMenu
} from "../../components/GridRowContextMenu";
import {
  NotebookLinkedEditorActions,
  NotebookLinkedEditorHeader
} from "./NotebookCellHeader";
import { VariableRenameDialog } from "./EquationRowInlineEditor";
import { NotebookExternalReadRow } from "./ExternalRowInlineEditor";
import { NotebookInitialValueReadRow } from "./InitialValueRowInlineEditor";
import { NotebookFloatingHeaderOverlay } from "./NotebookFloatingHeaderOverlay";
import { NotebookModelViewTable } from "./NotebookModelViewTable";
import {
  ExternalsModelViewHeaderRowStatic,
  InitialValuesModelViewHeaderRowStatic
} from "./notebookModelViewHeaderRows";
import { useNotebookFloatingHeaderRow } from "../useNotebookFloatingHeaderRow";

export function SolverCellView({
  cell,
  issueMap,
  isPinnedInPanel = false,
  onEditingChange,
  onHelpRequest,
  title,
  onChange,
  onPinCellRequest,
  onToggleCollapsed
}: {
  cell: SolverCell;
  issueMap: Record<string, string | undefined>;
  isPinnedInPanel?: boolean;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  title: string;
  onChange(options: EditorState["options"]): void;
  onPinCellRequest?: (() => void) | null;
  onToggleCollapsed(): void;
}) {
  const solverViewDragScroll = useDragScroll<HTMLElement>();
  const options = cell.options;
  const hiddenEquationEnabled =
    options.hiddenLeftVariable.trim() !== "" && options.hiddenRightVariable.trim() !== "";
  const issuePaths = Object.keys(issueMap);
  const [isEditingSolver, setIsEditingSolver] = useState(false);
  const [draftOptions, setDraftOptions] = useState(cell.options);
  const hasDraftEdits = JSON.stringify(draftOptions) !== JSON.stringify(cell.options);

  useEffect(() => {
    onEditingChange?.(isEditingSolver);
  }, [isEditingSolver, onEditingChange]);

  useEffect(() => {
    if (!isEditingSolver) {
      setDraftOptions(cell.options);
    }
  }, [cell.options, isEditingSolver]);

  function handleEditToggle(): void {
    setDraftOptions(cell.options);
    setIsEditingSolver(true);
  }

  function handleApply(): void {
    onChange(draftOptions);
    setIsEditingSolver(false);
  }

  function handleCancel(): void {
    setDraftOptions(cell.options);
    setIsEditingSolver(false);
  }

  return (
    <div className="notebook-model-stack notebook-linked-editor-cell">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingSolver}
            isPinnedInPanel={isPinnedInPanel}
            onApply={handleApply}
            onCancel={handleCancel}
            onEditToggle={handleEditToggle}
            onHelpRequest={onHelpRequest}
            onPinCellRequest={onPinCellRequest}
            onToggleCollapsed={onToggleCollapsed}
            title={title}
          />
        }
        title={title}
        typeLabel={cell.type}
      >
        <div className="notebook-model-summary" aria-label="Solver summary">
          <span className="notebook-model-chip">
            Model <strong>{cell.modelId}</strong>
          </span>
          <span className="notebook-model-chip">
            Solver <strong>{options.solverMethod}</strong>
          </span>
          <span className="notebook-model-chip">
            Hidden <strong>{hiddenEquationEnabled ? "on" : "off"}</strong>
          </span>
          <span className="notebook-model-chip">
            Issues <strong>{countModelSectionIssues(issuePaths, "options.")}</strong>
          </span>
        </div>
      </NotebookLinkedEditorHeader>
      {cell.collapsed ? null : isEditingSolver ? (
        <div className="notebook-model-editor-body">
          <SolverPanel options={draftOptions} issues={issueMap} showPeriods={false} onChange={setDraftOptions} />
        </div>
      ) : (
        <section
          ref={solverViewDragScroll.dragScrollRef}
          className={`notebook-model-view notebook-oversize-scroll ${solverViewDragScroll.dragScrollProps.className}`}
          aria-label="Solver view"
          data-drag-scroll-ignore="true"
          onClickCapture={solverViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={solverViewDragScroll.dragScrollProps.onMouseDown}
        >
          <div className="notebook-model-view-header">
            <h3>Solver view</h3>
            <p className="panel-subtitle">
              Compact read-only simulation and hidden-equation settings.
            </p>
          </div>
          <div className="notebook-model-view-table" role="table" aria-label="Solver options">
            <div
              className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-solver"
              role="row"
            >
              <span role="columnheader">Setting</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">Status</span>
            </div>
            {[
              {
                label: "Solver",
                value: options.solverMethod,
                status: issueMap["options.solverMethod"] ? "Issue" : "OK"
              },
              {
                label: "Tolerance",
                value: options.toleranceText,
                status: issueMap["options.toleranceText"] ? "Issue" : "OK"
              },
              {
                label: "Max iterations",
                value: String(options.maxIterations),
                status: issueMap["options.maxIterations"] ? "Issue" : "OK"
              },
              {
                label: "Default initial",
                value: options.defaultInitialValueText,
                status: issueMap["options.defaultInitialValueText"] ? "Issue" : "OK"
              },
              {
                label: "Hidden equation",
                value: hiddenEquationEnabled
                  ? `${options.hiddenLeftVariable} = ${options.hiddenRightVariable}`
                  : "disabled",
                status: issueMap["options.hiddenEquation"] ? "Issue" : "OK"
              },
              {
                label: "Hidden tolerance",
                value: options.hiddenToleranceText,
                status: issueMap["options.hiddenToleranceText"] ? "Issue" : "OK"
              },
              {
                label: "Relative hidden tol.",
                value: options.relativeHiddenTolerance ? "true" : "false",
                status: "OK"
              }
            ].map((row) => (
              <div
                key={row.label}
                className={[
                  "notebook-model-view-row",
                  "notebook-model-view-row-solver",
                  row.status !== "OK" ? "has-issue" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="row"
              >
                <span className="notebook-model-view-name" role="cell">
                  {row.label}
                </span>
                <span className="notebook-model-view-expression" role="cell">
                  {row.value}
                </span>
                <span className="notebook-model-view-kind" role="cell">
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function ExternalsCellView({
  cell,
  cells,
  currentValues,
  editor,
  issueMap,
  isPinnedInPanel = false,
  onEditingChange,
  onHelpRequest,
  onReplaceCells,
  onVariableInspectRequest,
  highlightedVariable = null,
  title,
  onChange,
  onPinCellRequest,
  onToggleCollapsed,
  viewportRoot = null
}: {
  cell: ExternalsCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  editor: EditorState;
  issueMap: Record<string, string | undefined>;
  isPinnedInPanel?: boolean;
  highlightedVariable?: string | null;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  onReplaceCells(nextCells: NotebookCell[]): void;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  onPinCellRequest?: (() => void) | null;
  title: string;
  viewportRoot?: Element | null;
  onChange(externals: EditorState["externals"]): void;
  onToggleCollapsed(): void;
}) {
  const modelSource = { sourceModelId: cell.modelId };
  const externalsViewDragScroll = useDragScroll<HTMLElement>();
  const cellRootRef = useRef<HTMLDivElement | null>(null);
  const sectionWrapRef = useRef<HTMLElement | null>(null);
  const headerRowRef = useRef<HTMLDivElement | null>(null);
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const issuePaths = Object.keys(issueMap);
  const seriesExternalCount = cell.externals.filter(
    (external) => !isRowComment(external) && external.kind === "series"
  ).length;
  const variableDescriptions = useMemo(
    () => buildVariableDescriptions({ externals: cell.externals }),
    [cell.externals]
  );
  const variableUnitMetadata = useMemo(
    () => buildVariableUnitMetadata({ externals: cell.externals }),
    [cell.externals]
  );
  const [isEditingExternals, setIsEditingExternals] = useState(false);
  const [draftExternals, setDraftExternals] = useState(cell.externals);
  const hasDraftEdits = JSON.stringify(draftExternals) !== JSON.stringify(cell.externals);
  const floatingEnabled = cell.collapsed !== true && !isEditingExternals && viewportRoot != null;
  const { visible: floatingHeaderVisible, anchor: floatingHeaderAnchor } =
    useNotebookFloatingHeaderRow({
      scrollRoot: viewportRoot,
      headerRowRef,
      tableWrapRef: sectionWrapRef,
      cellRootRef,
      enabled: floatingEnabled
    });

  useEffect(() => {
    onEditingChange?.(isEditingExternals);
  }, [isEditingExternals, onEditingChange]);

  useEffect(() => {
    if (!isEditingExternals) {
      setDraftExternals(cell.externals);
    }
  }, [cell.externals, isEditingExternals]);

  function handleEditToggle(): void {
    setDraftExternals(cell.externals);
    setIsEditingExternals(true);
  }

  function handleApply(): void {
    onChange(draftExternals);
    setIsEditingExternals(false);
  }

  function handleCancel(): void {
    setDraftExternals(cell.externals);
    setIsEditingExternals(false);
  }

  const commentEdit = useInlineCommentRowEdit({
    onChangeRows: onChange,
    rows: cell.externals
  });
  const inlineEdit = useInlineExternalRowEdit({
    cells,
    externals: cell.externals,
    onChangeExternals: onChange,
    onReplaceCells,
    scope: { kind: "modelId", modelId: cell.modelId }
  });
  const externalRowMenu = useGridRowContextMenu({
    ignoredSelector: "select",
    onChangeRows: (externals) => {
      inlineEdit.cancelRowEdit();
      commentEdit.cancelRowEdit();
      onChange(externals);
    },
    rows: cell.externals
  });

  return (
    <div ref={cellRootRef} className="notebook-model-stack notebook-linked-editor-cell">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingExternals}
            isPinnedInPanel={isPinnedInPanel}
            onApply={handleApply}
            onCancel={handleCancel}
            onEditToggle={handleEditToggle}
            onHelpRequest={onHelpRequest}
            onPinCellRequest={onPinCellRequest}
            onToggleCollapsed={onToggleCollapsed}
            title={title}
          />
        }
        title={title}
        typeLabel={cell.type}
      >
        <div className="notebook-model-summary" aria-label="Externals summary">
          <span className="notebook-model-chip">
            Model <strong>{cell.modelId}</strong>
          </span>
          <span className="notebook-model-chip">
            Ext <strong>{countDataRows(cell.externals)}</strong>
          </span>
          <span className="notebook-model-chip">
            Series <strong>{seriesExternalCount}</strong>
          </span>
          <span className="notebook-model-chip">
            Issues <strong>{countModelSectionIssues(issuePaths, "externals.")}</strong>
          </span>
        </div>
      </NotebookLinkedEditorHeader>
      {cell.collapsed ? null : isEditingExternals ? (
        <div className="notebook-model-editor-body">
          <ExternalEditor
            currentValues={currentValues}
            externals={draftExternals}
            isEmbedded
            issues={issueMap}
            onChange={setDraftExternals}
            showHeading={false}
          />
        </div>
      ) : (
        <section
          ref={(node) => {
            externalsViewDragScroll.dragScrollRef.current = node;
            sectionWrapRef.current = node;
          }}
          className={`notebook-model-view notebook-oversize-scroll ${externalsViewDragScroll.dragScrollProps.className}`}
          aria-label="Externals view"
          data-drag-scroll-ignore="true"
          onClickCapture={externalsViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={externalsViewDragScroll.dragScrollProps.onMouseDown}
        >
          <NotebookModelViewTable
            ariaLabel="Externals"
            headerRowRef={headerRowRef}
            layout="external-view"
            tableShellRef={tableShellRef}
          >
            {cell.externals.map((row, index) => {
              if (isRowComment(row)) {
                return (
                  <CommentRowReadView
                    key={row.id}
                    commentEdit={commentEdit}
                    index={index}
                    row={row}
                    onCancelDataRowEdit={inlineEdit.cancelRowEdit}
                    onContextMenu={externalRowMenu.handleRowContextMenu}
                  />
                );
              }

              const external = row;
              const issue =
                issueMap[`externals.${index}.name`] ??
                issueMap[`externals.${index}.valueText`] ??
                issueMap[`externals.${index}.kind`];

              return (
                <NotebookExternalReadRow
                  key={external.id}
                  currentValues={currentValues}
                  external={external}
                  externalIndex={index}
                  highlightedVariable={highlightedVariable}
                  isEditing={inlineEdit.editingExternalId === external.id}
                  issueMessage={issue}
                  onContextMenu={(event) => {
                    if (inlineEdit.editingExternalId === external.id) {
                      return;
                    }
                    externalRowMenu.handleRowContextMenu(event, index);
                  }}
                  rowDraft={{
                    name: inlineEdit.draftName,
                    valueText: inlineEdit.draftValueText
                  }}
                  rowEditFocus={inlineEdit.editFocus}
                  rowValidationError={inlineEdit.validationError}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                  onApplyRow={inlineEdit.applyRowEdit}
                  onBeginRowEdit={(externalId, focus) => {
                    commentEdit.cancelRowEdit();
                    inlineEdit.beginRowEdit(externalId, focus);
                  }}
                  onCancelRow={inlineEdit.cancelRowEdit}
                  onDraftNameChange={inlineEdit.setDraftName}
                  onDraftValueTextChange={inlineEdit.setDraftValueText}
                  onInspectVariable={(selectedVariable) =>
                    onVariableInspectRequest({
                      currentValues,
                      editor,
                      modelSource,
                      selectedVariable,
                      variableDescriptions,
                      variableUnitMetadata
                    })
                  }
                />
              );
            })}
          </NotebookModelViewTable>
          {externalRowMenu.rowContextMenu ? (
            <GridRowContextMenu
              addCommentLabel="Add section comment"
              addItemLabel="Add external"
              canMoveDown={canMoveRowDown(cell.externals, externalRowMenu.rowContextMenu.rowIndex)}
              canMoveUp={canMoveRowUp(cell.externals, externalRowMenu.rowContextMenu.rowIndex)}
              menuRef={externalRowMenu.rowContextMenuRef}
              menuTypeLabel="External"
              onAdd={() =>
                externalRowMenu.insertRowBelow(
                  externalRowMenu.rowContextMenu!.rowIndex,
                  newExternalRow()
                )
              }
              onAddComment={() =>
                externalRowMenu.insertRowBelow(externalRowMenu.rowContextMenu!.rowIndex, newRowComment())
              }
              onDelete={() => externalRowMenu.requestDelete(externalRowMenu.rowContextMenu!.rowIndex)}
              onMoveDown={() => externalRowMenu.moveRowAt(externalRowMenu.rowContextMenu!.rowIndex, 1)}
              onMoveUp={() => externalRowMenu.moveRowAt(externalRowMenu.rowContextMenu!.rowIndex, -1)}
              rowIndex={externalRowMenu.rowContextMenu.rowIndex}
            />
          ) : null}
          {externalRowMenu.deleteDialogRowIndex != null ? (
            <GridRowDeleteDialog
              deleteTitle={
                isRowComment(cell.externals[externalRowMenu.deleteDialogRowIndex])
                  ? "Delete section comment?"
                  : "Delete external?"
              }
              itemLabel={formatExternalDeleteLabel(
                cell.externals[externalRowMenu.deleteDialogRowIndex],
                externalRowMenu.deleteDialogRowIndex
              )}
              onCancel={externalRowMenu.cancelDelete}
              onConfirm={externalRowMenu.confirmDelete}
            />
          ) : null}
        </section>
      )}
      <NotebookFloatingHeaderOverlay
        visible={floatingHeaderVisible}
        anchor={floatingHeaderAnchor}
        horizontalScrollSourceRef={sectionWrapRef}
        resizableTableSourceRef={tableShellRef}
      >
        <ExternalsModelViewHeaderRowStatic />
      </NotebookFloatingHeaderOverlay>
      <VariableRenameDialog
        cellCount={inlineEdit.renameReferenceCount.cellCount}
        isOpen={inlineEdit.renameDialog != null}
        newName={inlineEdit.renameDialog?.name ?? ""}
        oldName={inlineEdit.renameDialog?.oldName ?? ""}
        referenceCount={inlineEdit.renameReferenceCount.referenceCount}
        onCancel={inlineEdit.cancelRowEdit}
        onConfirmNo={inlineEdit.confirmRenameNo}
        onConfirmYes={inlineEdit.confirmRenameYes}
      />
    </div>
  );
}

export function InitialValuesCellView({
  cell,
  currentValues,
  editor,
  issueMap,
  isPinnedInPanel = false,
  onEditingChange,
  onHelpRequest,
  onVariableInspectRequest,
  highlightedVariable = null,
  title,
  variableDescriptions,
  variableUnitMetadata,
  onChange,
  onPinCellRequest,
  onToggleCollapsed,
  viewportRoot = null
}: {
  cell: InitialValuesCell;
  currentValues: Record<string, number | undefined>;
  editor: EditorState;
  issueMap: Record<string, string | undefined>;
  isPinnedInPanel?: boolean;
  highlightedVariable?: string | null;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  onPinCellRequest?: (() => void) | null;
  title: string;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  viewportRoot?: Element | null;
  onChange(initialValues: EditorState["initialValues"]): void;
  onToggleCollapsed(): void;
}) {
  const modelSource = { sourceModelId: cell.modelId };
  const initialValuesViewDragScroll = useDragScroll<HTMLElement>();
  const cellRootRef = useRef<HTMLDivElement | null>(null);
  const sectionWrapRef = useRef<HTMLElement | null>(null);
  const headerRowRef = useRef<HTMLDivElement | null>(null);
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const issuePaths = Object.keys(issueMap);
  const [isEditingInitialValues, setIsEditingInitialValues] = useState(false);
  const [draftInitialValues, setDraftInitialValues] = useState(cell.initialValues);
  const hasDraftEdits =
    JSON.stringify(draftInitialValues) !== JSON.stringify(cell.initialValues);
  const floatingEnabled = cell.collapsed !== true && !isEditingInitialValues && viewportRoot != null;
  const { visible: floatingHeaderVisible, anchor: floatingHeaderAnchor } =
    useNotebookFloatingHeaderRow({
      scrollRoot: viewportRoot,
      headerRowRef,
      tableWrapRef: sectionWrapRef,
      cellRootRef,
      enabled: floatingEnabled
    });

  useEffect(() => {
    onEditingChange?.(isEditingInitialValues);
  }, [isEditingInitialValues, onEditingChange]);

  useEffect(() => {
    if (!isEditingInitialValues) {
      setDraftInitialValues(cell.initialValues);
    }
  }, [cell.initialValues, isEditingInitialValues]);

  function handleEditToggle(): void {
    setDraftInitialValues(cell.initialValues);
    setIsEditingInitialValues(true);
  }

  function handleApply(): void {
    onChange(draftInitialValues);
    setIsEditingInitialValues(false);
  }

  function handleCancel(): void {
    setDraftInitialValues(cell.initialValues);
    setIsEditingInitialValues(false);
  }

  const commentEdit = useInlineCommentRowEdit({
    onChangeRows: onChange,
    rows: cell.initialValues
  });
  const inlineEdit = useInlineInitialValueRowEdit({
    initialValues: cell.initialValues,
    onChangeInitialValues: onChange
  });
  const initialValueRowMenu = useGridRowContextMenu({
    ignoredSelector: "select",
    onChangeRows: (initialValues) => {
      inlineEdit.cancelRowEdit();
      commentEdit.cancelRowEdit();
      onChange(initialValues);
    },
    rows: cell.initialValues
  });

  return (
    <div ref={cellRootRef} className="notebook-model-stack notebook-linked-editor-cell">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingInitialValues}
            isPinnedInPanel={isPinnedInPanel}
            onApply={handleApply}
            onCancel={handleCancel}
            onEditToggle={handleEditToggle}
            onHelpRequest={onHelpRequest}
            onPinCellRequest={onPinCellRequest}
            onToggleCollapsed={onToggleCollapsed}
            title={title}
          />
        }
        title={title}
        typeLabel={cell.type}
      >
        <div className="notebook-model-summary" aria-label="Initial values summary">
          <span className="notebook-model-chip">
            Model <strong>{cell.modelId}</strong>
          </span>
          <span className="notebook-model-chip">
            Init <strong>{countDataRows(cell.initialValues)}</strong>
          </span>
          <span className="notebook-model-chip">
            Populated{" "}
            <strong>
              {
                cell.initialValues.filter(
                  (initialValue) =>
                    !isRowComment(initialValue) && initialValue.valueText.trim() !== ""
                ).length
              }
            </strong>
          </span>
          <span className="notebook-model-chip">
            Issues <strong>{countModelSectionIssues(issuePaths, "initialValues.")}</strong>
          </span>
        </div>
      </NotebookLinkedEditorHeader>
      {cell.collapsed ? null : isEditingInitialValues ? (
        <div className="notebook-model-editor-body">
          <InitialValuesEditor
            currentValues={currentValues}
            highlightedVariable={highlightedVariable}
            initialValues={draftInitialValues}
            isEmbedded
            issues={issueMap}
            onChange={setDraftInitialValues}
            onSelectVariable={(selectedVariable) =>
              onVariableInspectRequest({
                currentValues,
                editor: { ...editor, initialValues: draftInitialValues },
                modelSource,
                selectedVariable,
                variableDescriptions,
                variableUnitMetadata
              })
            }
            showHeading={false}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      ) : (
        <section
          ref={(node) => {
            initialValuesViewDragScroll.dragScrollRef.current = node;
            sectionWrapRef.current = node;
          }}
          className={`notebook-model-view notebook-oversize-scroll ${initialValuesViewDragScroll.dragScrollProps.className}`}
          aria-label="Initial values view"
          data-drag-scroll-ignore="true"
          onClickCapture={initialValuesViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={initialValuesViewDragScroll.dragScrollProps.onMouseDown}
        >
          <NotebookModelViewTable
            ariaLabel="Initial values"
            headerRowRef={headerRowRef}
            layout="initial-view"
            tableShellRef={tableShellRef}
          >
            {cell.initialValues.map((row, index) => {
              if (isRowComment(row)) {
                return (
                  <CommentRowReadView
                    key={row.id}
                    commentEdit={commentEdit}
                    index={index}
                    row={row}
                    onCancelDataRowEdit={inlineEdit.cancelRowEdit}
                    onContextMenu={initialValueRowMenu.handleRowContextMenu}
                  />
                );
              }

              const initialValue = row;
              const issue =
                issueMap[`initialValues.${index}.name`] ??
                issueMap[`initialValues.${index}.valueText`];

              return (
                <NotebookInitialValueReadRow
                  key={initialValue.id}
                  currentValues={currentValues}
                  highlightedVariable={highlightedVariable}
                  initialValue={initialValue}
                  initialValueIndex={index}
                  isEditing={inlineEdit.editingInitialValueId === initialValue.id}
                  issueMessage={issue}
                  onContextMenu={(event) => {
                    if (inlineEdit.editingInitialValueId === initialValue.id) {
                      return;
                    }
                    initialValueRowMenu.handleRowContextMenu(event, index);
                  }}
                  rowDraft={{
                    name: inlineEdit.draftName,
                    valueText: inlineEdit.draftValueText
                  }}
                  rowEditFocus={inlineEdit.editFocus}
                  rowValidationError={inlineEdit.validationError}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                  onApplyRow={inlineEdit.applyRowEdit}
                  onBeginRowEdit={(initialValueId, focus) => {
                    commentEdit.cancelRowEdit();
                    inlineEdit.beginRowEdit(initialValueId, focus);
                  }}
                  onCancelRow={inlineEdit.cancelRowEdit}
                  onDraftNameChange={inlineEdit.setDraftName}
                  onDraftValueTextChange={inlineEdit.setDraftValueText}
                  onInspectVariable={(selectedVariable) =>
                    onVariableInspectRequest({
                      currentValues,
                      editor: { ...editor, initialValues: cell.initialValues },
                      modelSource,
                      selectedVariable,
                      variableDescriptions,
                      variableUnitMetadata
                    })
                  }
                />
              );
            })}
          </NotebookModelViewTable>
          {initialValueRowMenu.rowContextMenu ? (
            <GridRowContextMenu
              addCommentLabel="Add section comment"
              addItemLabel="Add initial value"
              canMoveDown={canMoveRowDown(cell.initialValues, initialValueRowMenu.rowContextMenu.rowIndex)}
              canMoveUp={canMoveRowUp(cell.initialValues, initialValueRowMenu.rowContextMenu.rowIndex)}
              menuRef={initialValueRowMenu.rowContextMenuRef}
              menuTypeLabel="Initial value"
              onAdd={() =>
                initialValueRowMenu.insertRowBelow(
                  initialValueRowMenu.rowContextMenu!.rowIndex,
                  newInitialValueRow()
                )
              }
              onAddComment={() =>
                initialValueRowMenu.insertRowBelow(
                  initialValueRowMenu.rowContextMenu!.rowIndex,
                  newRowComment()
                )
              }
              onDelete={() =>
                initialValueRowMenu.requestDelete(initialValueRowMenu.rowContextMenu!.rowIndex)
              }
              onMoveDown={() =>
                initialValueRowMenu.moveRowAt(initialValueRowMenu.rowContextMenu!.rowIndex, 1)
              }
              onMoveUp={() =>
                initialValueRowMenu.moveRowAt(initialValueRowMenu.rowContextMenu!.rowIndex, -1)
              }
              rowIndex={initialValueRowMenu.rowContextMenu.rowIndex}
            />
          ) : null}
          {initialValueRowMenu.deleteDialogRowIndex != null ? (
            <GridRowDeleteDialog
              deleteTitle={
                isRowComment(cell.initialValues[initialValueRowMenu.deleteDialogRowIndex])
                  ? "Delete section comment?"
                  : "Delete initial value?"
              }
              itemLabel={formatInitialValueDeleteLabel(
                cell.initialValues[initialValueRowMenu.deleteDialogRowIndex],
                initialValueRowMenu.deleteDialogRowIndex
              )}
              onCancel={initialValueRowMenu.cancelDelete}
              onConfirm={initialValueRowMenu.confirmDelete}
            />
          ) : null}
        </section>
      )}
      <NotebookFloatingHeaderOverlay
        visible={floatingHeaderVisible}
        anchor={floatingHeaderAnchor}
        horizontalScrollSourceRef={sectionWrapRef}
        resizableTableSourceRef={tableShellRef}
      >
        <InitialValuesModelViewHeaderRowStatic />
      </NotebookFloatingHeaderOverlay>
    </div>
  );
}

function newExternalRow() {
  return {
    id: `ext-${crypto.randomUUID()}`,
    name: "",
    desc: "",
    kind: "constant" as const,
    valueText: ""
  };
}

function formatExternalDeleteLabel(row: ExternalListItem | undefined, rowIndex: number): string {
  if (!row) {
    return `Row ${rowIndex + 1}`;
  }
  if (isRowComment(row)) {
    return formatCompactRowCommentText(row.text);
  }
  const name = row.name.trim();
  return name ? name : `External ${rowIndex + 1}`;
}

function formatInitialValueDeleteLabel(
  row: InitialValueListItem | undefined,
  rowIndex: number
): string {
  if (!row) {
    return `Row ${rowIndex + 1}`;
  }
  if (isRowComment(row)) {
    return formatCompactRowCommentText(row.text);
  }
  const name = row.name.trim();
  return name ? name : `Initial value ${rowIndex + 1}`;
}

function newInitialValueRow() {
  return {
    id: `init-${crypto.randomUUID()}`,
    name: "",
    desc: "",
    valueText: ""
  };
}
