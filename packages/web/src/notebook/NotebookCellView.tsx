import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { evaluateExpression, parseExpression, type SimulationResult } from "@sfcr/core";

import { EquationGridEditor } from "../components/EquationGridEditor";
import {
  buildActiveTrace,
  buildTraceModel,
  highlightFormula,
  togglePinnedTrace,
  type PinnedTrace
} from "../components/EquationGridEditor";
import { ExternalEditor } from "../components/ExternalEditor";
import { InitialValuesEditor } from "../components/InitialValuesEditor";
import { ResultChart } from "../components/ResultChart";
import { ResultTable } from "../components/ResultTable";
import { SequenceDiagramCanvas } from "../components/SequenceDiagramCanvas";
import { SolverPanel } from "../components/SolverPanel";
import { InstantTooltip } from "../components/InstantTooltip";
import { VariableLabel } from "../components/VariableLabel";
import {
  buildRuntimeConfig,
  diagnoseBuildRuntime,
  validateEditorState,
  type EditorState
} from "../lib/editorModel";
import {
  buildVariableDescriptions,
  getVariableDescription,
  type VariableDescriptions
} from "../lib/variableDescriptions";
import { buildVariableUnitMetadata, inferUnits } from "../lib/units";
import { formatNamedValueWithUnits, formatValueWithUnits } from "../lib/unitMeta";
import {
  buildEditorStateForNotebookModel,
  buildEditorStateFromSections,
  countModelSectionIssues,
  findEquationsCell,
  findExternalsCell,
  findInitialValuesCell,
  findSolverCell
} from "./modelSections";
import { resolveSequenceDiagram } from "./sequence";
import {
  applySourceHelper,
  buildNotebookCellHelpText,
  buildSourceHelpText,
  buildSourceHelperActions,
  formatCellBody,
  highlightSourceDraft,
  isSourceEditable,
  parseCellSource,
  serializeCellBody
} from "./sourceEditing";
import type {
  ChartCell,
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  MatrixCell,
  ModelCell,
  NotebookCell,
  RunCell,
  SequenceCell,
  SolverCell,
  TableCell
} from "./types";
import { useNotebookRunner } from "./useNotebookRunner";

export interface NotebookCellViewProps {
  cell: NotebookCell;
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
  maxPeriodIndex: number;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  onModelChange(cellId: string, editor: EditorState): void;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
}

export function NotebookCellView({
  cell,
  cells,
  getModelCurrentValues,
  maxPeriodIndex,
  onSelectedPeriodIndexChange,
  runner,
  selectedPeriodIndex,
  onModelChange,
  onCellChange
}: NotebookCellViewProps) {
  const status = runner.status[cell.id] ?? "idle";
  const error = runner.errors[cell.id];
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [titleDraft, setTitleDraft] = useState(() => cell.title);
  const [sourceDraft, setSourceDraft] = useState(() => serializeCellBody(cell));
  const [sourceLayoutMode, setSourceLayoutMode] = useState<"pretty" | "compact">("compact");
  const [openSourceMenu, setOpenSourceMenu] = useState<"insert" | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceValidationError, setSourceValidationError] = useState<string | null>(null);
  const insertMenuRef = useRef<HTMLDivElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceHighlightRef = useRef<HTMLPreElement | null>(null);
  const sourceGutterRef = useRef<HTMLPreElement | null>(null);
  const currentSerializedBody = serializeCellBody(cell);
  const hasSourceEdits = titleDraft !== cell.title || sourceDraft !== currentSerializedBody;
  const isCollapsed = cell.collapsed === true && !isEditingSource && !isLinkedModelEditorCell(cell);
  const sourceLineNumbers = Array.from({ length: sourceDraft.split("\n").length }, (_, index) =>
    String(index + 1)
  ).join("\n");
  const variableDescriptions = useMemo(
    () => resolveCellVariableDescriptions(cells, cell),
    [cells, cell]
  );
  const variableUnitMetadata = useMemo(
    () => resolveCellVariableUnitMetadata(cells, cell),
    [cells, cell]
  );
  const showToolbarHelp = !isLinkedModelEditorCell(cell);

  useEffect(() => {
    setTitleDraft(cell.title);
    setSourceDraft(serializeCellBody(cell));
    setSourceLayoutMode("compact");
    setOpenSourceMenu(null);
    setSourceError(null);
    setSourceValidationError(null);
    setIsEditingSource(false);
  }, [cell]);

  useEffect(() => {
    if (!isEditingSource) {
      setSourceValidationError(null);
      return;
    }

    try {
      parseCellSource(cell, titleDraft, sourceDraft);
      setSourceValidationError(null);
    } catch (validationError) {
      setSourceValidationError(
        validationError instanceof Error ? validationError.message : "Invalid cell source"
      );
    }
  }, [cell, isEditingSource, sourceDraft, titleDraft]);

  useEffect(() => {
    if (!isEditingSource || openSourceMenu == null) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (insertMenuRef.current?.contains(target)) {
        return;
      }

      setOpenSourceMenu(null);
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpenSourceMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isEditingSource, openSourceMenu]);

  useEffect(() => {
    if (!isEditingSource || !sourceTextareaRef.current) {
      return;
    }

    const textarea = sourceTextareaRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 640)}px`;
  }, [isEditingSource, sourceDraft, sourceLayoutMode]);

  function handleSourceScroll(): void {
    if (!sourceTextareaRef.current || !sourceHighlightRef.current) {
      return;
    }

    sourceHighlightRef.current.scrollTop = sourceTextareaRef.current.scrollTop;
    sourceHighlightRef.current.scrollLeft = sourceTextareaRef.current.scrollLeft;
    if (sourceGutterRef.current) {
      sourceGutterRef.current.scrollTop = sourceTextareaRef.current.scrollTop;
    }
  }

  function handleApplySource(): void {
    try {
      const nextCell = parseCellSource(cell, titleDraft, sourceDraft);
      onCellChange(cell.id, () => nextCell);
      setSourceError(null);
      setSourceValidationError(null);
      setIsEditingSource(false);
    } catch (applyError) {
      setSourceError(applyError instanceof Error ? applyError.message : "Invalid cell source");
    }
  }

  function handleCancelSource(): void {
    setTitleDraft(cell.title);
    setSourceDraft(serializeCellBody(cell));
    setSourceLayoutMode("compact");
    setOpenSourceMenu(null);
    setSourceError(null);
    setSourceValidationError(null);
    setIsEditingSource(false);
  }

  function handleSourceLayoutModeChange(nextMode: "pretty" | "compact"): void {
    if (cell.type === "markdown") {
      setSourceLayoutMode(nextMode);
      return;
    }

    try {
      const parsed = JSON.parse(sourceDraft) as Omit<NotebookCell, "title">;
      setSourceDraft(formatCellBody(parsed, nextMode));
      setSourceLayoutMode(nextMode);
    } catch {
      setSourceLayoutMode(nextMode);
    }
  }

  return (
    <article
      id={cell.id}
      className={`notebook-cell notebook-cell-${cell.type}${
        isCompactLinkedCellHeader(cell) ? " notebook-cell-linked-collapsed" : ""
      }`}
    >
      <div className="notebook-cell-content">
        <div className="notebook-cell-toolbar">
          <NotebookLinkedEditorHeader
            actions={
              <NotebookCellHeaderActions
                helpText={showToolbarHelp ? buildNotebookCellHelpText(cell) : null}
                isCollapsed={cell.collapsed === true}
                isEditing={isEditingSource}
                leadingActions={
                  cell.type === "run" ? (
                    <>
                      <button
                        type="button"
                        className="notebook-run-button"
                        onClick={() => void runner.runCell(cell.id)}
                        disabled={status === "running"}
                      >
                        {status === "running" ? "Running..." : "Run cell"}
                      </button>
                      <span className={`run-status run-status-${status}`}>{status}</span>
                    </>
                  ) : null
                }
                onEditToggle={
                  !isLinkedModelEditorCell(cell) && !isEditingSource
                    ? () => setIsEditingSource(true)
                    : null
                }
                onToggleCollapsed={
                  !isLinkedModelEditorCell(cell)
                    ? () =>
                        onCellChange(cell.id, (current) => ({
                          ...current,
                          collapsed: !current.collapsed
                        }))
                    : null
                }
                title={cell.title}
                trailingActions={
                  <>
                    {isSourceEditable(cell) && isEditingSource ? (
                      <>
                        <button
                          type="button"
                          className="notebook-run-button notebook-source-toggle"
                          onClick={handleApplySource}
                          disabled={!hasSourceEdits || sourceValidationError != null}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          className="notebook-run-button notebook-source-toggle"
                          onClick={handleCancelSource}
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                  </>
                }
              />
            }
            title={cell.title}
            typeLabel={cell.type}
          />
        </div>

        {error ? <div className="error-text">Error: {error}</div> : null}
        {sourceError ? <div className="error-text">Source error: {sourceError}</div> : null}

        {isEditingSource ? (
          <div className="notebook-source-editor">
            <div className="notebook-source-toolbar">
              <div className="notebook-source-menu" ref={insertMenuRef}>
                <button
                  type="button"
                  className="secondary-button"
                  aria-controls={`source-insert-menu-${cell.id}`}
                  aria-expanded={openSourceMenu === "insert"}
                  onClick={() =>
                    setOpenSourceMenu((current) => (current === "insert" ? null : "insert"))
                  }
                >
                  Insert
                </button>
                {openSourceMenu === "insert" ? (
                  <div
                    id={`source-insert-menu-${cell.id}`}
                    className="notebook-source-menu-panel"
                    aria-label="Source insert actions"
                  >
                    {buildSourceHelperActions(cell).map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        className="secondary-button notebook-source-helper"
                        onClick={() => {
                          setSourceDraft((current) => applySourceHelper(current, action.insert));
                          setOpenSourceMenu(null);
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {cell.type !== "markdown" ? (
                <fieldset className="notebook-source-layout" aria-label="Source layout mode">
                  <label className="notebook-source-layout-option">
                    <input
                      type="radio"
                      name={`source-layout-${cell.id}`}
                      checked={sourceLayoutMode === "pretty"}
                      onChange={() => handleSourceLayoutModeChange("pretty")}
                    />
                    <span>Pretty</span>
                  </label>
                  <label className="notebook-source-layout-option">
                    <input
                      type="radio"
                      name={`source-layout-${cell.id}`}
                      checked={sourceLayoutMode === "compact"}
                      onChange={() => handleSourceLayoutModeChange("compact")}
                    />
                    <span>Compact</span>
                  </label>
                </fieldset>
              ) : null}
              <details className="notebook-source-help notebook-source-help-inline">
                <summary>Syntax help</summary>
                <pre className="notebook-source-help-code">{buildSourceHelpText(cell)}</pre>
              </details>
            </div>
            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                aria-label={`Title editor for ${cell.title}`}
              />
            </label>
            <div className="notebook-source-codeframe">
              <pre ref={sourceGutterRef} className="notebook-source-gutter" aria-hidden="true">
                <code>{sourceLineNumbers}</code>
              </pre>
              <div className="notebook-source-editor-pane">
                <pre
                  ref={sourceHighlightRef}
                  className="notebook-source-highlight"
                  aria-hidden="true"
                >
                  <code>{highlightSourceDraft(sourceDraft, cell.type)}</code>
                </pre>
                <textarea
                  ref={sourceTextareaRef}
                  className="json-area notebook-source-textarea"
                  value={sourceDraft}
                  onChange={(event) => setSourceDraft(event.target.value)}
                  onScroll={handleSourceScroll}
                  spellCheck={false}
                  aria-label={`Source editor for ${cell.title}`}
                />
              </div>
            </div>
            {sourceValidationError ? (
              <div className="notebook-source-validation" aria-live="polite">
                Live validation: {sourceValidationError}
              </div>
            ) : (
              <div className="notebook-source-validation is-valid" aria-live="polite">
                Live validation: ready to apply
              </div>
            )}
          </div>
        ) : null}

        {isCollapsed ? null : cell.type === "markdown" ? (
          <p className="notebook-markdown">{cell.source}</p>
        ) : null}
        {isCollapsed ? null : cell.type === "equations" ? (
          <EquationsCellView
            cell={cell}
            currentValues={getModelCurrentValues({ modelId: cell.modelId })}
            externals={findExternalsCell(cells, cell.modelId)?.externals ?? []}
            initialValuesCount={
              findInitialValuesCell(cells, cell.modelId)?.initialValues.length ?? 0
            }
            solverCell={findSolverCell(cells, cell.modelId)}
            title={cell.title}
            onChange={(equations) =>
              onCellChange(cell.id, (current) =>
                current.type === "equations" ? { ...current, equations } : current
              )
            }
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "equations"
                  ? { ...current, collapsed: !current.collapsed }
                  : current
              )
            }
          />
        ) : null}
        {isCollapsed ? null : cell.type === "model" ? (
          <ModelCellView
            cell={cell}
            currentValues={getModelCurrentValues({ sourceModelCellId: cell.id })}
            onChange={(editor) => onModelChange(cell.id, editor)}
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "model" ? { ...current, collapsed: !current.collapsed } : current
              )
            }
            title={cell.title}
          />
        ) : null}
        {isCollapsed ? null : cell.type === "solver" ? (
          <SolverCellView
            cell={cell}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            title={cell.title}
            onChange={(options) =>
              onCellChange(cell.id, (current) =>
                current.type === "solver" ? { ...current, options } : current
              )
            }
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "solver" ? { ...current, collapsed: !current.collapsed } : current
              )
            }
          />
        ) : null}
        {isCollapsed ? null : cell.type === "externals" ? (
          <ExternalsCellView
            cell={cell}
            currentValues={getModelCurrentValues({ modelId: cell.modelId })}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            title={cell.title}
            onChange={(externals) =>
              onCellChange(cell.id, (current) =>
                current.type === "externals" ? { ...current, externals } : current
              )
            }
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "externals"
                  ? { ...current, collapsed: !current.collapsed }
                  : current
              )
            }
          />
        ) : null}
        {isCollapsed ? null : cell.type === "initial-values" ? (
          <InitialValuesCellView
            cell={cell}
            currentValues={getModelCurrentValues({ modelId: cell.modelId })}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            title={cell.title}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
            onChange={(initialValues) =>
              onCellChange(cell.id, (current) =>
                current.type === "initial-values" ? { ...current, initialValues } : current
              )
            }
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "initial-values"
                  ? { ...current, collapsed: !current.collapsed }
                  : current
              )
            }
          />
        ) : null}
        {isCollapsed ? null : cell.type === "run" ? (
          <RunCellView cell={cell} cells={cells} variableDescriptions={variableDescriptions} />
        ) : null}
        {isCollapsed ? null : cell.type === "chart" ? (
          <ChartCellView
            cell={cell}
            cells={cells}
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        ) : null}
        {isCollapsed ? null : cell.type === "table" ? (
          <TableCellView
            cell={cell}
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        ) : null}
        {isCollapsed ? null : cell.type === "matrix" ? (
          <MatrixCellView
            cell={cell}
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        ) : null}
        {isCollapsed ? null : cell.type === "sequence" ? (
          <SequenceCellView
            cell={cell}
            cells={cells}
            maxPeriodIndex={maxPeriodIndex}
            onSelectedPeriodIndexChange={onSelectedPeriodIndexChange}
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
            variableDescriptions={variableDescriptions}
          />
        ) : null}
      </div>
    </article>
  );
}

function ModelCellView({
  cell,
  currentValues,
  onChange,
  onToggleCollapsed,
  title
}: {
  cell: ModelCell;
  currentValues: Record<string, number | undefined>;
  onChange(editor: EditorState): void;
  onToggleCollapsed(): void;
  title: string;
}) {
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
            Periods <strong>{runtime?.options.periods ?? "invalid"}</strong>
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
            parameterNames={draftEditor.externals.map((external) => external.name)}
            showHeading={false}
            showTraceHelp={false}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      ) : (
        <section className="notebook-model-view" aria-label="Model view">
          <div className="notebook-model-view-table" role="table" aria-label="Model equations">
            <div className="notebook-model-view-row notebook-model-view-row-header" role="row">
              <span role="columnheader">Variable</span>
              <span role="columnheader">Expression</span>
              <span role="columnheader">Current</span>
            </div>
            {cell.editor.equations.map((equation, index) => {
              const issue =
                issueMap[`equations.${index}.name`] ?? issueMap[`equations.${index}.expression`];
              const traceRole = activeTrace?.rowStates.get(equation.id) ?? null;

              return (
                <div
                  key={equation.id}
                  className={[
                    "notebook-model-view-row",
                    issue ? "has-issue" : "",
                    hoveredRowId === equation.id ? "is-hovered" : "",
                    traceRole ? `trace-${traceRole}` : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(event) =>
                    setPinnedTrace((current) => togglePinnedTrace(current, equation.id, event))
                  }
                  onMouseEnter={() => setHoveredRowId(equation.id)}
                  onMouseLeave={() =>
                    setHoveredRowId((current) => (current === equation.id ? null : current))
                  }
                  role="row"
                >
                  <span className="notebook-model-view-name" role="cell">
                    {equation.name ? (
                      <VariableLabel
                        className={
                          traceRole && equation.name.trim()
                            ? `formula-token trace-token-${
                                activeTrace?.tokenStates.get(equation.name.trim()) ?? "root"
                              }`
                            : undefined
                        }
                        name={equation.name}
                        variableDescriptions={variableDescriptions}
                        variableUnitMetadata={variableUnitMetadata}
                      />
                    ) : (
                      "?"
                    )}
                  </span>
                  <span className="notebook-model-view-expression" role="cell">
                    {equation.expression
                      ? highlightFormula(
                          equation.expression,
                          parameterNameSet,
                          traceRole ? activeTrace?.tokenStates : undefined,
                          variableDescriptions
                        )
                      : " "}
                  </span>
                  <span className="notebook-model-view-current" role="cell">
                    {formatNotebookCurrentValue(
                      equation.name,
                      currentValues[equation.name.trim()],
                      variableUnitMetadata
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function EquationsCellView({
  cell,
  currentValues,
  externals,
  initialValuesCount,
  solverCell,
  title,
  onChange,
  onToggleCollapsed
}: {
  cell: EquationsCell;
  currentValues: Record<string, number | undefined>;
  externals: ExternalsCell["externals"];
  initialValuesCount: number;
  solverCell: SolverCell | null;
  title: string;
  onChange(equations: EquationsCell["equations"]): void;
  onToggleCollapsed(): void;
}) {
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
  const hasDraftEdits = JSON.stringify(draftEquations) !== JSON.stringify(cell.equations);

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
            Periods <strong>{runtime?.options.periods ?? solverCell?.options.periods ?? "invalid"}</strong>
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
            parameterNames={externals.map((external) => external.name)}
            showHeading={false}
            showTraceHelp={false}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      ) : (
        <section className="notebook-model-view" aria-label="Model view">
          <div className="notebook-model-view-table" role="table" aria-label="Model equations">
            <div className="notebook-model-view-row notebook-model-view-row-header" role="row">
              <span role="columnheader">Variable</span>
              <span role="columnheader">Expression</span>
              <span role="columnheader">Current</span>
            </div>
            {cell.equations.map((equation, index) => {
              const issue =
                issueMap[`equations.${index}.name`] ?? issueMap[`equations.${index}.expression`];
              const traceRole = activeTrace?.rowStates.get(equation.id) ?? null;

              return (
                <div
                  key={equation.id}
                  className={[
                    "notebook-model-view-row",
                    issue ? "has-issue" : "",
                    hoveredRowId === equation.id ? "is-hovered" : "",
                    traceRole ? `trace-${traceRole}` : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(event) =>
                    setPinnedTrace((current) => togglePinnedTrace(current, equation.id, event))
                  }
                  onMouseEnter={() => setHoveredRowId(equation.id)}
                  onMouseLeave={() =>
                    setHoveredRowId((current) => (current === equation.id ? null : current))
                  }
                  role="row"
                >
                  <span className="notebook-model-view-name" role="cell">
                    {equation.name ? (
                      <VariableLabel
                        className={
                          traceRole && equation.name.trim()
                            ? `formula-token trace-token-${
                                activeTrace?.tokenStates.get(equation.name.trim()) ?? "root"
                              }`
                            : undefined
                        }
                        name={equation.name}
                        variableDescriptions={variableDescriptions}
                        variableUnitMetadata={variableUnitMetadata}
                      />
                    ) : (
                      "?"
                    )}
                  </span>
                  <span className="notebook-model-view-expression" role="cell">
                    {equation.expression
                      ? highlightFormula(
                          equation.expression,
                          parameterNameSet,
                          traceRole ? activeTrace?.tokenStates : undefined,
                          variableDescriptions,
                          variableUnitMetadata
                        )
                      : " "}
                  </span>
                  <span className="notebook-model-view-current" role="cell">
                    {formatNotebookCurrentValue(
                      equation.name,
                      currentValues[equation.name.trim()],
                      variableUnitMetadata
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function SolverCellView({
  cell,
  issueMap,
  title,
  onChange,
  onToggleCollapsed
}: {
  cell: SolverCell;
  issueMap: Record<string, string | undefined>;
  title: string;
  onChange(options: EditorState["options"]): void;
  onToggleCollapsed(): void;
}) {
  const options = cell.options;
  const hiddenEquationEnabled =
    options.hiddenLeftVariable.trim() !== "" && options.hiddenRightVariable.trim() !== "";
  const issuePaths = Object.keys(issueMap);
  const [isEditingSolver, setIsEditingSolver] = useState(false);
  const [draftOptions, setDraftOptions] = useState(cell.options);
  const hasDraftEdits = JSON.stringify(draftOptions) !== JSON.stringify(cell.options);

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
            Periods <strong>{options.periods}</strong>
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
          <SolverPanel options={draftOptions} issues={issueMap} onChange={setDraftOptions} />
        </div>
      ) : (
        <section className="notebook-model-view" aria-label="Solver view">
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
                label: "Periods",
                value: String(options.periods),
                status: issueMap["options.periods"] ? "Issue" : "OK"
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

function ExternalsCellView({
  cell,
  currentValues,
  issueMap,
  title,
  onChange,
  onToggleCollapsed
}: {
  cell: ExternalsCell;
  currentValues: Record<string, number | undefined>;
  issueMap: Record<string, string | undefined>;
  title: string;
  onChange(externals: EditorState["externals"]): void;
  onToggleCollapsed(): void;
}) {
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
        <section className="notebook-model-view" aria-label="Externals view">
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
                <div
                  key={external.id}
                  className={[
                    "notebook-model-view-row",
                    "notebook-model-view-row-external",
                    issue ? "has-issue" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="row"
                >
                  <span className="notebook-model-view-name" role="cell">
                    <VariableLabel
                      name={external.name || "?"}
                      variableDescriptions={variableDescriptions}
                      variableUnitMetadata={variableUnitMetadata}
                    />
                  </span>
                  <span className="notebook-model-view-expression" role="cell">
                    {external.valueText || " "}
                  </span>
                  <span className="notebook-model-view-current" role="cell">
                    {formatNotebookCurrentValue(
                      external.name,
                      currentValues[external.name.trim()],
                      variableUnitMetadata
                    )}
                  </span>
                  <span className="notebook-model-view-kind" role="cell">
                    {external.kind}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function InitialValuesCellView({
  cell,
  currentValues,
  issueMap,
  title,
  variableDescriptions,
  variableUnitMetadata,
  onChange,
  onToggleCollapsed
}: {
  cell: InitialValuesCell;
  currentValues: Record<string, number | undefined>;
  issueMap: Record<string, string | undefined>;
  title: string;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onChange(initialValues: EditorState["initialValues"]): void;
  onToggleCollapsed(): void;
}) {
  const issuePaths = Object.keys(issueMap);
  const [isEditingInitialValues, setIsEditingInitialValues] = useState(false);
  const [draftInitialValues, setDraftInitialValues] = useState(cell.initialValues);
  const hasDraftEdits =
    JSON.stringify(draftInitialValues) !== JSON.stringify(cell.initialValues);

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
            initialValues={draftInitialValues}
            isEmbedded
            issues={issueMap}
            onChange={setDraftInitialValues}
            showHeading={false}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      ) : (
        <section className="notebook-model-view" aria-label="Initial values view">
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
                <div
                  key={initialValue.id}
                  className={[
                    "notebook-model-view-row",
                    "notebook-model-view-row-initial",
                    issue ? "has-issue" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="row"
                >
                  <InstantTooltip
                    as="span"
                    className="notebook-model-view-name"
                    role="cell"
                    tooltip={
                      initialValue.name
                        ? getVariableDescription(variableDescriptions, initialValue.name)
                        : undefined
                    }
                  >
                    {initialValue.name || "?"}
                  </InstantTooltip>
                  <span className="notebook-model-view-expression" role="cell">
                    {initialValue.valueText || " "}
                  </span>
                  <span className="notebook-model-view-current" role="cell">
                    {formatNotebookCurrentValue(
                      initialValue.name,
                      currentValues[initialValue.name.trim()],
                      variableUnitMetadata
                    )}
                  </span>
                  <span className="notebook-model-view-kind" role="cell">
                    {issue ?? "OK"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function NotebookHelpButton({
  title,
  helpText
}: {
  title: string;
  helpText: string;
}) {
  return (
    <details className="notebook-cell-help">
      <summary className="notebook-run-button">Help</summary>
      <div className="notebook-cell-help-panel" role="note" aria-label={`Help for ${title}`}>
        {helpText
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line, index) => (
            <p key={`${title}-help-${index}`}>{line}</p>
          ))}
      </div>
    </details>
  );
}

function NotebookLinkedEditorHeader({
  actions,
  children,
  title,
  typeLabel
}: {
  actions: ReactNode;
  children?: ReactNode;
  title: string;
  typeLabel: string;
}) {
  return (
    <div className="notebook-linked-editor-topline is-compact">
      <div className="notebook-linked-editor-meta">
        <div className="notebook-linked-editor-titleline">
          <span className="notebook-cell-type-tag">{typeLabel}</span>
          <h2>{title}</h2>
        </div>
        {children ?? null}
      </div>
      {actions}
    </div>
  );
}

function NotebookCellHeaderActions({
  helpText,
  isCollapsed,
  isEditing,
  leadingActions,
  onEditToggle,
  onToggleCollapsed,
  title,
  trailingActions
}: {
  helpText: string | null;
  isCollapsed: boolean;
  isEditing: boolean;
  leadingActions?: ReactNode;
  onEditToggle?: (() => void) | null;
  onToggleCollapsed: (() => void) | null;
  title: string;
  trailingActions?: ReactNode;
}) {
  return (
    <div className="notebook-cell-header-actions">
      {leadingActions ? <div className="notebook-cell-header-leading">{leadingActions}</div> : null}
      <div className="notebook-linked-editor-actions">
        {helpText ? <NotebookHelpButton title={title} helpText={helpText} /> : null}
        {!isCollapsed && onEditToggle && !isEditing ? (
          <button
            type="button"
            className="notebook-run-button"
            aria-pressed={isEditing}
            onClick={onEditToggle}
          >
            Edit
          </button>
        ) : null}
        {onToggleCollapsed ? (
          <button type="button" className="notebook-run-button" onClick={onToggleCollapsed}>
            {isCollapsed ? "Show" : "Hide"}
          </button>
        ) : null}
        {trailingActions ?? null}
      </div>
    </div>
  );
}

function NotebookLinkedEditorActions({
  cell,
  hasDraftEdits,
  isEditing,
  onApply,
  onCancel,
  onEditToggle,
  onToggleCollapsed,
  title
}: {
  cell: ModelCell | EquationsCell | SolverCell | ExternalsCell | InitialValuesCell;
  hasDraftEdits: boolean;
  isEditing: boolean;
  onApply(): void;
  onCancel(): void;
  onEditToggle(): void;
  onToggleCollapsed(): void;
  title: string;
}) {
  return (
    <NotebookCellHeaderActions
      helpText={buildNotebookCellHelpText(cell)}
      isCollapsed={cell.collapsed === true}
      isEditing={isEditing}
      onEditToggle={onEditToggle}
      onToggleCollapsed={onToggleCollapsed}
      title={title}
      trailingActions={
        isEditing ? (
          <>
            <button
              type="button"
              className="notebook-run-button notebook-source-toggle"
              onClick={onApply}
              disabled={!hasDraftEdits}
            >
              Apply
            </button>
            <button
              type="button"
              className="notebook-run-button notebook-source-toggle"
              onClick={onCancel}
            >
              Cancel
            </button>
          </>
        ) : null
      }
    />
  );
}

function isLinkedModelEditorCell(cell: NotebookCell): boolean {
  return (
    cell.type === "model" ||
    cell.type === "equations" ||
    cell.type === "solver" ||
    cell.type === "externals" ||
    cell.type === "initial-values"
  );
}

function isCompactLinkedCellHeader(cell: NotebookCell): boolean {
  return (
    cell.type === "model" ||
    cell.type === "equations" ||
    cell.type === "solver" ||
    cell.type === "externals" ||
    cell.type === "initial-values"
  );
}

function RunCellView({
  cell,
  cells,
  variableDescriptions
}: {
  cell: RunCell;
  cells: NotebookCell[];
  variableDescriptions: VariableDescriptions;
}) {
  const baselineStartPeriod = resolveEffectiveScenarioStartPeriod(cells, cell);

  return (
    <div className="notebook-run-summary">
      {cell.description ? <p>{cell.description}</p> : null}
      <div className="notebook-run-meta">
        <span className="notebook-run-meta-chip">
          Mode <strong>{cell.mode}</strong>
        </span>
        {cell.mode === "scenario" && cell.baselineRunCellId ? (
          <span className="notebook-run-meta-chip">
            Baseline <strong>{cell.baselineRunCellId}</strong>
          </span>
        ) : null}
        {cell.mode === "scenario" && baselineStartPeriod != null ? (
          <span className="notebook-run-meta-chip">
            Start period <strong>{baselineStartPeriod}</strong>
          </span>
        ) : null}
        {cell.periods != null ? (
          <span className="notebook-run-meta-chip">
            Periods <strong>{cell.periods}</strong>
          </span>
        ) : null}
      </div>
      {cell.scenario?.shocks.length ? (
        <div className="notebook-run-scenarios">
          {cell.scenario.shocks.map((shock, shockIndex) => (
            <div key={`${cell.id}-shock-${shockIndex}`} className="notebook-run-shock">
              <div className="notebook-run-shock-header">
                Shock {shockIndex + 1}: {shock.startPeriodInclusive} to {shock.endPeriodInclusive}
              </div>
              <ul className="notebook-run-shock-list">
                {Object.entries(shock.variables).map(([name, value]) => (
                  <li key={name}>
                    <InstantTooltip
                      as="strong"
                      tooltip={getVariableDescription(variableDescriptions, name)}
                    >
                      {name}
                    </InstantTooltip>
                    : {formatShockValue(value)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartCellView({
  cell,
  cells,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: ChartCell;
  cells: NotebookCell[];
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return <div className="status-hint">Run the source cell to populate this chart.</div>;
  }

  const series = cell.variables
    .map((name) => ({
      name,
      values: Array.from(result.series[name] ?? [])
    }))
    .filter((entry) => entry.values.length > 0);
  const sourceRunCell = cells.find(
    (candidate): candidate is RunCell =>
      candidate.type === "run" && candidate.id === cell.sourceRunCellId
  );
  const baselineRunCell =
    sourceRunCell?.mode === "scenario" && sourceRunCell.baselineRunCellId
      ? cells.find(
          (candidate): candidate is RunCell =>
            candidate.type === "run" && candidate.id === sourceRunCell.baselineRunCellId
        )
      : null;
  const baselineResult = baselineRunCell ? runner.getResult(baselineRunCell.id) : null;
  const baselineStartPeriod = sourceRunCell
    ? resolveEffectiveScenarioStartPeriod(cells, sourceRunCell)
    : undefined;
  const periodLabelOffset = baselineStartPeriod != null ? baselineStartPeriod - 1 : 0;
  const chartSelectedIndex =
    baselineStartPeriod != null
      ? Math.max(selectedPeriodIndex - periodLabelOffset, 0)
      : selectedPeriodIndex;
  const overlaySeries =
    sourceRunCell?.mode === "scenario" &&
    baselineStartPeriod != null &&
    baselineResult
      ? cell.variables
          .map((name) => ({
            name,
            values: Array.from(
              baselineResult.series[name]?.slice(
                Math.max(baselineStartPeriod - 1, 0),
                Math.max(baselineStartPeriod - 1, 0) +
                  (sourceRunCell.periods ?? series[0]?.values.length ?? 0)
              ) ?? []
            )
          }))
          .filter((entry) => entry.values.length > 0)
      : [];
  const timeRangeDefaults = resolveChartTimeRangeDefaults(
    sourceRunCell,
    series[0]?.values.length ?? 0
  );

  return (
    <ResultChart
      axisMode={cell.axisMode ?? "shared"}
      axisSnapTolarance={cell.axisSnapTolarance}
      overlaySeries={overlaySeries}
      periodLabelOffset={periodLabelOffset}
      seriesRanges={cell.seriesRanges}
      selectedIndex={chartSelectedIndex}
      series={series}
      sharedRange={cell.sharedRange}
      timeRangeDefaults={timeRangeDefaults}
      timeRangeInclusive={cell.timeRangeInclusive}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
    />
  );
}

function resolveEffectiveScenarioStartPeriod(
  cells: NotebookCell[],
  cell: RunCell
): number | undefined {
  if (cell.mode !== "scenario") {
    return undefined;
  }

  if (cell.baselineStartPeriod != null) {
    return cell.baselineStartPeriod;
  }

  const baselineRunCell = cell.baselineRunCellId
    ? cells.find(
        (candidate): candidate is RunCell =>
          candidate.type === "run" && candidate.id === cell.baselineRunCellId
      ) ?? null
    : null;

  if (!baselineRunCell) {
    return undefined;
  }

  if (baselineRunCell.periods != null) {
    return baselineRunCell.periods;
  }

  return buildEditorStateForNotebookModel(
    {
      id: "notebook",
      title: "notebook",
      metadata: { version: 1 },
      cells
    },
    baselineRunCell
  )?.options.periods;
}

function resolveCellVariableDescriptions(
  cells: NotebookCell[],
  cell: NotebookCell
): VariableDescriptions {
  if (cell.type === "model") {
    return buildVariableDescriptions({
      equations: cell.editor.equations,
      externals: cell.editor.externals
    });
  }

  if (
    cell.type === "equations" ||
    cell.type === "externals" ||
    cell.type === "initial-values" ||
    cell.type === "solver"
  ) {
    return resolveModelVariableDescriptionsForModelId(cells, cell.modelId);
  }

  if (cell.type === "run") {
    return resolveModelVariableDescriptionsForRunCell(cells, cell);
  }

  if (cell.type === "chart" || cell.type === "table" || cell.type === "matrix") {
    const sourceRunCell = cells.find(
      (candidate): candidate is RunCell =>
        candidate.type === "run" && candidate.id === cell.sourceRunCellId
    );
    return sourceRunCell ? resolveModelVariableDescriptionsForRunCell(cells, sourceRunCell) : new Map();
  }

  if (cell.type === "sequence") {
    if (cell.source.kind !== "matrix") {
      return new Map();
    }

    const source = cell.source;
    const matrixCell = cells.find(
      (candidate): candidate is MatrixCell =>
        candidate.type === "matrix" && candidate.id === source.matrixCellId
    );
    const sourceRunCellId = source.sourceRunCellId ?? matrixCell?.sourceRunCellId;
    const sourceRunCell = sourceRunCellId
      ? cells.find(
          (candidate): candidate is RunCell =>
            candidate.type === "run" && candidate.id === sourceRunCellId
        ) ?? null
      : null;

    return sourceRunCell ? resolveModelVariableDescriptionsForRunCell(cells, sourceRunCell) : new Map();
  }

  return new Map();
}

function resolveCellVariableUnitMetadata(cells: NotebookCell[], cell: NotebookCell) {
  if (cell.type === "model") {
    return buildVariableUnitMetadata({
      equations: cell.editor.equations,
      externals: cell.editor.externals
    });
  }

  if (
    cell.type === "equations" ||
    cell.type === "externals" ||
    cell.type === "initial-values" ||
    cell.type === "solver"
  ) {
    return resolveModelVariableUnitMetadataForModelId(cells, cell.modelId);
  }

  if (cell.type === "run") {
    return resolveModelVariableUnitMetadataForRunCell(cells, cell);
  }

  if (cell.type === "chart" || cell.type === "table" || cell.type === "matrix") {
    const sourceRunCell = cells.find(
      (candidate): candidate is RunCell =>
        candidate.type === "run" && candidate.id === cell.sourceRunCellId
    );
    return sourceRunCell ? resolveModelVariableUnitMetadataForRunCell(cells, sourceRunCell) : new Map();
  }

  if (cell.type === "sequence") {
    if (cell.source.kind !== "matrix") {
      return new Map();
    }

    const source = cell.source;
    const matrixCell = cells.find(
      (candidate): candidate is MatrixCell =>
        candidate.type === "matrix" && candidate.id === source.matrixCellId
    );
    const sourceRunCellId = source.sourceRunCellId ?? matrixCell?.sourceRunCellId;
    const sourceRunCell = sourceRunCellId
      ? cells.find(
          (candidate): candidate is RunCell =>
            candidate.type === "run" && candidate.id === sourceRunCellId
        ) ?? null
      : null;

    return sourceRunCell ? resolveModelVariableUnitMetadataForRunCell(cells, sourceRunCell) : new Map();
  }

  return new Map();
}

function resolveModelVariableDescriptionsForRunCell(
  cells: NotebookCell[],
  cell: RunCell
): VariableDescriptions {
  const editor = buildEditorStateForNotebookModel(
    {
      id: "notebook",
      title: "notebook",
      metadata: { version: 1 },
      cells
    },
    cell
  );

  return buildVariableDescriptions({
    equations: editor?.equations,
    externals: editor?.externals
  });
}

function resolveModelVariableUnitMetadataForRunCell(cells: NotebookCell[], cell: RunCell) {
  const editor = buildEditorStateForNotebookModel(
    {
      id: "notebook",
      title: "notebook",
      metadata: { version: 1 },
      cells
    },
    cell
  );

  return buildVariableUnitMetadata({
    equations: editor?.equations,
    externals: editor?.externals
  });
}

function resolveModelVariableDescriptionsForModelId(
  cells: NotebookCell[],
  modelId: string
): VariableDescriptions {
  return buildVariableDescriptions({
    equations: findEquationsCell(cells, modelId)?.equations,
    externals: findExternalsCell(cells, modelId)?.externals
  });
}

function resolveModelVariableUnitMetadataForModelId(cells: NotebookCell[], modelId: string) {
  return buildVariableUnitMetadata({
    equations: findEquationsCell(cells, modelId)?.equations,
    externals: findExternalsCell(cells, modelId)?.externals
  });
}

function TableCellView({
  cell,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: TableCell;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return <div className="status-hint">Run the source cell to populate this summary table.</div>;
  }

  const rows = cell.variables.map((name) => {
    const values = result.series[name] ?? [];
    return {
      description: getVariableDescription(variableDescriptions, name),
      name,
      selected: values[Math.min(selectedPeriodIndex, values.length - 1)] ?? NaN,
      start: values[0] ?? NaN,
      end: values[values.length - 1] ?? NaN
    };
  });

  return (
    <ResultTable
      title={cell.title}
      rows={rows}
      selectedIndex={selectedPeriodIndex}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
    />
  );
}

function MatrixCellView({
  cell,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata
}: {
  cell: MatrixCell;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
}) {
  const result = cell.sourceRunCellId ? runner.getResult(cell.sourceRunCellId) : null;
  const evaluatedMatrix = useMemo(
    () => buildEvaluatedMatrix(cell, result, selectedPeriodIndex),
    [cell, result, selectedPeriodIndex]
  );

  return (
    <div className="notebook-matrix">
      {cell.description ? <p className="notebook-markdown">{cell.description}</p> : null}
      <div className="notebook-matrix-wrap">
        <table className="notebook-matrix-table">
          <thead>
            <tr>
              <th scope="col" />
              {cell.columns.map((column) => (
                <th key={column} scope="col">
                  <VariableLabel
                    name={column}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evaluatedMatrix.rows.map((row) => (
              <tr
                key={row.label}
                className={row.isSumRow && !row.isBalanced ? "matrix-balance-error" : undefined}
              >
                <th scope="row">
                  <VariableLabel
                    name={row.label}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                </th>
                {row.entries.map((entry, index) => (
                  <td
                    key={`${row.label}-${cell.columns[index] ?? index}`}
                    className={entry.isSumCell && !entry.isBalanced ? "matrix-balance-error" : undefined}
                  >
                    <div className="matrix-entry-inline">
                      <span className="matrix-entry-source">
                        {highlightFormula(
                          entry.source,
                          new Set(),
                          undefined,
                          variableDescriptions,
                          variableUnitMetadata
                        )}
                      </span>
                      {entry.resolved ? (
                        <span className="matrix-entry-current">
                          {formatResolvedMatrixValue(
                            entry.source,
                            entry.resolved,
                            variableUnitMetadata
                          )}
                        </span>
                      ) : null}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell.note ? <p className="notebook-matrix-note">{cell.note}</p> : null}
    </div>
  );
}

function SequenceCellView({
  cell,
  cells,
  maxPeriodIndex,
  onSelectedPeriodIndexChange,
  runner,
  selectedPeriodIndex,
  variableDescriptions
}: {
  cell: SequenceCell;
  cells: NotebookCell[];
  maxPeriodIndex: number;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
}) {
  const diagram = useMemo(
    () =>
      resolveSequenceDiagram(
        cell,
        (cellId) => {
          const target = cells.find((entry) => entry.id === cellId);
          return target?.type === "matrix" ? target : null;
        },
        (cellId) => runner.getResult(cellId),
        selectedPeriodIndex
      ),
    [cell, cells, runner, selectedPeriodIndex]
  );
  const [visibleStepCount, setVisibleStepCount] = useState(() => diagram.steps.length);
  const [highlightedStepIndex, setHighlightedStepIndex] = useState<number | null>(null);
  const pendingPeriodAdvanceRef = useRef(false);
  const pendingPeriodRetreatRef = useRef(false);
  const previousCellIdRef = useRef(cell.id);
  const previousPeriodIndexRef = useRef(selectedPeriodIndex);

  useEffect(() => {
    if (previousCellIdRef.current !== cell.id) {
      previousCellIdRef.current = cell.id;
      previousPeriodIndexRef.current = selectedPeriodIndex;
      pendingPeriodAdvanceRef.current = false;
      pendingPeriodRetreatRef.current = false;
      setVisibleStepCount(diagram.steps.length);
      setHighlightedStepIndex(null);
      return;
    }

    if (pendingPeriodAdvanceRef.current) {
      pendingPeriodAdvanceRef.current = false;
      previousPeriodIndexRef.current = selectedPeriodIndex;
      setVisibleStepCount(Math.min(1, diagram.steps.length));
      setHighlightedStepIndex(diagram.steps.length > 0 ? 0 : null);
      return;
    }

    if (pendingPeriodRetreatRef.current) {
      pendingPeriodRetreatRef.current = false;
      previousPeriodIndexRef.current = selectedPeriodIndex;
      setVisibleStepCount(diagram.steps.length);
      setHighlightedStepIndex(diagram.steps.length > 0 ? diagram.steps.length - 1 : null);
      return;
    }

    if (previousPeriodIndexRef.current !== selectedPeriodIndex) {
      previousPeriodIndexRef.current = selectedPeriodIndex;
      setVisibleStepCount(diagram.steps.length);
      setHighlightedStepIndex(null);
      return;
    }

    setVisibleStepCount(diagram.steps.length);
    setHighlightedStepIndex(null);
  }, [diagram.steps.length, cell.id, selectedPeriodIndex]);

  function moveToStep(nextCount: number): void {
    const clamped = Math.max(0, Math.min(nextCount, diagram.steps.length));
    setVisibleStepCount(clamped);
    setHighlightedStepIndex(clamped > visibleStepCount ? clamped - 1 : null);
  }

  const visibleSteps = Math.min(visibleStepCount, diagram.steps.length);
  const canAdvancePeriod = selectedPeriodIndex < maxPeriodIndex;
  const canRetreatPeriod = selectedPeriodIndex > 0;

  function handleNextStep(): void {
    if (visibleSteps < diagram.steps.length) {
      moveToStep(visibleSteps + 1);
      return;
    }
    if (!canAdvancePeriod) {
      return;
    }
    pendingPeriodAdvanceRef.current = true;
    onSelectedPeriodIndexChange(selectedPeriodIndex + 1);
  }

  function handlePreviousStep(): void {
    if (visibleSteps > 0) {
      moveToStep(visibleSteps - 1);
      return;
    }
    if (!canRetreatPeriod) {
      return;
    }
    pendingPeriodRetreatRef.current = true;
    onSelectedPeriodIndexChange(selectedPeriodIndex - 1);
  }

  return (
    <div className="sequence-viewer">
      {cell.description ? <p className="notebook-markdown">{cell.description}</p> : null}
      <div className="sequence-toolbar">
        <div className="sequence-toolbar-meta">
          <span>
            Participants <strong>{diagram.participants.length}</strong>
          </span>
          <span>
            Steps <strong>{diagram.steps.length}</strong>
          </span>
          <span>
            Visible <strong>{visibleSteps}</strong>
          </span>
        </div>
        <div className="sequence-toolbar-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => moveToStep(0)}
            disabled={visibleSteps === 0}
          >
            Reset
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handlePreviousStep}
            disabled={visibleSteps === 0 && !canRetreatPeriod}
          >
            Previous step
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleNextStep}
            disabled={visibleSteps >= diagram.steps.length && !canAdvancePeriod}
          >
            Next step
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => moveToStep(diagram.steps.length)}
            disabled={visibleSteps >= diagram.steps.length}
          >
            Show all
          </button>
        </div>
      </div>
      <SequenceDiagramCanvas
        diagram={diagram}
        visibleStepCount={visibleSteps}
        highlightedStepIndex={highlightedStepIndex}
        variableDescriptions={variableDescriptions}
      />
      {diagram.errors.length ? (
        <ul className="validation-list">
          {diagram.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {cell.note ? <p className="notebook-matrix-note">{cell.note}</p> : null}
    </div>
  );
}

function buildEvaluatedMatrix(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number
) {
  const sumRowIndex = cell.rows.findIndex((row) => row.label.trim().toLowerCase() === "sum");
  const sumColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "sum");
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
        ? computeMatrixTotal(numericValues, rowIndex, columnIndex, sumRowIndex, sumColumnIndex)
        : numericValues[rowIndex]?.[columnIndex] ?? null;

      return {
        source: value,
        resolved:
          computedValue != null && Number.isFinite(computedValue)
            ? `= ${formatMatrixNumber(computedValue)}`
            : resolveMatrixEntryValue(value, result, selectedPeriodIndex),
        isBalanced: isSumCell ? Math.abs(computedValue ?? 0) < 1e-6 : true,
        isSumCell
      };
    });

    return {
      label: row.label,
      entries: rowEntries,
      isBalanced:
        rowIndex === sumRowIndex
          ? rowEntries.every((entry) => entry.isBalanced)
          : Math.abs(computeRowTotal(numericValues[rowIndex] ?? [], sumColumnIndex)) < 1e-6,
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
  sumColumnIndex: number
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
    return computeRowTotal(numericValues[rowIndex] ?? [], sumColumnIndex);
  }
  return numericValues[rowIndex]?.[columnIndex] ?? null;
}

function computeRowTotal(row: Array<number | null>, sumColumnIndex: number): number {
  return row.reduce<number>(
    (total, value, index) => total + (index === sumColumnIndex ? 0 : value ?? 0),
    0
  );
}

function evaluateMatrixEntryNumber(
  source: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): number | null {
  const normalizedSource = source.trim();
  if (!normalizedSource || !result) {
    return null;
  }

  try {
    const expression = parseExpression(stripLeadingPlus(normalizedSource));
    const value = evaluateExpression(expression, createResultContext(result, selectedPeriodIndex));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
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

function formatNotebookCurrentValue(
  name: string,
  value: number | undefined,
  variableUnitMetadata?: ReturnType<typeof buildVariableUnitMetadata>
): string {
  return formatNamedValueWithUnits(name, value, variableUnitMetadata?.get(name.trim()), {
    maximumFractionDigits: 6
  });
}

function formatResolvedMatrixValue(
  source: string,
  resolved: string,
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>
): string {
  const valueText = resolved.replace(/^=\s*/, "");
  const numericValue = Number(valueText.replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) {
    return resolved;
  }

  const unitMeta = inferMatrixExpressionUnitMeta(source, variableUnitMetadata);
  return `= ${formatValueWithUnits(numericValue, unitMeta, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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
  const match = source.match(/[A-Za-z_][A-Za-z0-9_]*/);
  return match ? match[0] : null;
}

function formatShockValue(
  value: { kind: "constant"; value: number } | { kind: "series"; values: number[] }
): string {
  if (value.kind === "constant") {
    return value.value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  return `[${value.values
    .map((item) => item.toLocaleString(undefined, { maximumFractionDigits: 6 }))
    .join(", ")}]`;
}

function safeBuildRuntime(editor: EditorState) {
  try {
    return buildRuntimeConfig(editor);
  } catch {
    return null;
  }
}

function buildIssueMapForStandaloneModelSections(
  cells: NotebookCell[],
  modelId: string
): Record<string, string | undefined> {
  const equationsCell = findEquationsCell(cells, modelId);
  const solverCell = findSolverCell(cells, modelId);
  if (!equationsCell || !solverCell) {
    return {};
  }

  const editor = buildEditorStateFromSections({
    equations: equationsCell.equations,
    externals: findExternalsCell(cells, modelId)?.externals ?? [],
    initialValues: findInitialValuesCell(cells, modelId)?.initialValues ?? [],
    options: solverCell.options
  });

  return Object.fromEntries(
    [...validateEditorState(editor), ...diagnoseBuildRuntime(editor).issues].map((issue) => [
      issue.path,
      issue.message
    ])
  );
}

function resolveChartTimeRangeDefaults(
  _sourceRunCell: RunCell | undefined,
  seriesLength: number
): { endPeriodInclusive: number; startPeriodInclusive: number } {
  return {
    startPeriodInclusive: 1,
    endPeriodInclusive: Math.max(seriesLength, 1)
  };
}
