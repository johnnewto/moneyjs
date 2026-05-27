import { useEffect, useMemo, useState } from "react";

import { ExternalEditor } from "../../components/ExternalEditor";
import { InitialValuesEditor } from "../../components/InitialValuesEditor";
import { SolverPanel } from "../../components/SolverPanel";
import type { EditorState } from "../../lib/editorModel";
import { buildVariableDescriptions, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../../lib/units";
import { useDragScroll } from "../../hooks/useDragScroll";
import type { VariableInspectRequest } from "../../lib/variableInspect";
import { countModelSectionIssues } from "../modelSections";
import { useInlineExternalRowEdit } from "../useInlineExternalRowEdit";
import { useInlineInitialValueRowEdit } from "../useInlineInitialValueRowEdit";
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

export function SolverCellView({
  cell,
  issueMap,
  onEditingChange,
  onHelpRequest,
  title,
  onChange,
  onToggleCollapsed
}: {
  cell: SolverCell;
  issueMap: Record<string, string | undefined>;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  title: string;
  onChange(options: EditorState["options"]): void;
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
            onApply={handleApply}
            onCancel={handleCancel}
            onEditToggle={handleEditToggle}
            onHelpRequest={onHelpRequest}
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
  onEditingChange,
  onHelpRequest,
  onReplaceCells,
  onVariableInspectRequest,
  highlightedVariable = null,
  title,
  onChange,
  onToggleCollapsed
}: {
  cell: ExternalsCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  editor: EditorState;
  issueMap: Record<string, string | undefined>;
  highlightedVariable?: string | null;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  onReplaceCells(nextCells: NotebookCell[]): void;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  title: string;
  onChange(externals: EditorState["externals"]): void;
  onToggleCollapsed(): void;
}) {
  const modelSource = { sourceModelId: cell.modelId };
  const externalsViewDragScroll = useDragScroll<HTMLElement>();
  const issuePaths = Object.keys(issueMap);
  const seriesExternalCount = cell.externals.filter((external) => external.kind === "series").length;
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
      onChange(externals);
    },
    rows: cell.externals
  });

  return (
    <div className="notebook-model-stack notebook-linked-editor-cell">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingExternals}
            onApply={handleApply}
            onCancel={handleCancel}
            onEditToggle={handleEditToggle}
            onHelpRequest={onHelpRequest}
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
            Ext <strong>{cell.externals.length}</strong>
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
          ref={externalsViewDragScroll.dragScrollRef}
          className={`notebook-model-view notebook-oversize-scroll ${externalsViewDragScroll.dragScrollProps.className}`}
          aria-label="Externals view"
          data-drag-scroll-ignore="true"
          onClickCapture={externalsViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={externalsViewDragScroll.dragScrollProps.onMouseDown}
        >
          <div className="notebook-model-view-table" role="table" aria-label="Externals">
            <div
              className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-external"
              role="row"
            >
              <span role="columnheader">Name</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">Current</span>
              <span role="columnheader">Kind</span>
            </div>
            {cell.externals.map((external, index) => {
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
                  onBeginRowEdit={inlineEdit.beginRowEdit}
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
          </div>
          {externalRowMenu.rowContextMenu ? (
            <GridRowContextMenu
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
              onDelete={() => externalRowMenu.requestDelete(externalRowMenu.rowContextMenu!.rowIndex)}
              onMoveDown={() => externalRowMenu.moveRowAt(externalRowMenu.rowContextMenu!.rowIndex, 1)}
              onMoveUp={() => externalRowMenu.moveRowAt(externalRowMenu.rowContextMenu!.rowIndex, -1)}
              rowIndex={externalRowMenu.rowContextMenu.rowIndex}
            />
          ) : null}
          {externalRowMenu.deleteDialogRowIndex != null ? (
            <GridRowDeleteDialog
              deleteTitle="Delete external?"
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
  onEditingChange,
  onHelpRequest,
  onVariableInspectRequest,
  highlightedVariable = null,
  title,
  variableDescriptions,
  variableUnitMetadata,
  onChange,
  onToggleCollapsed
}: {
  cell: InitialValuesCell;
  currentValues: Record<string, number | undefined>;
  editor: EditorState;
  issueMap: Record<string, string | undefined>;
  highlightedVariable?: string | null;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  title: string;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onChange(initialValues: EditorState["initialValues"]): void;
  onToggleCollapsed(): void;
}) {
  const modelSource = { sourceModelId: cell.modelId };
  const initialValuesViewDragScroll = useDragScroll<HTMLElement>();
  const issuePaths = Object.keys(issueMap);
  const [isEditingInitialValues, setIsEditingInitialValues] = useState(false);
  const [draftInitialValues, setDraftInitialValues] = useState(cell.initialValues);
  const hasDraftEdits =
    JSON.stringify(draftInitialValues) !== JSON.stringify(cell.initialValues);

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

  const inlineEdit = useInlineInitialValueRowEdit({
    initialValues: cell.initialValues,
    onChangeInitialValues: onChange
  });
  const initialValueRowMenu = useGridRowContextMenu({
    ignoredSelector: "select",
    onChangeRows: (initialValues) => {
      inlineEdit.cancelRowEdit();
      onChange(initialValues);
    },
    rows: cell.initialValues
  });

  return (
    <div className="notebook-model-stack notebook-linked-editor-cell">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingInitialValues}
            onApply={handleApply}
            onCancel={handleCancel}
            onEditToggle={handleEditToggle}
            onHelpRequest={onHelpRequest}
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
            Init <strong>{cell.initialValues.length}</strong>
          </span>
          <span className="notebook-model-chip">
            Populated{" "}
            <strong>
              {
                cell.initialValues.filter(
                  (initialValue) => initialValue.valueText.trim() !== ""
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
          ref={initialValuesViewDragScroll.dragScrollRef}
          className={`notebook-model-view notebook-oversize-scroll ${initialValuesViewDragScroll.dragScrollProps.className}`}
          aria-label="Initial values view"
          data-drag-scroll-ignore="true"
          onClickCapture={initialValuesViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={initialValuesViewDragScroll.dragScrollProps.onMouseDown}
        >
          <div className="notebook-model-view-table" role="table" aria-label="Initial values">
            <div
              className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-initial"
              role="row"
            >
              <span role="columnheader">Name</span>
              <span role="columnheader">Initial</span>
              <span role="columnheader">Current</span>
              <span role="columnheader">Status</span>
            </div>
            {cell.initialValues.map((initialValue, index) => {
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
                  onBeginRowEdit={inlineEdit.beginRowEdit}
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
          </div>
          {initialValueRowMenu.rowContextMenu ? (
            <GridRowContextMenu
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
              deleteTitle="Delete initial value?"
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

function formatExternalDeleteLabel(
  external: { name: string } | undefined,
  rowIndex: number
): string {
  const name = external?.name.trim();
  return name ? name : `External ${rowIndex + 1}`;
}

function newInitialValueRow() {
  return {
    id: `init-${crypto.randomUUID()}`,
    name: "",
    valueText: ""
  };
}

function formatInitialValueDeleteLabel(
  initialValue: { name: string } | undefined,
  rowIndex: number
): string {
  const name = initialValue?.name.trim();
  return name ? name : `Initial value ${rowIndex + 1}`;
}
