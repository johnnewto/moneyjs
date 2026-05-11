import { memo, useEffect, useMemo, useRef, useState } from "react";

import type { EditorState } from "../lib/editorModel";
import {
  buildVariableDescriptions,
  type VariableDescriptions
} from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";
import {
  buildEditorStateForNotebookModel,
  findEquationsCell,
  findExternalsCell,
  findInitialValuesCell,
  findSolverCell
} from "./modelSections";
import { MatrixSourceEditor } from "./MatrixSourceEditor";
import { NotebookRenderProfiler } from "./notebookProfiler";
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
import {
  NotebookCellHeaderActions,
  NotebookLinkedEditorHeader
} from "./components/NotebookCellHeader";
import {
  ExternalsCellView,
  InitialValuesCellView,
  SolverCellView
} from "./components/LinkedSectionViews";
import { ChartCellView, RunCellView } from "./components/RunChartViews";
import { MatrixCellView } from "./components/MatrixCellView";
import {
  buildEditorStateForStandaloneModelSections,
  buildIssueMapForStandaloneModelSections,
  EquationsCellView,
  ModelCellView
} from "./components/ModelEquationViews";
import { SequenceCellView } from "./components/SequenceCellView";
import { TableCellView } from "./components/TableCellView";
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
import { useViewportObserver } from "../hooks/useViewportObserver";

const VIEWPORT_DEFERRED_CELL_TYPES = new Set<NotebookCell["type"]>([
  "chart",
  "table",
  "matrix",
  "sequence"
]);

interface MatrixSequenceViewState {
  highlightedStepIndex: number | null;
  pendingPeriodAdvance: boolean;
  pendingPeriodRetreat: boolean;
  previousCellId: string;
  previousPeriodIndex: number;
  visibleStepCount: number;
}

export interface NotebookCellViewProps {
  activeEditorCellId: string | null;
  cell: NotebookCell;
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
  maxPeriodIndex: number;
  viewportRoot: Element | null;
  onActiveEditorCellIdChange(cellId: string | null): void;
  onSelectedCellIdChange(cellId: string): void;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  onModelChange(cellId: string, editor: EditorState): void;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onVariableInspectRequest(args: {
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  }): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedCellId: string | null;
  selectedPeriodIndex: number;
}

function NotebookCellViewComponent({
  activeEditorCellId,
  cell,
  cells,
  getModelCurrentValues,
  maxPeriodIndex,
  viewportRoot,
  onActiveEditorCellIdChange,
  onSelectedCellIdChange,
  onSelectedPeriodIndexChange,
  runner,
  selectedCellId,
  selectedPeriodIndex,
  onModelChange,
  onCellChange,
  onVariableInspectRequest
}: NotebookCellViewProps) {
  const status = runner.status[cell.id] ?? "idle";
  const error = runner.errors[cell.id];
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [titleDraft, setTitleDraft] = useState(() => cell.title);
  const [sourceDraft, setSourceDraft] = useState(() => serializeCellBody(cell));
  const [sourceLayoutMode, setSourceLayoutMode] = useState<"pretty" | "compact" | "grid">(
    cell.type === "matrix" ? "grid" : "compact"
  );
  const [openSourceMenu, setOpenSourceMenu] = useState<"insert" | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceValidationError, setSourceValidationError] = useState<string | null>(null);
  const insertMenuRef = useRef<HTMLDivElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceHighlightRef = useRef<HTMLPreElement | null>(null);
  const sourceGutterRef = useRef<HTMLPreElement | null>(null);
  const deferredBodyRef = useRef<HTMLDivElement | null>(null);
  const [measuredDeferredBodyHeight, setMeasuredDeferredBodyHeight] = useState<number | null>(null);
  const currentSerializedBody = serializeCellBody(cell);
  const hasSourceEdits =
    cell.type === "markdown"
      ? titleDraft !== cell.title || sourceDraft !== currentSerializedBody
      : sourceDraft !== currentSerializedBody;
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
  const [isLinkedEditorEditing, setIsLinkedEditorEditing] = useState(false);
  const [matrixSequenceViewState, setMatrixSequenceViewState] = useState<MatrixSequenceViewState | null>(null);
  const isActivelyEditing = isEditingSource || isLinkedEditorEditing;
  const cellViewport = useViewportObserver<HTMLElement>({
    disabled:
      isCollapsed ||
      isActivelyEditing ||
      !isViewportDeferredCellType(cell.type),
    root: viewportRoot,
    rootMargin: "800px 0px"
  });
  const shouldMountViewportDeferredBody =
    !isViewportDeferredCellType(cell.type) ||
    isCollapsed ||
    isActivelyEditing ||
    cellViewport.isInViewport ||
    selectedCellId === cell.id ||
    activeEditorCellId === cell.id;
  const showViewportDeferredPlaceholder =
    !isCollapsed &&
    !isActivelyEditing &&
    isViewportDeferredCellType(cell.type) &&
    !shouldMountViewportDeferredBody;

  useEffect(() => {
    setTitleDraft(cell.title);
    setSourceDraft(serializeCellBody(cell));
    setSourceLayoutMode(cell.type === "matrix" ? "grid" : "compact");
    setOpenSourceMenu(null);
    setSourceError(null);
    setSourceValidationError(null);
    setIsEditingSource(false);
    setIsLinkedEditorEditing(false);
    setMatrixSequenceViewState(null);
  }, [cell]);

  useEffect(() => {
    setMeasuredDeferredBodyHeight(null);
  }, [cell.id, cell.type]);

  useEffect(() => {
    if (isActivelyEditing) {
      onActiveEditorCellIdChange(cell.id);
      return;
    }

    if (activeEditorCellId === cell.id) {
      onActiveEditorCellIdChange(null);
    }
  }, [activeEditorCellId, cell.id, isActivelyEditing, onActiveEditorCellIdChange]);

  useEffect(() => {
    if (!isEditingSource) {
      setSourceValidationError(null);
      return;
    }

    try {
      parseCellSource(cell, sourceDraft, cell.type === "markdown" ? titleDraft : undefined);
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
    if (!shouldMountViewportDeferredBody || !isViewportDeferredCellType(cell.type)) {
      return;
    }

    const deferredBody = deferredBodyRef.current;
    if (!deferredBody) {
      return;
    }

    function updateMeasuredHeight(): void {
      if (!deferredBody) {
        return;
      }

      const nextHeight = Math.ceil(deferredBody.getBoundingClientRect().height);
      if (nextHeight <= 0) {
        return;
      }

      setMeasuredDeferredBodyHeight((currentHeight) =>
        currentHeight == null || Math.abs(currentHeight - nextHeight) > 1
          ? nextHeight
          : currentHeight
      );
    }

    updateMeasuredHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateMeasuredHeight);
    observer.observe(deferredBody);

    return () => {
      observer.disconnect();
    };
  }, [cell.type, shouldMountViewportDeferredBody]);

  useEffect(() => {
    if (!isEditingSource || sourceLayoutMode === "grid" || !sourceTextareaRef.current) {
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
      const nextCell = parseCellSource(
        cell,
        sourceDraft,
        cell.type === "markdown" ? titleDraft : undefined
      );
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
    setSourceLayoutMode(cell.type === "matrix" ? "grid" : "compact");
    setOpenSourceMenu(null);
    setSourceError(null);
    setSourceValidationError(null);
    setIsEditingSource(false);
  }

  function handleSourceLayoutModeChange(nextMode: "pretty" | "compact" | "grid"): void {
    if (cell.type === "markdown") {
      setSourceLayoutMode(nextMode);
      return;
    }

    if (nextMode === "grid") {
      try {
        const parsed = JSON.parse(sourceDraft) as NotebookCell;
        setSourceDraft(formatCellBody(parsed, "compact"));
      } catch {
        // Keep the current draft; the structured matrix editor only renders from valid cell state.
      }

      setSourceLayoutMode(nextMode);
      return;
    }

    try {
      const parsed = JSON.parse(sourceDraft) as NotebookCell;
      setSourceDraft(formatCellBody(parsed, nextMode));
      setSourceLayoutMode(nextMode);
    } catch {
      setSourceLayoutMode(nextMode);
    }
  }

  function handleCellClick(event: React.MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, summary, a, input, select, textarea, label, details")
    ) {
      return;
    }

    onSelectedCellIdChange(cell.id);
  }

  return (
    <NotebookRenderProfiler
      id="NotebookCellView"
      metadata={{
        cellId: cell.id,
        cellType: cell.type,
        isCollapsed,
        isSelected: selectedCellId === cell.id
      }}
    >
      <article
        ref={(node) => {
          cellViewport.targetRef.current = node;
        }}
        id={cell.id}
        className={`notebook-cell notebook-cell-${cell.type}${
          isCompactLinkedCellHeader(cell) ? " notebook-cell-linked-collapsed" : ""
        }${selectedCellId === cell.id ? " notebook-cell-is-selected" : ""}${
          activeEditorCellId === cell.id ? " notebook-cell-is-active-editor" : ""
        }`}
        onClick={handleCellClick}
      >
        <div className="notebook-cell-content">
        <div className="notebook-cell-toolbar">
          <NotebookLinkedEditorHeader
            actions={
              <NotebookCellHeaderActions
                helpDialogContent={
                  isEditingSource && cell.type === "chart" ? (
                    <pre className="notebook-source-help-code">{buildSourceHelpText(cell)}</pre>
                  ) : undefined
                }
                helpDialogTitle={
                  isEditingSource && cell.type === "chart" ? "Chart Syntax" : undefined
                }
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
                    {cell.type === "chart" && !isEditingSource ? (
                      <button
                        type="button"
                        className={`notebook-run-button notebook-reference-trace-toggle${
                          resolveChartReferenceTrace(cell, cells) === "none" ? "" : " is-active"
                        }`}
                        onClick={() =>
                          onCellChange(cell.id, (current) =>
                            current.type === "chart"
                              ? {
                                  ...current,
                                  referenceTrace: getNextChartReferenceTrace(
                                    resolveChartReferenceTrace(current, cells)
                                  )
                                }
                              : current
                          )
                        }
                      >
                        Reference: {formatChartReferenceTrace(resolveChartReferenceTrace(cell, cells))}
                      </button>
                    ) : null}
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
                  aria-expanded={openSourceMenu === "insert" ? "true" : "false"}
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
                  {cell.type === "matrix" ? (
                    <label className="notebook-source-layout-option">
                      <input
                        type="radio"
                        name={`source-layout-${cell.id}`}
                        checked={sourceLayoutMode === "grid"}
                        onChange={() => handleSourceLayoutModeChange("grid")}
                      />
                      <span>Grid</span>
                    </label>
                  ) : null}
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
              {cell.type === "chart" ? null : (
                <details className="notebook-source-help notebook-source-help-inline">
                  <summary>Syntax help</summary>
                  <pre className="notebook-source-help-code">{buildSourceHelpText(cell)}</pre>
                </details>
              )}
            </div>
            {cell.type === "markdown" ? (
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  aria-label={`Title editor for ${cell.title}`}
                />
              </label>
            ) : null}
            {cell.type === "matrix" && sourceLayoutMode === "grid" ? (
              <MatrixSourceEditor value={sourceDraft} onChange={setSourceDraft} />
            ) : (
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
            )}
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
            onEditingChange={setIsLinkedEditorEditing}
            onVariableInspectRequest={onVariableInspectRequest}
            selectedPeriodIndex={selectedPeriodIndex}
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
            onEditingChange={setIsLinkedEditorEditing}
            onChange={(editor) => onModelChange(cell.id, editor)}
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "model" ? { ...current, collapsed: !current.collapsed } : current
              )
            }
            title={cell.title}
            onVariableInspectRequest={onVariableInspectRequest}
          />
        ) : null}
        {isCollapsed ? null : cell.type === "solver" ? (
          <SolverCellView
            cell={cell}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            onEditingChange={setIsLinkedEditorEditing}
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
            editor={buildEditorStateForStandaloneModelSections(cells, cell.modelId)}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            onEditingChange={setIsLinkedEditorEditing}
            onVariableInspectRequest={onVariableInspectRequest}
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
            editor={buildEditorStateForStandaloneModelSections(cells, cell.modelId)}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            onEditingChange={setIsLinkedEditorEditing}
            onVariableInspectRequest={onVariableInspectRequest}
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
          <RunCellView
            cell={cell}
            cells={cells}
            runner={runner}
            variableDescriptions={variableDescriptions}
          />
        ) : null}
        {showViewportDeferredPlaceholder ? (
          <DeferredNotebookCellPlaceholder
            cell={cell}
            measuredHeight={measuredDeferredBodyHeight}
          />
        ) : null}
        {shouldRenderViewportDeferredBody(cell, isCollapsed, isEditingSource, shouldMountViewportDeferredBody) ? (
          <div className="notebook-cell-deferred-body" ref={deferredBodyRef}>
            {cell.type === "chart" ? (
              <ChartCellView
                cell={cell}
                cells={cells}
                runner={runner}
                selectedPeriodIndex={selectedPeriodIndex}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            ) : null}
            {cell.type === "table" ? (
              <TableCellView
                cell={cell}
                cells={cells}
                runner={runner}
                selectedPeriodIndex={selectedPeriodIndex}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
                onVariableInspectRequest={onVariableInspectRequest}
              />
            ) : null}
            {cell.type === "matrix" ? (
              <MatrixCellView
                cell={cell}
                cells={cells}
                runner={runner}
                selectedPeriodIndex={selectedPeriodIndex}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
                onVariableInspectRequest={onVariableInspectRequest}
              />
            ) : null}
            {cell.type === "sequence" ? (
              <SequenceCellView
                cell={cell}
                cells={cells}
                getModelCurrentValues={getModelCurrentValues}
                matrixSequenceViewState={matrixSequenceViewState}
                maxPeriodIndex={maxPeriodIndex}
                onCellChange={onCellChange}
                onMatrixSequenceViewStateChange={setMatrixSequenceViewState}
                onSelectedPeriodIndexChange={onSelectedPeriodIndexChange}
                onVariableInspectRequest={onVariableInspectRequest}
                runner={runner}
                selectedPeriodIndex={selectedPeriodIndex}
                variableDescriptions={variableDescriptions}
              />
            ) : null}
          </div>
        ) : null}
        </div>
      </article>
    </NotebookRenderProfiler>
  );
}

export const NotebookCellView = memo(NotebookCellViewComponent, areNotebookCellViewPropsEqual);
NotebookCellView.displayName = "NotebookCellView";

function areNotebookCellViewPropsEqual(
  previousProps: NotebookCellViewProps,
  nextProps: NotebookCellViewProps
): boolean {
  if (previousProps.cell !== nextProps.cell || previousProps.cells !== nextProps.cells) {
    return false;
  }
  if (
    previousProps.runner.outputs !== nextProps.runner.outputs ||
    previousProps.runner.status !== nextProps.runner.status ||
    previousProps.runner.errors !== nextProps.runner.errors
  ) {
    return false;
  }

  if (previousProps.viewportRoot !== nextProps.viewportRoot) {
    return false;
  }

  if (
    isNotebookCellSelected(previousProps.cell.id, previousProps.selectedCellId) !==
    isNotebookCellSelected(nextProps.cell.id, nextProps.selectedCellId)
  ) {
    return false;
  }

  if (
    isNotebookCellActiveEditor(previousProps.cell.id, previousProps.activeEditorCellId) !==
    isNotebookCellActiveEditor(nextProps.cell.id, nextProps.activeEditorCellId)
  ) {
    return false;
  }

  if (
    usesSelectedPeriodIndex(nextProps.cell) &&
    previousProps.selectedPeriodIndex !== nextProps.selectedPeriodIndex
  ) {
    return false;
  }

  if (usesMaxPeriodIndex(nextProps.cell) && previousProps.maxPeriodIndex !== nextProps.maxPeriodIndex) {
    return false;
  }

  return true;
}

function resolveChartReferenceTrace(
  cell: ChartCell,
  cells: NotebookCell[]
): NonNullable<ChartCell["referenceTrace"]> {
  if (cell.referenceTrace) {
    return cell.referenceTrace;
  }

  return "previous-run";
}

function getNextChartReferenceTrace(
  current: NonNullable<ChartCell["referenceTrace"]>
): NonNullable<ChartCell["referenceTrace"]> {
  switch (current) {
    case "none":
      return "baseline";
    case "baseline":
      return "previous-run";
    case "previous-run":
      return "none";
  }
}

function formatChartReferenceTrace(trace: NonNullable<ChartCell["referenceTrace"]>): string {
  switch (trace) {
    case "none":
      return "None";
    case "baseline":
      return "Baseline";
    case "previous-run":
      return "Previous";
  }
}

function isNotebookCellSelected(cellId: string, selectedCellId: string | null): boolean {
  return cellId === selectedCellId;
}

function isNotebookCellActiveEditor(cellId: string, activeEditorCellId: string | null): boolean {
  return cellId === activeEditorCellId;
}

function isViewportDeferredCellType(cellType: NotebookCell["type"]): boolean {
  return VIEWPORT_DEFERRED_CELL_TYPES.has(cellType);
}

function getViewportDeferredPlaceholderHeight(cell: NotebookCell): number {
  switch (cell.type) {
    case "chart":
      return 320;
    case "matrix":
      return 420;
    case "sequence":
      return 360;
    case "table":
      return 240;
    default:
      return 180;
  }
}

function shouldRenderViewportDeferredBody(
  cell: NotebookCell,
  isCollapsed: boolean,
  isEditingSource: boolean,
  shouldMountViewportDeferredBody: boolean
): boolean {
  return (
    !isCollapsed &&
    shouldMountViewportDeferredBody &&
    isViewportDeferredCellType(cell.type) &&
    !(cell.type === "matrix" && isEditingSource)
  );
}

function getViewportDeferredPlaceholderLabel(cell: NotebookCell): string {
  switch (cell.type) {
    case "chart":
      return "Chart";
    case "matrix":
      return "Matrix";
    case "sequence":
      return "Sequence diagram";
    case "table":
      return "Table";
    default:
      return "Cell";
  }
}

function DeferredNotebookCellPlaceholder({
  cell,
  measuredHeight
}: {
  cell: NotebookCell;
  measuredHeight: number | null;
}) {
  return (
    <div
      className="notebook-cell-viewport-placeholder"
      style={{ minHeight: `${measuredHeight ?? getViewportDeferredPlaceholderHeight(cell)}px` }}
    >
      <strong>{getViewportDeferredPlaceholderLabel(cell)} deferred</strong>
      <span>Scroll this cell near the viewport to mount its interactive content.</span>
    </div>
  );
}

function usesSelectedPeriodIndex(cell: NotebookCell): boolean {
  return (
    cell.type === "equations" ||
    cell.type === "model" ||
    cell.type === "externals" ||
    cell.type === "initial-values" ||
    cell.type === "chart" ||
    cell.type === "table" ||
    cell.type === "matrix" ||
    (cell.type === "sequence" && cell.source.kind === "matrix")
  );
}

function usesMaxPeriodIndex(cell: NotebookCell): boolean {
  return cell.type === "sequence" && cell.source.kind === "matrix";
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


