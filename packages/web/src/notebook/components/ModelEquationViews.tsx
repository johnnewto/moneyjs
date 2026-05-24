import { useEffect, useMemo, useState } from "react";

import { analyzeParsedEquation, parseEquation, type EquationRole } from "@sfcr/core";

import { EquationGridEditor } from "../../components/EquationGridEditor";
import { buildActiveTrace, buildTraceModel, type PinnedTrace } from "../../components/EquationGridEditor";
import { useInlineEquationRowEdit } from "../useInlineEquationRowEdit";
import {
  NotebookEquationReadRow,
  schedulePinnedTraceToggle,
  useDeferredAction,
  VariableRenameDialog
} from "./EquationRowInlineEditor";
import { buildRuntimeConfig, diagnoseBuildRuntime, validateEditorState, type EditorState } from "../../lib/editorModel";
import { buildVariableDescriptions, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../../lib/units";
import { useDragScroll } from "../../hooks/useDragScroll";
import { buildEditorStateFromSections, countModelSectionIssues, findEquationsCell, findExternalsCell, findInitialValuesCell, findSolverCell } from "../modelSections";
import type { VariableInspectRequest } from "../../lib/variableInspect";
import type { EquationsCell, ExternalsCell, ModelCell, NotebookCell, SolverCell } from "../types";
import { NotebookLinkedEditorActions, NotebookLinkedEditorHeader } from "./NotebookCellHeader";
import { NotebookEquationViewTable } from "./NotebookEquationViewTable";

export function ModelCellView({
  cell,
  cells,
  currentValues,
  onEditingChange,
  onHelpRequest,
  onChange,
  onReplaceCells,
  onToggleCollapsed,
  onVariableInspectRequest,
  title
}: {
  cell: ModelCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  onChange(editor: EditorState): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  onToggleCollapsed(): void;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  title: string;
}) {
  const modelSource = { sourceModelCellId: cell.id };
  const modelViewDragScroll = useDragScroll<HTMLElement>();
  const [draftEditor, setDraftEditor] = useState(cell.editor);
  const issues = validateEditorState(draftEditor);
  const buildDiagnostics = diagnoseBuildRuntime(draftEditor);
  const allIssues = [...issues, ...buildDiagnostics.issues];
  const issueMap = Object.fromEntries(allIssues.map((issue) => [issue.path, issue.message]));
  const equationIssueMap = Object.fromEntries(
    allIssues
      .filter((issue) => issue.path.startsWith("equations."))
      .map((issue) => [issue.path, issue])
  );
  const runtime = safeBuildRuntime(cell.editor);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<PinnedTrace | null>(null);
  const parameterNameSet = useMemo(
    () => new Set(draftEditor.externals.map((external) => external.name)),
    [draftEditor.externals]
  );
  const variableDescriptions = useMemo(
    () =>
      buildVariableDescriptions({
        equations: draftEditor.equations,
        externals: draftEditor.externals
      }),
    [draftEditor.equations, draftEditor.externals]
  );
  const variableUnitMetadata = useMemo(
    () =>
      buildVariableUnitMetadata({
        equations: draftEditor.equations,
        externals: draftEditor.externals
      }),
    [draftEditor.equations, draftEditor.externals]
  );
  const traceModel = useMemo(() => buildTraceModel(draftEditor.equations), [draftEditor.equations]);
  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "inputs")
      : null;
  const [isEditingEquations, setIsEditingEquations] = useState(false);
  const hasDraftEdits = JSON.stringify(draftEditor) !== JSON.stringify(cell.editor);

  useEffect(() => {
    onEditingChange?.(isEditingEquations);
  }, [isEditingEquations, onEditingChange]);

  useEffect(() => {
    if (!isEditingEquations) {
      setDraftEditor(cell.editor);
    }
  }, [cell.editor, isEditingEquations]);

  function handleEditToggle(): void {
    setDraftEditor(cell.editor);
    setIsEditingEquations(true);
  }

  function handleApply(): void {
    onChange(draftEditor);
    setIsEditingEquations(false);
  }

  function handleCancel(): void {
    setDraftEditor(cell.editor);
    setIsEditingEquations(false);
  }

  const inlineEdit = useInlineEquationRowEdit({
    cells,
    equations: cell.editor.equations,
    onChangeEquations: (equations) => onChange({ ...cell.editor, equations }),
    onReplaceCells,
    scope: { kind: "legacyModelCell", cellId: cell.id }
  });
  const { scheduleDeferredAction } = useDeferredAction();

  return (
    <div className="notebook-model-stack">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingEquations}
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
        <div className="notebook-model-summary" aria-label="Model summary">
          <span className="notebook-model-chip">
            Eq <strong>{cell.editor.equations.length}</strong>
          </span>
          <span className="notebook-model-chip">
            Ext <strong>{cell.editor.externals.length}</strong>
          </span>
          <span className="notebook-model-chip">
            Init <strong>{cell.editor.initialValues.length}</strong>
          </span>
          <span className="notebook-model-chip">
            Solver <strong>{cell.editor.options.solverMethod}</strong>
          </span>
          <span className="notebook-model-chip">
            Hidden <strong>{runtime?.options.hiddenEquation ? "on" : "off"}</strong>
          </span>
          <span className="notebook-model-chip">
            Shocks <strong>{runtime?.scenario?.shocks.length ?? 0}</strong>
          </span>
          <span className="notebook-model-chip">
            Issues <strong>{allIssues.length}</strong>
          </span>
        </div>
      </NotebookLinkedEditorHeader>

      {cell.collapsed ? null : isEditingEquations ? (
        <div className="notebook-model-editor-body">
          <EquationGridEditor
            buildError={buildDiagnostics.modelError}
            currentValues={currentValues}
            equations={draftEditor.equations}
            isEmbedded
            issues={equationIssueMap}
            onChange={(equations) => setDraftEditor((current) => ({ ...current, equations }))}
            onSelectVariable={(selectedVariable) =>
              onVariableInspectRequest({
                currentValues,
                editor: draftEditor,
                modelSource,
                selectedVariable,
                variableDescriptions,
                variableUnitMetadata
              })
            }
            parameterNames={draftEditor.externals.map((external) => external.name)}
            showHeading={false}
            showTraceHelp={false}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      ) : (
        <section
          ref={modelViewDragScroll.dragScrollRef}
          className={`notebook-model-view notebook-oversize-scroll ${modelViewDragScroll.dragScrollProps.className}`}
          aria-label="Model view"
          data-drag-scroll-ignore="true"
          onClickCapture={modelViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={modelViewDragScroll.dragScrollProps.onMouseDown}
        >
          <NotebookEquationViewTable ariaLabel="Model equations">
            {cell.editor.equations.map((equation, index) => {
              const issue =
                issueMap[`equations.${index}.name`] ?? issueMap[`equations.${index}.expression`];

              return (
                <NotebookEquationReadRow
                  key={equation.id}
                  activeTraceTokenStates={activeTrace?.tokenStates}
                  currentValues={currentValues}
                  equation={equation}
                  equationIndex={index}
                  formatRoleLabel={formatEquationRoleLabel}
                  hoveredRowId={hoveredRowId}
                  isEditing={inlineEdit.editingEquationId === equation.id}
                  issueMessage={issue}
                  parameterNames={parameterNameSet}
                  rowDraft={{
                    expression: inlineEdit.draftExpression,
                    name: inlineEdit.draftName
                  }}
                  rowEditFocus={inlineEdit.editFocus}
                  rowValidationError={inlineEdit.validationError}
                  traceRole={activeTrace?.rowStates.get(equation.id) ?? null}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                  onApplyRow={inlineEdit.applyRowEdit}
                  onBeginRowEdit={inlineEdit.beginRowEdit}
                  onCancelRow={inlineEdit.cancelRowEdit}
                  onDraftExpressionChange={inlineEdit.setDraftExpression}
                  onDraftNameChange={inlineEdit.setDraftName}
                  onInspectVariable={(selectedVariable) =>
                    onVariableInspectRequest({
                      currentValues,
                      editor: cell.editor,
                      modelSource,
                      selectedVariable,
                      variableDescriptions,
                      variableUnitMetadata
                    })
                  }
                  onRowClick={(event) =>
                    schedulePinnedTraceToggle(scheduleDeferredAction, setPinnedTrace, equation.id, event)
                  }
                  onRowMouseEnter={() => setHoveredRowId(equation.id)}
                  onRowMouseLeave={() =>
                    setHoveredRowId((current) => (current === equation.id ? null : current))
                  }
                  onSelectVariableInExpression={(selectedVariable) =>
                    scheduleDeferredAction(() =>
                      onVariableInspectRequest({
                        currentValues,
                        editor: cell.editor,
                        modelSource,
                        selectedVariable,
                        variableDescriptions,
                        variableUnitMetadata
                      })
                    )
                  }
                />
              );
            })}
          </NotebookEquationViewTable>
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

export function EquationsCellView({
  cell,
  cells,
  currentValues,
  externals,
  initialValuesCount,
  onEditingChange,
  onHelpRequest,
  onVariableInspectRequest,
  onReplaceCells,
  selectedPeriodIndex,
  solverCell,
  title,
  onChange,
  onToggleCollapsed
}: {
  cell: EquationsCell;
  cells: NotebookCell[];
  currentValues: Record<string, number | undefined>;
  externals: ExternalsCell["externals"];
  initialValuesCount: number;
  onEditingChange?(isEditing: boolean): void;
  onHelpRequest?: (() => void) | null;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  selectedPeriodIndex: number;
  solverCell: SolverCell | null;
  title: string;
  onChange(equations: EquationsCell["equations"]): void;
  onToggleCollapsed(): void;
}) {
  const modelSource = { sourceModelId: cell.modelId };
  const equationsViewDragScroll = useDragScroll<HTMLElement>();
  const [draftEquations, setDraftEquations] = useState(cell.equations);
  const editor = buildEditorStateFromSections({
    equations: draftEquations,
    externals,
    initialValues: [],
    options:
      solverCell?.options ?? {
        periods: 100,
        solverMethod: "GAUSS_SEIDEL",
        toleranceText: "1e-15",
        maxIterations: 200,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "0.00001",
        relativeHiddenTolerance: false
      }
  });
  const issues = validateEditorState(editor);
  const buildDiagnostics = diagnoseBuildRuntime(editor);
  const allIssues = [...issues, ...buildDiagnostics.issues];
  const issueMap = Object.fromEntries(allIssues.map((issue) => [issue.path, issue.message]));
  const equationIssueMap = Object.fromEntries(
    allIssues
      .filter((issue) => issue.path.startsWith("equations."))
      .map((issue) => [issue.path, issue])
  );
  const runtime = safeBuildRuntime(editor);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<PinnedTrace | null>(null);
  const parameterNameSet = useMemo(() => new Set(externals.map((external) => external.name)), [externals]);
  const variableDescriptions = useMemo(
    () =>
      buildVariableDescriptions({
        equations: draftEquations,
        externals
      }),
    [draftEquations, externals]
  );
  const variableUnitMetadata = useMemo(
    () =>
      buildVariableUnitMetadata({
        equations: draftEquations,
        externals
      }),
    [draftEquations, externals]
  );
  const traceModel = useMemo(() => buildTraceModel(draftEquations), [draftEquations]);
  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "inputs")
      : null;
  const [isEditingEquations, setIsEditingEquations] = useState(false);
  const [showExternalValues, setShowExternalValues] = useState(true);
  const hasDraftEdits = JSON.stringify(draftEquations) !== JSON.stringify(cell.equations);
  const externalDisplayValues = useMemo(
    () => buildExternalDisplayValues(externals, selectedPeriodIndex),
    [externals, selectedPeriodIndex]
  );

  useEffect(() => {
    onEditingChange?.(isEditingEquations);
  }, [isEditingEquations, onEditingChange]);

  useEffect(() => {
    if (!isEditingEquations) {
      setDraftEquations(cell.equations);
    }
  }, [cell.equations, isEditingEquations]);

  function handleEditToggle(): void {
    setDraftEquations(cell.equations);
    setIsEditingEquations(true);
  }

  function handleApply(): void {
    onChange(draftEquations);
    setIsEditingEquations(false);
  }

  function handleCancel(): void {
    setDraftEquations(cell.equations);
    setIsEditingEquations(false);
  }

  const inlineEdit = useInlineEquationRowEdit({
    cells,
    equations: cell.equations,
    onChangeEquations: onChange,
    onReplaceCells,
    scope: { kind: "modelId", modelId: cell.modelId }
  });
  const { scheduleDeferredAction } = useDeferredAction();

  return (
    <div className="notebook-model-stack">
      <NotebookLinkedEditorHeader
        actions={
          <NotebookLinkedEditorActions
            cell={cell}
            extraActions={
              !isEditingEquations && cell.collapsed !== true ? (
                <button
                  type="button"
                  className="notebook-run-button"
                  aria-pressed={showExternalValues ? "true" : "false"}
                  onClick={() => setShowExternalValues((current) => !current)}
                >
                  {showExternalValues ? "Show external names" : "Show external values"}
                </button>
              ) : null
            }
            hasDraftEdits={hasDraftEdits}
            isEditing={isEditingEquations}
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
        <div className="notebook-model-summary" aria-label="Equations summary">
          <span className="notebook-model-chip">
            Eq <strong>{cell.equations.length}</strong>
          </span>
          <span className="notebook-model-chip">
            Ext <strong>{externals.length}</strong>
          </span>
          <span className="notebook-model-chip">
            Init <strong>{initialValuesCount}</strong>
          </span>
          <span className="notebook-model-chip">
            Solver <strong>{solverCell?.options.solverMethod ?? "missing"}</strong>
          </span>
          <span className="notebook-model-chip">
            Hidden <strong>{runtime?.options.hiddenEquation ? "on" : "off"}</strong>
          </span>
          <span className="notebook-model-chip">
            Issues{" "}
            <strong>
              {countModelSectionIssues(allIssues.map((issue) => issue.path), "equations.")}
            </strong>
          </span>
        </div>
      </NotebookLinkedEditorHeader>
      {cell.collapsed ? null : isEditingEquations ? (
        <div className="notebook-model-editor-body">
          <EquationGridEditor
            buildError={buildDiagnostics.modelError}
            currentValues={currentValues}
            equations={draftEquations}
            isEmbedded
            issues={equationIssueMap}
            onChange={setDraftEquations}
            onSelectVariable={(selectedVariable) =>
              onVariableInspectRequest({
                currentValues,
                editor,
                modelSource,
                selectedVariable,
                variableDescriptions,
                variableUnitMetadata
              })
            }
            parameterNames={externals.map((external) => external.name)}
            showHeading={false}
            showTraceHelp={false}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      ) : (
        <section
          ref={equationsViewDragScroll.dragScrollRef}
          className={`notebook-model-view notebook-oversize-scroll ${equationsViewDragScroll.dragScrollProps.className}`}
          aria-label="Model view"
          data-drag-scroll-ignore="true"
          onClickCapture={equationsViewDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={equationsViewDragScroll.dragScrollProps.onMouseDown}
        >
          <NotebookEquationViewTable ariaLabel="Model equations">
            {cell.equations.map((equation, index) => {
              const issue =
                issueMap[`equations.${index}.name`] ?? issueMap[`equations.${index}.expression`];

              return (
                <NotebookEquationReadRow
                  key={equation.id}
                  activeTraceTokenStates={activeTrace?.tokenStates}
                  currentValues={currentValues}
                  displayTokens={showExternalValues ? externalDisplayValues : undefined}
                  equation={equation}
                  equationIndex={index}
                  formatRoleLabel={formatEquationRoleLabel}
                  hoveredRowId={hoveredRowId}
                  isEditing={inlineEdit.editingEquationId === equation.id}
                  issueMessage={issue}
                  parameterNames={parameterNameSet}
                  rowDraft={{
                    expression: inlineEdit.draftExpression,
                    name: inlineEdit.draftName
                  }}
                  rowEditFocus={inlineEdit.editFocus}
                  rowValidationError={inlineEdit.validationError}
                  traceRole={activeTrace?.rowStates.get(equation.id) ?? null}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                  onApplyRow={inlineEdit.applyRowEdit}
                  onBeginRowEdit={inlineEdit.beginRowEdit}
                  onCancelRow={inlineEdit.cancelRowEdit}
                  onDraftExpressionChange={inlineEdit.setDraftExpression}
                  onDraftNameChange={inlineEdit.setDraftName}
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
                  onRowClick={(event) =>
                    schedulePinnedTraceToggle(scheduleDeferredAction, setPinnedTrace, equation.id, event)
                  }
                  onRowMouseEnter={() => setHoveredRowId(equation.id)}
                  onRowMouseLeave={() =>
                    setHoveredRowId((current) => (current === equation.id ? null : current))
                  }
                  onSelectVariableInExpression={(selectedVariable) =>
                    scheduleDeferredAction(() =>
                      onVariableInspectRequest({
                        currentValues,
                        editor,
                        modelSource,
                        selectedVariable,
                        variableDescriptions,
                        variableUnitMetadata
                      })
                    )
                  }
                />
              );
            })}
          </NotebookEquationViewTable>
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

function formatEquationRoleLabel(equation: {
  name: string;
  expression: string;
  desc?: string;
  role?: EquationRole;
}): string {
  const name = equation.name.trim();
  const expression = equation.expression.trim();
  if (!name || !expression) {
    return equation.role ? formatEquationRole(equation.role) : "Auto";
  }

  try {
    return formatEquationRole(
      analyzeParsedEquation(parseEquation(name, expression), {
        description: equation.desc?.trim(),
        explicitRole: equation.role
      }).role
    );
  } catch {
    return equation.role ? formatEquationRole(equation.role) : "Auto";
  }
}

function formatEquationRole(role: EquationRole): string {
  switch (role) {
    case "accumulation":
      return "Accumulation";
    case "identity":
      return "Identity";
    case "target":
      return "Target";
    case "definition":
      return "Definition";
    case "behavioral":
      return "Behavioral";
  }
}

function buildExternalDisplayValues(
  externals: ExternalsCell["externals"],
  selectedPeriodIndex: number
): Map<string, string> {
  return new Map(
    externals.map((external) => [
      external.name,
      formatExternalValueLabel(external, selectedPeriodIndex)
    ])
  );
}

function formatExternalValueLabel(
  external: ExternalsCell["externals"][number],
  selectedPeriodIndex: number
): string {
  if (external.kind === "constant") {
    const constantValue = Number(external.valueText.trim());
    return Number.isFinite(constantValue)
      ? constantValue.toLocaleString(undefined, { maximumFractionDigits: 6 })
      : external.valueText;
  }

  const values = external.valueText
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  const value = values[Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0))];
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "--";
}

function safeBuildRuntime(editor: EditorState) {
  try {
    return buildRuntimeConfig(editor);
  } catch {
    return null;
  }
}

function defaultNotebookEditorOptions(): EditorState["options"] {
  return {
    periods: 100,
    solverMethod: "GAUSS_SEIDEL",
    toleranceText: "1e-15",
    maxIterations: 200,
    defaultInitialValueText: "1e-15",
    hiddenLeftVariable: "",
    hiddenRightVariable: "",
    hiddenToleranceText: "0.00001",
    relativeHiddenTolerance: false
  };
}

export function buildEditorStateForStandaloneModelSections(cells: NotebookCell[], modelId: string): EditorState {
  return buildEditorStateFromSections({
    equations: findEquationsCell(cells, modelId)?.equations ?? [],
    externals: findExternalsCell(cells, modelId)?.externals ?? [],
    initialValues: findInitialValuesCell(cells, modelId)?.initialValues ?? [],
    options: findSolverCell(cells, modelId)?.options ?? defaultNotebookEditorOptions()
  });
}

export function buildIssueMapForStandaloneModelSections(
  cells: NotebookCell[],
  modelId: string
): Record<string, string | undefined> {
  if (!findEquationsCell(cells, modelId)) {
    return {};
  }

  const editor = buildEditorStateForStandaloneModelSections(cells, modelId);

  return Object.fromEntries(
    [...validateEditorState(editor), ...diagnoseBuildRuntime(editor).issues].map((issue) => [
      issue.path,
      issue.message
    ])
  );
}
