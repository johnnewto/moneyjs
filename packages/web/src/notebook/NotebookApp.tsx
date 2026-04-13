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
import { PeriodScrubber } from "../components/PeriodScrubber";
import { ResultChart } from "../components/ResultChart";
import { ResultTable } from "../components/ResultTable";
import { SequenceDiagramCanvas } from "../components/SequenceDiagramCanvas";
import { SolverPanel } from "../components/SolverPanel";
import {
  buildRuntimeConfig,
  diagnoseBuildRuntime,
  validateEditorState,
  type EditorState
} from "../lib/editorModel";
import {
  detectNotebookSourceFormat,
  notebookToJson,
  notebookToMarkdown,
  parseNotebookSource,
  serializeNotebookCell
} from "./document";
import { resolveSequenceDiagram } from "./sequence";
import {
  createNotebookFromTemplate,
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  isNotebookTemplateId,
  NOTEBOOK_TEMPLATES
} from "./templates";
import type {
  ChartCell,
  MatrixCell,
  ModelCell,
  NotebookCell,
  NotebookDocument,
  RunCell,
  SequenceCell,
  TableCell
} from "./types";
import { useNotebookRunner } from "./useNotebookRunner";

export function NotebookApp() {
  const [notebookDocument, setNotebookDocument] = useState(() =>
    createNotebookFromTemplate(DEFAULT_NOTEBOOK_TEMPLATE_ID)
  );
  const [importText, setImportText] = useState("");
  const [committedImportText, setCommittedImportText] = useState("");
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [sourceFormat, setSourceFormat] = useState<"json" | "markdown">("json");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [isUtilityBarVisible, setIsUtilityBarVisible] = useState(true);
  const [isDataPanelOpen, setIsDataPanelOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    document: NotebookDocument;
    source: "json" | "markdown";
  } | null>(null);
  const runner = useNotebookRunner(notebookDocument);
  const maxResultPeriodIndex = Math.max(
    0,
    ...Object.values(runner.outputs).flatMap((output) =>
      output?.type === "result"
        ? Object.values(output.result.series).map((values) => Math.max(values.length - 1, 0))
        : []
    )
  );

  useEffect(() => {
    setSelectedPeriodIndex((current) => Math.min(current, maxResultPeriodIndex));
  }, [maxResultPeriodIndex]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let upwardRevealDistance = 0;
    const topRevealThreshold = 24;
    const minimumDelta = 10;
    const upwardRevealThreshold = 180;

    function handleScroll() {
      const nextScrollY = window.scrollY;
      if (nextScrollY < topRevealThreshold) {
        setIsUtilityBarVisible(true);
        upwardRevealDistance = 0;
        lastScrollY = nextScrollY;
        return;
      }

      const delta = nextScrollY - lastScrollY;
      if (Math.abs(delta) < minimumDelta) {
        return;
      }

      if (delta > 0) {
        upwardRevealDistance = 0;
        setIsUtilityBarVisible(false);
      } else {
        upwardRevealDistance += Math.abs(delta);
        if (upwardRevealDistance >= upwardRevealThreshold) {
          setIsUtilityBarVisible(true);
        }
      }

      lastScrollY = nextScrollY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function updateCell(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void {
    setNotebookDocument((current) => ({
      ...current,
      cells: current.cells.map((cell) => (cell.id === cellId ? updater(cell) : cell))
    }));
  }

  function updateModelCell(cellId: string, editor: EditorState): void {
    updateCell(cellId, (cell) => (cell.type === "model" ? { ...cell, editor } : cell));
  }

  function updateImportText(value: string): void {
    setImportText(value);
    setImportPreview(null);
    setUiMessage(null);
  }

  function replaceNotebookDocument(nextDocument: NotebookDocument): void {
    setNotebookDocument(nextDocument);
    setSelectedPeriodIndex(0);
  }

  function handleExportJson(): void {
    const exported =
      sourceFormat === "json"
        ? notebookToJson(notebookDocument)
        : notebookToMarkdown(notebookDocument);
    setImportText(exported);
    setCommittedImportText(exported);
    setIsDataPanelOpen(true);
    navigator.clipboard
      .writeText(exported)
      .then(() =>
        setUiMessage(
          `Exported notebook ${sourceFormat === "json" ? "JSON" : "Markdown"} to the text area and clipboard.`
        )
      )
      .catch(() =>
        setUiMessage(
          `Exported notebook ${sourceFormat === "json" ? "JSON" : "Markdown"} to the text area.`
        )
      );
  }

  function handleImportJson(): void {
    try {
      const parsed = parseNotebookSource(importText);
      setImportPreview({ document: parsed.document, source: parsed.format });
      setCommittedImportText(importText);
      setUiMessage(
        `Previewed notebook ${parsed.format === "json" ? "JSON" : "Markdown"}. Apply to replace the current notebook.`
      );
    } catch (error) {
      setImportPreview(null);
      setUiMessage(
        error instanceof Error
          ? error.message
          : `Invalid notebook ${sourceFormat === "json" ? "JSON" : "Markdown"}`
      );
    }
  }

  function handleApplyImportText(): void {
    try {
      const parsed = parseNotebookSource(importText);
      replaceNotebookDocument(parsed.document);
      setCommittedImportText(importText);
      setImportPreview(null);
      setUiMessage(
        `Imported notebook ${parsed.format === "json" ? "JSON" : "Markdown"}.`
      );
    } catch (error) {
      setImportPreview(null);
      setUiMessage(
        error instanceof Error
          ? error.message
          : `Invalid notebook ${sourceFormat === "json" ? "JSON" : "Markdown"}`
      );
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const inferredFormat = inferFormatFromFileName(file.name) ?? detectNotebookSourceFormat(text);
      const parsed = parseNotebookSource(text, inferredFormat);
      setImportText(text);
      setCommittedImportText(text);
      setImportPreview({ document: parsed.document, source: parsed.format });
      setIsDataPanelOpen(true);
      setUiMessage(
        `Previewed ${file.name} as ${parsed.format === "json" ? "JSON" : "Markdown"}. Apply to replace the current notebook.`
      );
    } catch (error) {
      setImportPreview(null);
      setUiMessage(error instanceof Error ? error.message : "Unable to import notebook file");
    }
  }

  function handleApplyPreview(): void {
    if (!importPreview) {
      return;
    }
    replaceNotebookDocument(importPreview.document);
    setCommittedImportText(importText);
    setUiMessage(
      `Imported notebook ${importPreview.source === "json" ? "JSON" : "Markdown"}.`
    );
    setImportPreview(null);
  }

  function handleDiscardPreview(): void {
    setImportPreview(null);
    setUiMessage("Cleared import preview.");
  }

  function handleDiscardImportTextChanges(): void {
    setImportText(committedImportText);
    setImportPreview(null);
    setUiMessage("Discarded import text changes.");
  }

  function handleTemplateChange(templateId: string): void {
    if (!isNotebookTemplateId(templateId)) {
      return;
    }

    replaceNotebookDocument(createNotebookFromTemplate(templateId));
    setImportPreview(null);
    setUiMessage(`Loaded template ${NOTEBOOK_TEMPLATES[templateId].label}.`);
  }

  function handleDownloadJson(): void {
    const exported =
      sourceFormat === "json"
        ? notebookToJson(notebookDocument)
        : notebookToMarkdown(notebookDocument);
    const blob = new Blob([exported], {
      type: sourceFormat === "json" ? "application/json" : "text/markdown"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${notebookDocument.id}.${sourceFormat === "json" ? "sfnb.json" : "sfnb.md"}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setUiMessage("Downloaded notebook JSON.");
  }

  function handleValidateNotebook(): void {
    const modelCells = notebookDocument.cells.filter(
      (cell): cell is ModelCell => cell.type === "model"
    );
    const issueCount = modelCells.reduce((count, cell) => {
      const issues = validateEditorState(cell.editor);
      const diagnostics = diagnoseBuildRuntime(cell.editor);
      return count + issues.length + diagnostics.issues.length;
    }, 0);

    setUiMessage(
      issueCount === 0
        ? `Validated ${modelCells.length} model cell${modelCells.length === 1 ? "" : "s"} with no issues.`
        : `Validation found ${issueCount} issue${issueCount === 1 ? "" : "s"} across ${modelCells.length} model cell${modelCells.length === 1 ? "" : "s"}.`
    );
  }

  function getCurrentValueMapForModelCell(modelCellId: string): Record<string, number | undefined> {
    const sourceRunCell = notebookDocument.cells.find(
      (cell) => cell.type === "run" && cell.sourceModelCellId === modelCellId
    );
    if (!sourceRunCell || sourceRunCell.type !== "run") {
      return {};
    }

    const result = runner.getResult(sourceRunCell.id);
    if (!result) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(result.series).map(([name, values]) => [
        name,
        values[Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0))]
      ])
    );
  }

  function scrollToCell(cellId: string): void {
    document.getElementById(cellId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  const hasPendingImportTextChanges = importText !== committedImportText;
  const currentTemplateId = isNotebookTemplateId(notebookDocument.metadata.template ?? "")
    ? notebookDocument.metadata.template
    : "";

  return (
    <main className="app-shell">
      <section
        className={`control-panel notebook-app-bar${isUtilityBarVisible ? "" : " is-hidden"}`}
      >
        <div className="notebook-app-bar-main">
          <div className="notebook-app-bar-brand">
            <span className="eyebrow">Notebook commands</span>
            <strong>{notebookDocument.title}</strong>
          </div>

          <div className="notebook-app-bar-actions">
            <label className="notebook-action-desktop">
              <span className="sr-only">Notebook template</span>
              <select
                aria-label="Notebook template"
                value={currentTemplateId}
                onChange={(event) => handleTemplateChange(event.target.value)}
              >
                {currentTemplateId ? null : <option value="">Custom notebook</option>}
                {Object.values(NOTEBOOK_TEMPLATES).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void runner.runAll()}>
              Run all
            </button>
            <button
              type="button"
              className="secondary-button notebook-action-desktop"
              onClick={handleValidateNotebook}
            >
              Validate
            </button>
            <button
              type="button"
              className="secondary-button notebook-action-desktop"
              onClick={handleExportJson}
            >
              Export
            </button>
            <button
              type="button"
              className="secondary-button notebook-action-desktop"
              onClick={() => {
                setIsDataPanelOpen(true);
              }}
            >
              Import
            </button>
            <a className="notebook-toolbar-link notebook-action-desktop" href="#/workspace">
              Workspace
            </a>
          </div>
        </div>
      </section>

      {uiMessage ? (
        <section className="status-panel">
          <div className={uiMessage.toLowerCase().includes("imported") || uiMessage.toLowerCase().includes("exported") || uiMessage.toLowerCase().includes("downloaded") ? "success-text" : "error-text"}>
            {uiMessage}
          </div>
        </section>
      ) : null}

      <div className="notebook-layout">
        <div className="notebook-main-column">
          <section
            className={`control-panel notebook-data-panel${
              isDataPanelOpen ? "" : " is-collapsed"
            }`}
          >
            <div className="notebook-utility-topline">
              <div className="notebook-utility-title">
                Import / Export {sourceFormat === "json" ? "JSON" : "Markdown"}
              </div>
              <div className="notebook-utility-actions">
                <div className="mode-switch" aria-label="Notebook source formats">
                  <button
                    type="button"
                    className={`mode-switch-link${sourceFormat === "json" ? " is-active" : ""}`}
                    onClick={() => {
                      setSourceFormat("json");
                      setImportPreview(null);
                    }}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    className={`mode-switch-link${sourceFormat === "markdown" ? " is-active" : ""}`}
                    onClick={() => {
                      setSourceFormat("markdown");
                      setImportPreview(null);
                    }}
                  >
                    Markdown
                  </button>
                </div>
                <input
                  className="notebook-file-input"
                  type="file"
                  accept={
                    sourceFormat === "json"
                      ? "application/json,.json"
                      : "text/markdown,.md,.markdown,.txt"
                  }
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleImportFile(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <button type="button" className="notebook-utility-button" onClick={handleImportJson}>
                  Preview import
                </button>
                <button type="button" className="notebook-utility-button" onClick={handleExportJson}>
                  Export to text
                </button>
                <button type="button" className="notebook-utility-button" onClick={handleDownloadJson}>
                  Download {sourceFormat === "json" ? "JSON" : "Markdown"}
                </button>
                <button
                  type="button"
                  className="secondary-button notebook-utility-button notebook-utility-button-muted"
                  onClick={() => setIsDataPanelOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <textarea
              className="json-area notebook-utility-textarea"
              value={importText}
              onChange={(event) => updateImportText(event.target.value)}
              placeholder={
                sourceFormat === "json"
                  ? "Paste a notebook JSON document"
                  : "Paste notebook Markdown with headings and fenced sfcr-* blocks"
              }
            />

            {hasPendingImportTextChanges ? (
              <div className="notebook-import-draft-actions">
                <div className="status-hint">Unapplied import text changes.</div>
                <div className="button-row">
                  <button type="button" onClick={handleApplyImportText}>
                    Apply text
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDiscardImportTextChanges}
                  >
                    Discard text
                  </button>
                </div>
              </div>
            ) : null}

            {importPreview ? (
              <div className="notebook-import-preview-actions">
                <div className="status-hint">
                  Preview ready: {importPreview.document.title} ({importPreview.document.cells.length} cells)
                </div>
                <div className="button-row">
                  <button type="button" onClick={handleApplyPreview}>
                    Apply preview
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDiscardPreview}
                  >
                    Discard preview
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {maxResultPeriodIndex > 0 ? (
            <div className="notebook-scrubber-slot">
              <PeriodScrubber
                maxIndex={maxResultPeriodIndex}
                onChange={setSelectedPeriodIndex}
                selectedIndex={selectedPeriodIndex}
              />
            </div>
          ) : null}

          <section className="notebook-canvas" aria-label="Notebook sheet">
            {notebookDocument.cells.map((cell) => (
              <NotebookCellView
                key={cell.id}
                cell={cell}
                cells={notebookDocument.cells}
                getModelCurrentValues={getCurrentValueMapForModelCell}
                maxPeriodIndex={maxResultPeriodIndex}
                onSelectedPeriodIndexChange={setSelectedPeriodIndex}
                runner={runner}
                onModelChange={updateModelCell}
                onCellChange={updateCell}
                selectedPeriodIndex={selectedPeriodIndex}
              />
            ))}
          </section>
        </div>

        <aside className="notebook-outline notebook-rail editor-panel">
          <div className="panel-header">
            <div>
              <h2>Outline</h2>
              <p className="panel-subtitle">BMW vignette sections translated into notebook cells.</p>
            </div>
          </div>

          <ol className="notebook-outline-list">
            {notebookDocument.cells.map((cell, index) => (
              <li key={cell.id}>
                <button type="button" onClick={() => scrollToCell(cell.id)}>
                  <span className="outline-index">{index + 1}</span>
                  <span>{cell.title}</span>
                </button>
              </li>
            ))}
          </ol>

          {importPreview ? (
            <section className="editor-panel notebook-preview-panel">
              <div className="panel-header">
                <div>
                  <h2>Import Preview</h2>
                  <p className="panel-subtitle">
                    Review the parsed notebook before replacing the current document.
                  </p>
                </div>
              </div>

              <ul className="notebook-inline-list">
                <li>Title: {importPreview.document.title}</li>
                <li>Cells: {importPreview.document.cells.length}</li>
                <li>
                  Types: {summarizeCellTypes(importPreview.document.cells)}
                </li>
              </ul>

              <div className="button-row">
                <button type="button" onClick={handleApplyPreview}>
                  Apply preview
                </button>
                <button type="button" className="secondary-button" onClick={handleDiscardPreview}>
                  Discard preview
                </button>
              </div>
            </section>
          ) : null}
        </aside>

      </div>
    </main>
  );
}

function inferFormatFromFileName(fileName: string): "json" | "markdown" | null {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".json")) {
    return "json";
  }
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return "markdown";
  }
  return null;
}

interface NotebookCellViewProps {
  cell: NotebookCell;
  cells: NotebookCell[];
  getModelCurrentValues(modelCellId: string): Record<string, number | undefined>;
  maxPeriodIndex: number;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  onModelChange(cellId: string, editor: EditorState): void;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
}

function NotebookCellView({
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
    <article id={cell.id} className={`notebook-cell notebook-cell-${cell.type}`}>
      <div className="notebook-cell-content">
        <div className="notebook-cell-toolbar">
          <div className="notebook-cell-heading">
            <div className="notebook-cell-type-rule">
              <span className="notebook-cell-type-tag">{cell.type}</span>
            </div>
            <h2>{cell.title}</h2>
          </div>
          <div className="notebook-run-actions">
            {cell.type === "run" ? (
              <>
                <span className={`run-status run-status-${status}`}>{status}</span>
                <button type="button" onClick={() => void runner.runCell(cell.id)}>
                  Run cell
                </button>
              </>
            ) : null}
          </div>
          {isSourceEditable(cell) ? (
            <button
              type="button"
              className="secondary-button notebook-source-toggle"
              onClick={() => setIsEditingSource((current) => !current)}
            >
              {isEditingSource ? "Hide source" : "Edit source"}
            </button>
          ) : null}
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
            {sourceValidationError ? (
              <div className="notebook-source-validation" aria-live="polite">
                Live validation: {sourceValidationError}
              </div>
            ) : (
              <div className="notebook-source-validation is-valid" aria-live="polite">
                Live validation: ready to apply
              </div>
            )}
            <div className="button-row">
              <button type="button" onClick={handleApplySource}>
                Apply source
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setTitleDraft(cell.title);
                  setSourceDraft(serializeCellBody(cell));
                  setSourceLayoutMode("compact");
                  setOpenSourceMenu(null);
                  setSourceError(null);
                  setSourceValidationError(null);
                  setIsEditingSource(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {cell.type === "markdown" ? <p className="notebook-markdown">{cell.source}</p> : null}
        {cell.type === "model" ? (
          <ModelCellView
            cell={cell}
            currentValues={getModelCurrentValues(cell.id)}
            onChange={(editor) => onModelChange(cell.id, editor)}
          />
        ) : null}
        {cell.type === "run" ? <RunCellView cell={cell} /> : null}
        {cell.type === "chart" ? (
          <ChartCellView cell={cell} runner={runner} selectedPeriodIndex={selectedPeriodIndex} />
        ) : null}
        {cell.type === "table" ? (
          <TableCellView cell={cell} runner={runner} selectedPeriodIndex={selectedPeriodIndex} />
        ) : null}
        {cell.type === "matrix" ? (
          <MatrixCellView cell={cell} runner={runner} selectedPeriodIndex={selectedPeriodIndex} />
        ) : null}
        {cell.type === "sequence" ? (
          <SequenceCellView
            cell={cell}
            cells={cells}
            maxPeriodIndex={maxPeriodIndex}
            onSelectedPeriodIndexChange={onSelectedPeriodIndexChange}
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
          />
        ) : null}
      </div>
    </article>
  );
}

function ModelCellView({
  cell,
  currentValues,
  onChange
}: {
  cell: ModelCell;
  currentValues: Record<string, number | undefined>;
  onChange(editor: EditorState): void;
}) {
  const issues = validateEditorState(cell.editor);
  const buildDiagnostics = diagnoseBuildRuntime(cell.editor);
  const allIssues = [...issues, ...buildDiagnostics.issues];
  const issueMap = Object.fromEntries(allIssues.map((issue) => [issue.path, issue.message]));
  const runtime = safeBuildRuntime(cell.editor);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<PinnedTrace | null>(null);
  const parameterNameSet = useMemo(
    () => new Set(cell.editor.externals.map((external) => external.name)),
    [cell.editor.externals]
  );
  const traceModel = useMemo(() => buildTraceModel(cell.editor.equations), [cell.editor.equations]);
  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "inputs")
      : null;

  return (
    <div className="notebook-model-stack">
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

      <section className="notebook-model-view" aria-label="Model view">
        <div className="notebook-model-view-header">
          <h3>Model view</h3>
          <p className="panel-subtitle">Compact read-only equation list.</p>
        </div>
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
                  {equation.name
                    ? highlightFormula(
                        equation.name,
                        parameterNameSet,
                        traceRole ? activeTrace?.tokenStates : undefined
                      )
                    : "?"}
                </span>
                <span className="notebook-model-view-expression" role="cell">
                  {equation.expression
                    ? highlightFormula(
                        equation.expression,
                        parameterNameSet,
                        traceRole ? activeTrace?.tokenStates : undefined
                      )
                    : " "}
                </span>
                <span className="notebook-model-view-current" role="cell">
                  {formatNotebookCurrentValue(
                    equation.name,
                    currentValues[equation.name.trim()]
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <details className="notebook-model-editor">
        <summary>Edit model cell</summary>
        <div className="notebook-model-editor-body">
          <EquationGridEditor
            buildError={buildDiagnostics.modelError}
            currentValues={currentValues}
            equations={cell.editor.equations}
            issues={issueMap}
            onChange={(equations) => onChange({ ...cell.editor, equations })}
            parameterNames={cell.editor.externals.map((external) => external.name)}
          />
          <ExternalEditor
            currentValues={currentValues}
            externals={cell.editor.externals}
            issues={issueMap}
            onChange={(externals) => onChange({ ...cell.editor, externals })}
          />
          <InitialValuesEditor
            currentValues={currentValues}
            initialValues={cell.editor.initialValues}
            issues={issueMap}
            onChange={(initialValues) => onChange({ ...cell.editor, initialValues })}
          />
          <SolverPanel
            options={cell.editor.options}
            issues={issueMap}
            onChange={(options) => onChange({ ...cell.editor, options })}
          />
        </div>
      </details>
    </div>
  );
}

function RunCellView({ cell }: { cell: RunCell }) {
  return (
    <div className="notebook-run-summary">
      <p>{cell.description ?? "Execute this cell to generate a simulation result."}</p>
      <ul className="notebook-inline-list">
        <li>Mode: {cell.mode}</li>
        <li>Source model: {cell.sourceModelCellId}</li>
        <li>Result key: {cell.resultKey}</li>
        <li>Scenario shocks: {cell.scenario?.shocks.length ?? 0}</li>
      </ul>
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
                    <strong>{name}</strong>: {formatShockValue(value)}
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
  runner,
  selectedPeriodIndex
}: {
  cell: ChartCell;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
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

  return (
    <ResultChart
      axisMode={cell.axisMode ?? "shared"}
      axisSnap={cell.axisSnap}
      seriesRanges={cell.seriesRanges}
      selectedIndex={selectedPeriodIndex}
      series={series}
      sharedRange={cell.sharedRange}
    />
  );
}

function TableCellView({
  cell,
  runner,
  selectedPeriodIndex
}: {
  cell: TableCell;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return <div className="status-hint">Run the source cell to populate this summary table.</div>;
  }

  const rows = cell.variables.map((name) => {
    const values = result.series[name] ?? [];
    return {
      name,
      selected: values[Math.min(selectedPeriodIndex, values.length - 1)] ?? NaN,
      start: values[0] ?? NaN,
      end: values[values.length - 1] ?? NaN
    };
  });

  return <ResultTable title={cell.title} rows={rows} selectedIndex={selectedPeriodIndex} />;
}

function MatrixCellView({
  cell,
  runner,
  selectedPeriodIndex
}: {
  cell: MatrixCell;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
}) {
  const result = cell.sourceRunCellId ? runner.getResult(cell.sourceRunCellId) : null;
  const evaluatedMatrix = useMemo(
    () => buildEvaluatedMatrix(cell, result, selectedPeriodIndex),
    [cell.rows, result, selectedPeriodIndex]
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
                  {column}
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
                <th scope="row">{row.label}</th>
                {row.entries.map((entry, index) => (
                  <td
                    key={`${row.label}-${cell.columns[index] ?? index}`}
                    className={entry.isSumCell && !entry.isBalanced ? "matrix-balance-error" : undefined}
                  >
                    <div className="matrix-entry-inline">
                      <span className="matrix-entry-source">{entry.source}</span>
                      {entry.resolved ? (
                        <span className="matrix-entry-current">{entry.resolved}</span>
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
  selectedPeriodIndex
}: {
  cell: SequenceCell;
  cells: NotebookCell[];
  maxPeriodIndex: number;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
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

function externalValueAt(
  result: SimulationResult,
  variable: string,
  periodIndex: number
): number {
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

function formatNotebookCurrentValue(name: string, value: number | undefined): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "";
  }
  if (!Number.isFinite(value)) {
    return `${trimmedName} = --`;
  }
  return `${trimmedName} = ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
}

function formatShockValue(
  value: { kind: "constant"; value: number } | { kind: "series"; values: number[] }
): string {
  if (value.kind === "constant") {
    return value.value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  return `[${value.values.map((item) => item.toLocaleString(undefined, { maximumFractionDigits: 6 })).join(", ")}]`;
}

function safeBuildRuntime(editor: EditorState) {
  try {
    return buildRuntimeConfig(editor);
  } catch {
    return null;
  }
}

function summarizeCellTypes(cells: NotebookCell[]): string {
  const counts = cells.reduce<Record<string, number>>((accumulator, cell) => {
    accumulator[cell.type] = (accumulator[cell.type] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([type, count]) => `${type} (${count})`)
    .join(", ");
}

function isSourceEditable(cell: NotebookCell): boolean {
  return cell.type !== "model";
}

function serializeCellBody(cell: NotebookCell): string {
  if (cell.type === "markdown") {
    return cell.source;
  }
  const { title, ...cellBody } = serializeNotebookCell(cell);
  return formatCellBody(cellBody, "compact");
}

function formatCellBody(
  cellBody: Omit<NotebookCell, "title">,
  mode: "pretty" | "compact"
): string {
  return mode === "pretty"
    ? JSON.stringify(cellBody, null, 2)
    : stringifyJsonWithCompactLeaves(cellBody, 0);
}

function highlightSourceDraft(source: string, cellType: NotebookCell["type"]): ReactNode[] {
  if (cellType === "markdown") {
    return highlightMarkdownSource(source);
  }

  return highlightJsonSource(source);
}

function highlightJsonSource(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  source.replace(
    /"(?:\\.|[^"\\])*"(?=\s*:)?|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g,
    (match, offset) => {
      if (offset > cursor) {
        parts.push(source.slice(cursor, offset));
      }

      parts.push(
        <span key={`${offset}-${match}`} className={tokenClassForJson(source, match, offset)}>
          {match}
        </span>
      );
      cursor = offset + match.length;
      return match;
    }
  );

  if (cursor < source.length) {
    parts.push(source.slice(cursor));
  }

  return parts;
}

function tokenClassForJson(source: string, token: string, offset: number): string {
  if (token === "true" || token === "false") {
    return "token-boolean";
  }
  if (token === "null") {
    return "token-null";
  }
  if (/^-?\d/.test(token)) {
    return "token-number";
  }
  if (/^"/.test(token)) {
    const trailing = source.slice(offset + token.length);
    return /^\s*:/.test(trailing) ? "token-key" : "token-string";
  }
  return "token-punctuation";
}

function highlightMarkdownSource(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    if (index > 0) {
      parts.push("\n");
    }

    const headingMatch = line.match(/^(#+\s.*)$/);
    if (headingMatch) {
      parts.push(
        <span key={`md-heading-${index}`} className="token-heading">
          {line}
        </span>
      );
      return;
    }

    let cursor = 0;
    line.replace(/`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/g, (match, offset) => {
      if (offset > cursor) {
        parts.push(line.slice(cursor, offset));
      }
      parts.push(
        <span key={`md-${index}-${offset}`} className="token-markdown">
          {match}
        </span>
      );
      cursor = offset + match.length;
      return match;
    });

    if (cursor < line.length) {
      parts.push(line.slice(cursor));
    }
  });

  return parts;
}

function stringifyJsonWithCompactLeaves(value: unknown, level: number): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    if (value.every(isInlineJsonValue)) {
      return `[${value.map((entry) => stringifyInlineJsonValue(entry)).join(", ")}]`;
    }

    const indentation = "  ".repeat(level);
    const childIndentation = "  ".repeat(level + 1);
    return `[\n${value
      .map((entry) => `${childIndentation}${stringifyJsonWithCompactLeaves(entry, level + 1)}`)
      .join(",\n")}\n${indentation}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }

  if (level > 0 && entries.every(([, entryValue]) => isInlineJsonValue(entryValue))) {
    return `{ ${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}: ${stringifyInlineJsonValue(entryValue)}`)
      .join(", ")} }`;
  }

  const indentation = "  ".repeat(level);
  const childIndentation = "  ".repeat(level + 1);
  return `{\n${entries
    .map(
      ([key, entryValue]) =>
        `${childIndentation}${JSON.stringify(key)}: ${stringifyJsonWithCompactLeaves(entryValue, level + 1)}`
    )
    .join(",\n")}\n${indentation}}`;
}

function stringifyInlineJsonValue(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringifyInlineJsonValue(entry)).join(", ")}]`;
  }

  return `{ ${Object.entries(value)
    .map(([key, entryValue]) => `${JSON.stringify(key)}: ${stringifyInlineJsonValue(entryValue)}`)
    .join(", ")} }`;
}

function isInlineJsonValue(value: unknown): boolean {
  if (value == null || typeof value !== "object") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => entry == null || typeof entry !== "object");
  }

  return Object.values(value).every((entry) => entry == null || typeof entry !== "object");
}

function parseCellSource(cell: NotebookCell, title: string, source: string): NotebookCell {
  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error("Cell title is required.");
  }

  if (cell.type === "markdown") {
    return {
      ...cell,
      title: nextTitle,
      source
    };
  }

  const parsed = JSON.parse(source) as Omit<NotebookCell, "title">;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Cell source must parse to an object.");
  }
  if (parsed.type !== cell.type) {
    throw new Error(`Cell source must remain type '${cell.type}'.`);
  }
  if (typeof parsed.id !== "string") {
    throw new Error("Cell source must include id.");
  }
  validateCellSourceShape(cell.type, parsed);
  return normalizeCellSource({ ...parsed, title: nextTitle } as NotebookCell);
}

function normalizeCellSource(cell: NotebookCell): NotebookCell {
  if (cell.type !== "run" || !cell.scenario) {
    return cell;
  }

  return {
    ...cell,
    scenario: {
      ...cell.scenario,
      shocks: cell.scenario.shocks.map((shock) => {
        const candidate = shock as typeof shock & { rangeInclusive?: [number, number] };
        const start = candidate.rangeInclusive?.[0] ?? shock.startPeriodInclusive;
        const end = candidate.rangeInclusive?.[1] ?? shock.endPeriodInclusive;
        return {
          ...shock,
          startPeriodInclusive: start,
          endPeriodInclusive: end
        };
      })
    }
  };
}

function validateCellSourceShape(cellType: NotebookCell["type"], parsed: Omit<NotebookCell, "title">): void {
  switch (cellType) {
    case "run":
      if (typeof (parsed as RunCell).sourceModelCellId !== "string") {
        throw new Error("Run cells require sourceModelCellId.");
      }
      if (!["baseline", "scenario"].includes(String((parsed as RunCell).mode))) {
        throw new Error("Run cells require mode to be 'baseline' or 'scenario'.");
      }
      if (typeof (parsed as RunCell).resultKey !== "string") {
        throw new Error("Run cells require resultKey.");
      }
      ((parsed as RunCell).scenario?.shocks ?? []).forEach((shock, index) => {
        const candidate = shock as typeof shock & { rangeInclusive?: [number, number] };
        if (
          candidate.rangeInclusive != null &&
          (!Array.isArray(candidate.rangeInclusive) ||
            candidate.rangeInclusive.length !== 2 ||
            candidate.rangeInclusive.some((value) => typeof value !== "number"))
        ) {
          throw new Error(
            `scenario.shocks.${index}.rangeInclusive must be a [start, end] number pair.`
          );
        }
      });
      return;
    case "chart":
      if (typeof (parsed as ChartCell).sourceRunCellId !== "string") {
        throw new Error("Chart cells require sourceRunCellId.");
      }
      if (!Array.isArray((parsed as ChartCell).variables)) {
        throw new Error("Chart cells require variables to be an array.");
      }
      if (
        (parsed as ChartCell).axisMode != null &&
        !["shared", "separate"].includes(String((parsed as ChartCell).axisMode))
      ) {
        throw new Error("Chart axisMode must be 'shared' or 'separate'.");
      }
      if ((parsed as ChartCell).axisSnap != null) {
        const axisSnap = (parsed as ChartCell).axisSnap as unknown as Record<string, unknown>;
        if (typeof axisSnap !== "object" || Array.isArray(axisSnap)) {
          throw new Error("Chart axisSnap must be an object.");
        }
        if (typeof axisSnap.enabled !== "boolean") {
          throw new Error("Chart axisSnap.enabled must be a boolean.");
        }
        if (axisSnap.tolerance != null && typeof axisSnap.tolerance !== "number") {
          throw new Error("Chart axisSnap.tolerance must be a number.");
        }
      }
      validateChartAxisRange((parsed as ChartCell).sharedRange, "sharedRange");
      if (
        (parsed as ChartCell).seriesRanges != null &&
        (typeof (parsed as ChartCell).seriesRanges !== "object" ||
          Array.isArray((parsed as ChartCell).seriesRanges))
      ) {
        throw new Error("Chart seriesRanges must be an object keyed by variable name.");
      }
      Object.entries((parsed as ChartCell).seriesRanges ?? {}).forEach(([name, range]) => {
        validateChartAxisRange(range, `seriesRanges.${name}`);
      });
      return;
    case "table":
      if (typeof (parsed as TableCell).sourceRunCellId !== "string") {
        throw new Error("Table cells require sourceRunCellId.");
      }
      if (!Array.isArray((parsed as TableCell).variables)) {
        throw new Error("Table cells require variables to be an array.");
      }
      return;
    case "matrix":
      if (!Array.isArray((parsed as MatrixCell).columns)) {
        throw new Error("Matrix cells require columns to be an array.");
      }
      if (!Array.isArray((parsed as MatrixCell).rows)) {
        throw new Error("Matrix cells require rows to be an array.");
      }
      return;
    case "sequence":
      if (
        !(parsed as SequenceCell).source ||
        typeof (parsed as SequenceCell).source !== "object"
      ) {
        throw new Error("Sequence cells require a source object.");
      }
      return;
    case "markdown":
    case "model":
      return;
  }
}

function buildSourceHelperActions(cell: NotebookCell): Array<{ label: string; insert: string }> {
  switch (cell.type) {
    case "chart":
      return [
        { label: "Add axisMode", insert: '"axisMode": "shared"' },
        { label: "Shared range", insert: '"sharedRange": {\n  "mode": "manual",\n  "min": 0,\n  "max": 200\n}' },
        { label: "Series ranges", insert: '"seriesRanges": {\n  "y": {\n    "mode": "auto",\n    "includeZero": true\n  }\n}' },
        { label: "Axis snap", insert: '"axisSnap": {\n  "enabled": true,\n  "tolerance": 0.1\n}' },
        { label: "Include zero", insert: '"sharedRange": {\n  "mode": "auto",\n  "includeZero": true\n}' },
        { label: "Use shared", insert: '"axisMode": "shared"' },
        { label: "Use separate", insert: '"axisMode": "separate"' },
        { label: "Variables array", insert: '"variables": ["y", "c"]' }
      ];
    case "run":
      return [
        {
          label: "Scenario skeleton",
          insert:
            '"scenario": {\n  "shocks": [\n    {\n      "rangeInclusive": [1, 4],\n      "variables": {\n        "Gd": {\n          "kind": "constant",\n          "value": 25\n        }\n      }\n    }\n  ]\n}'
        },
        { label: "Add shock", insert: '"shocks": []' },
        { label: "Result key", insert: '"resultKey": "scenario_result"' }
      ];
    case "table":
      return [{ label: "Variables array", insert: '"variables": ["y", "c"]' }];
    case "matrix":
      return [
        { label: "Columns array", insert: '"columns": ["Households", "Firms"]' },
        { label: "Rows array", insert: '"rows": []' }
      ];
    case "sequence":
      return [{ label: "Matrix source", insert: '"source": {\n  "kind": "matrix",\n  "matrixCellId": "matrix-1"\n}' }];
    case "markdown":
      return [
        { label: "Code span", insert: "`variable`" },
        { label: "Bullet list", insert: "- item one\n- item two" }
      ];
    case "model":
      return [];
  }
}

function buildSourceHelpText(cell: NotebookCell): string {
  switch (cell.type) {
    case "markdown":
      return "Markdown cell source is plain text.\n\nExample:\nUpdated notebook overview with `inline code` and a short bullet list.";
    case "run":
      return `Required fields:
- id
- type: "run"
- sourceModelCellId
- mode: "baseline" | "scenario"
- resultKey

Scenario example:
${formatCellBody(
  {
    id: cell.id,
    type: "run",
    sourceModelCellId: "equations",
    mode: "scenario",
    resultKey: "example_result",
    scenario: {
      shocks: [
        {
          rangeInclusive: [5, 12],
          variables: {
            phi: { kind: "constant", value: 0.35 }
          }
        }
      ]
    }
  } as Omit<NotebookCell, "title">,
  "compact"
)}`;
    case "chart":
      return `Required fields:
- id
- type: "chart"
- sourceRunCellId
- variables: string[]

Optional:
- axisMode: "shared" | "separate"
- axisSnap: { "enabled": boolean, "tolerance"?: number }
- sharedRange: { "mode": "auto" | "manual", "includeZero"?: boolean, "min"?: number, "max"?: number }
- seriesRanges: { [variableName]: range }

Example:
${formatCellBody(
  {
    id: cell.id,
    type: "chart",
    sourceRunCellId: "baseline-run",
    variables: ["ydhs", "c", "p"],
    axisMode: "separate",
    axisSnap: {
      enabled: true,
      tolerance: 0.1
    },
    sharedRange: {
      mode: "auto",
      includeZero: true
    },
    seriesRanges: {
      p: {
        mode: "manual",
        min: 0,
        max: 2
      }
    }
  } as Omit<NotebookCell, "title">,
  "compact"
)}`;
    case "table":
      return `Required fields:
- id
- type: "table"
- sourceRunCellId
- variables: string[]`;
    case "matrix":
      return `Required fields:
- id
- type: "matrix"
- columns: string[]
- rows: [{ "label": string, "values": string[] }]`;
    case "sequence":
      return `Required fields:
- id
- type: "sequence"
- source

Source can be:
- { "kind": "plantuml", "source": "..." }
- { "kind": "matrix", "matrixCellId": "matrix-1" }`;
    case "model":
      return "";
  }
}

function applySourceHelper(currentSource: string, insert: string): string {
  const trimmed = currentSource.trimEnd();
  if (!trimmed) {
    return insert;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return insertIntoJsonObject(trimmed, insert);
  }

  return `${trimmed}\n${insert}`;
}

function insertIntoJsonObject(source: string, insert: string): string {
  const closingIndex = source.lastIndexOf("}");
  if (closingIndex <= 0) {
    return `${source}\n${insert}`;
  }

  const beforeClosing = source.slice(0, closingIndex).trimEnd();
  const needsComma = !beforeClosing.endsWith("{");
  const indentation = "  ";
  const formattedInsert = insert
    .split("\n")
    .map((line) => `${indentation}${line}`)
    .join("\n");

  return `${beforeClosing}${needsComma ? "," : ""}\n${formattedInsert}\n}`;
}

function validateChartAxisRange(range: unknown, label: string): void {
  if (range == null) {
    return;
  }
  if (typeof range !== "object" || Array.isArray(range)) {
    throw new Error(`${label} must be an object.`);
  }

  const candidate = range as Record<string, unknown>;
  if (!["auto", "manual"].includes(String(candidate.mode))) {
    throw new Error(`${label}.mode must be 'auto' or 'manual'.`);
  }
  if (candidate.includeZero != null && typeof candidate.includeZero !== "boolean") {
    throw new Error(`${label}.includeZero must be a boolean.`);
  }
  if (candidate.min != null && typeof candidate.min !== "number") {
    throw new Error(`${label}.min must be a number.`);
  }
  if (candidate.max != null && typeof candidate.max !== "number") {
    throw new Error(`${label}.max must be a number.`);
  }
  if (
    typeof candidate.min === "number" &&
    typeof candidate.max === "number" &&
    !(candidate.min < candidate.max)
  ) {
    throw new Error(`${label}.min must be less than ${label}.max.`);
  }
}
