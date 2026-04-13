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
import { InstantTooltip } from "../components/InstantTooltip";
import { VariableLabel } from "../components/VariableLabel";
import {
  buildRuntimeConfig,
  diagnoseBuildRuntime,
  validateEditorState,
  type EditorState
} from "../lib/editorModel";
import { stringifyJsonWithCompactLeaves } from "../lib/jsonFormat";
import {
  buildVariableDescriptions,
  getVariableDescription,
  type VariableDescriptions
} from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";
import { formatNamedValueWithUnits, formatValueWithUnits } from "../lib/unitMeta";
import {
  detectNotebookSourceFormat,
  notebookToJson,
  notebookToMarkdown,
  parseNotebookSource,
  serializeNotebookCell
} from "./document";
import {
  buildEditorStateForNotebookModel,
  buildEditorStateFromSections,
  countModelSectionIssues,
  findEquationsCell,
  findExternalsCell,
  findInitialValuesCell,
  findSolverCell,
  resolveNotebookModelKey,
  resolveRunCellModelKey
} from "./modelSections";
import { resolveSequenceDiagram } from "./sequence";
import {
  createNotebookFromTemplate,
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  type NotebookTemplateId,
  isNotebookTemplateId,
  NOTEBOOK_TEMPLATES
} from "./templates";
import type {
  ChartCell,
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  MatrixCell,
  ModelCell,
  NotebookCell,
  NotebookDocument,
  RunCell,
  SequenceCell,
  SolverCell,
  TableCell
} from "./types";
import { useNotebookRunner } from "./useNotebookRunner";

export function NotebookApp() {
  const [notebookDocument, setNotebookDocument] = useState(() =>
    createNotebookFromTemplate(resolveNotebookTemplateIdFromHash(window.location.hash))
  );
  const [importText, setImportText] = useState("");
  const [committedImportText, setCommittedImportText] = useState("");
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [sourceFormat, setSourceFormat] = useState<"json" | "markdown">("json");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
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

  function replaceNotebookDocumentFromTemplate(templateId: NotebookTemplateId): void {
    replaceNotebookDocument(createNotebookFromTemplate(templateId));
  }

  useEffect(() => {
    function handleHashChange(): void {
      const templateId = parseNotebookTemplateIdFromHash(window.location.hash);
      if (!templateId) {
        return;
      }
      if (notebookDocument.metadata.template === templateId) {
        return;
      }
      replaceNotebookDocumentFromTemplate(templateId);
      setImportPreview(null);
      setUiMessage(`Loaded template ${NOTEBOOK_TEMPLATES[templateId].label}.`);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [notebookDocument.metadata.template]);

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
      writeNotebookHash();
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
      if (!isNotebookTemplateId(parsed.document.metadata.template ?? "")) {
        writeNotebookHash();
      }
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
    if (!isNotebookTemplateId(importPreview.document.metadata.template ?? "")) {
      writeNotebookHash();
    }
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

    replaceNotebookDocumentFromTemplate(templateId);
    writeNotebookHash(templateId);
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
    const legacyEditors = notebookDocument.cells
      .filter((cell): cell is ModelCell => cell.type === "model")
      .map((cell) => cell.editor);
    const modelIds = Array.from(
      new Set(
        notebookDocument.cells
          .filter(
            (cell): cell is EquationsCell | SolverCell | ExternalsCell | InitialValuesCell =>
              cell.type === "equations" ||
              cell.type === "solver" ||
              cell.type === "externals" ||
              cell.type === "initial-values"
          )
          .map((cell) => cell.modelId)
      )
    );
    const splitEditors = modelIds
      .map((modelId) => buildEditorStateForNotebookModel(notebookDocument, { modelId }))
      .filter((editor): editor is EditorState => editor != null);
    const editors = [...legacyEditors, ...splitEditors];
    const issueCount = editors.reduce((count, editor) => {
      const issues = validateEditorState(editor);
      const diagnostics = diagnoseBuildRuntime(editor);
      return count + issues.length + diagnostics.issues.length;
    }, 0);

    setUiMessage(
      issueCount === 0
        ? `Validated ${editors.length} model${editors.length === 1 ? "" : "s"} with no issues.`
        : `Validation found ${issueCount} issue${issueCount === 1 ? "" : "s"} across ${editors.length} model${editors.length === 1 ? "" : "s"}.`
    );
  }

  function getCurrentValueMapForModelRef(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined> {
    const modelKey = resolveNotebookModelKey(notebookDocument.cells, ref);
    if (!modelKey) {
      return {};
    }

    const sourceRunCell = notebookDocument.cells.find(
      (cell) =>
        cell.type === "run" &&
        resolveRunCellModelKey(notebookDocument.cells, cell) === modelKey
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
    <main className="app-shell notebook-shell">
      {uiMessage ? (
        <section className="status-panel">
          <div className={uiMessage.toLowerCase().includes("imported") || uiMessage.toLowerCase().includes("exported") || uiMessage.toLowerCase().includes("downloaded") ? "success-text" : "error-text"}>
            {uiMessage}
          </div>
        </section>
      ) : null}

      <div className="notebook-layout">
        <div className="notebook-main-column">
          <section className="control-panel notebook-app-bar">
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
                <button type="button" className="notebook-run-button" onClick={() => void runner.runAll()}>
                  Run all
                </button>
                <button
                  type="button"
                  className="notebook-run-button notebook-action-desktop"
                  onClick={handleValidateNotebook}
                >
                  Validate
                </button>
                <button
                  type="button"
                  className="notebook-run-button notebook-action-desktop"
                  onClick={handleExportJson}
                >
                  Export
                </button>
                <button
                  type="button"
                  className="notebook-run-button notebook-action-desktop"
                  onClick={() => {
                    setIsDataPanelOpen(true);
                  }}
                >
                  Import
                </button>
                <a
                  className="notebook-toolbar-link notebook-run-button notebook-action-desktop"
                  href="#/workspace"
                >
                  Workspace
                </a>
              </div>
            </div>
          </section>

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
                getModelCurrentValues={getCurrentValueMapForModelRef}
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

function resolveNotebookTemplateIdFromHash(hash: string): NotebookTemplateId {
  return parseNotebookTemplateIdFromHash(hash) ?? DEFAULT_NOTEBOOK_TEMPLATE_ID;
}

function parseNotebookTemplateIdFromHash(hash: string): NotebookTemplateId | null {
  const match = hash.match(/^#\/notebook\/([^/?#]+)/);
  const candidate = match?.[1]?.trim();
  return candidate && isNotebookTemplateId(candidate) ? candidate : null;
}

function writeNotebookHash(templateId?: NotebookTemplateId): void {
  const nextHash = templateId ? `#/notebook/${templateId}` : "#/notebook";
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

interface NotebookCellViewProps {
  cell: NotebookCell;
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
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
  const sourceGutterRef = useRef<HTMLPreElement | null>(null);
  const currentSerializedBody = serializeCellBody(cell);
  const hasSourceEdits = titleDraft !== cell.title || sourceDraft !== currentSerializedBody;
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
            ) : null}
          </div>
          {isSourceEditable(cell) ? (
            isEditingSource ? (
              <div className="notebook-run-actions">
                <button
                  type="button"
                  className="notebook-run-button notebook-source-toggle"
                  onClick={handleApplySource}
                  disabled={!hasSourceEdits || sourceValidationError != null}
                >
                  Apply
                </button>
                <button type="button" className="notebook-run-button notebook-source-toggle" onClick={handleCancelSource}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="notebook-run-button notebook-source-toggle"
                onClick={() => setIsEditingSource(true)}
              >
                Edit source
              </button>
            )
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
                ref={sourceGutterRef}
                className="notebook-source-gutter"
                aria-hidden="true"
              >
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

        {cell.type === "markdown" ? <p className="notebook-markdown">{cell.source}</p> : null}
        {cell.type === "equations" ? (
          <EquationsCellView
            cell={cell}
            currentValues={getModelCurrentValues({ modelId: cell.modelId })}
            externals={findExternalsCell(cells, cell.modelId)?.externals ?? []}
            initialValuesCount={findInitialValuesCell(cells, cell.modelId)?.initialValues.length ?? 0}
            solverCell={findSolverCell(cells, cell.modelId)}
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
        {cell.type === "model" ? (
          <ModelCellView
            cell={cell}
            currentValues={getModelCurrentValues({ sourceModelCellId: cell.id })}
            onChange={(editor) => onModelChange(cell.id, editor)}
          />
        ) : null}
        {cell.type === "solver" ? (
          <SolverCellView
            cell={cell}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
            onChange={(options) =>
              onCellChange(cell.id, (current) =>
                current.type === "solver" ? { ...current, options } : current
              )
            }
            onToggleCollapsed={() =>
              onCellChange(cell.id, (current) =>
                current.type === "solver"
                  ? { ...current, collapsed: !current.collapsed }
                  : current
              )
            }
          />
        ) : null}
        {cell.type === "externals" ? (
          <ExternalsCellView
            cell={cell}
            currentValues={getModelCurrentValues({ modelId: cell.modelId })}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
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
        {cell.type === "initial-values" ? (
          <InitialValuesCellView
            cell={cell}
            currentValues={getModelCurrentValues({ modelId: cell.modelId })}
            issueMap={buildIssueMapForStandaloneModelSections(cells, cell.modelId)}
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
        {cell.type === "run" ? (
          <RunCellView cell={cell} cells={cells} variableDescriptions={variableDescriptions} />
        ) : null}
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
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        ) : null}
        {cell.type === "matrix" ? (
          <MatrixCellView
            cell={cell}
            runner={runner}
            selectedPeriodIndex={selectedPeriodIndex}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        ) : null}
        {cell.type === "sequence" ? (
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
  const equationIssueMap = Object.fromEntries(
    allIssues
      .filter((issue) => issue.path.startsWith("equations."))
      .map((issue) => [issue.path, issue])
  );
  const runtime = safeBuildRuntime(cell.editor);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<PinnedTrace | null>(null);
  const parameterNameSet = useMemo(
    () => new Set(cell.editor.externals.map((external) => external.name)),
    [cell.editor.externals]
  );
  const variableDescriptions = useMemo(
    () =>
      buildVariableDescriptions({
        equations: cell.editor.equations,
        externals: cell.editor.externals
      }),
    [cell.editor.equations, cell.editor.externals]
  );
  const variableUnitMetadata = useMemo(
    () =>
      buildVariableUnitMetadata({
        equations: cell.editor.equations,
        externals: cell.editor.externals
      }),
    [cell.editor.equations, cell.editor.externals]
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
                        traceRole ? activeTrace?.tokenStates : undefined,
                        variableDescriptions
                      )
                    : "?"}
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

      <details className="notebook-model-editor">
        <summary>Edit model cell</summary>
        <div className="notebook-model-editor-body">
          <EquationGridEditor
            buildError={buildDiagnostics.modelError}
            currentValues={currentValues}
            equations={cell.editor.equations}
            issues={equationIssueMap}
            onChange={(equations) => onChange({ ...cell.editor, equations })}
            parameterNames={cell.editor.externals.map((external) => external.name)}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </div>
      </details>
    </div>
  );
}

function EquationsCellView({
  cell,
  currentValues,
  externals,
  initialValuesCount,
  solverCell,
  onChange,
  onToggleCollapsed
}: {
  cell: EquationsCell;
  currentValues: Record<string, number | undefined>;
  externals: ExternalsCell["externals"];
  initialValuesCount: number;
  solverCell: SolverCell | null;
  onChange(equations: EquationsCell["equations"]): void;
  onToggleCollapsed(): void;
}) {
  const editor = buildEditorStateFromSections({
    equations: cell.equations,
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
        equations: cell.equations,
        externals
      }),
    [cell.equations, externals]
  );
  const variableUnitMetadata = useMemo(
    () =>
      buildVariableUnitMetadata({
        equations: cell.equations,
        externals
      }),
    [cell.equations, externals]
  );
  const traceModel = useMemo(() => buildTraceModel(cell.equations), [cell.equations]);
  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "inputs")
      : null;

  return (
    <div className="notebook-model-stack">
      <div className="notebook-linked-editor-topline">
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
            Issues <strong>{countModelSectionIssues(allIssues.map((issue) => issue.path), "equations.")}</strong>
          </span>
        </div>
        <button type="button" className="notebook-run-button" onClick={onToggleCollapsed}>
          {cell.collapsed ? "Show contents" : "Hide contents"}
        </button>
      </div>
      {cell.collapsed ? null : (
        <>
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
                      {equation.name
                        ? highlightFormula(
                            equation.name,
                            parameterNameSet,
                            traceRole ? activeTrace?.tokenStates : undefined,
                            variableDescriptions,
                            variableUnitMetadata
                          )
                        : "?"}
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

          <details className="notebook-model-editor">
            <summary>Edit equations cell</summary>
            <div className="notebook-model-editor-body">
              <EquationGridEditor
                buildError={buildDiagnostics.modelError}
                currentValues={currentValues}
                equations={cell.equations}
                issues={equationIssueMap}
                onChange={onChange}
                parameterNames={externals.map((external) => external.name)}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function SolverCellView({
  cell,
  issueMap,
  onChange,
  onToggleCollapsed
}: {
  cell: SolverCell;
  issueMap: Record<string, string | undefined>;
  onChange(options: EditorState["options"]): void;
  onToggleCollapsed(): void;
}) {
  const options = cell.options;
  const hiddenEquationEnabled =
    options.hiddenLeftVariable.trim() !== "" && options.hiddenRightVariable.trim() !== "";
  const issuePaths = Object.keys(issueMap);

  return (
    <div className="notebook-model-stack notebook-linked-editor-cell">
      <div className="notebook-linked-editor-topline">
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
        <button type="button" className="notebook-run-button" onClick={onToggleCollapsed}>
          {cell.collapsed ? "Show contents" : "Hide contents"}
        </button>
      </div>
      {cell.collapsed ? null : (
        <>
          <section className="notebook-model-view" aria-label="Solver view">
            <div className="notebook-model-view-header">
              <h3>Solver view</h3>
              <p className="panel-subtitle">Compact read-only simulation and hidden-equation settings.</p>
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
                { label: "Solver", value: options.solverMethod, status: issueMap["options.solverMethod"] ? "Issue" : "OK" },
                { label: "Periods", value: String(options.periods), status: issueMap["options.periods"] ? "Issue" : "OK" },
                { label: "Tolerance", value: options.toleranceText, status: issueMap["options.toleranceText"] ? "Issue" : "OK" },
                { label: "Max iterations", value: String(options.maxIterations), status: issueMap["options.maxIterations"] ? "Issue" : "OK" },
                { label: "Default initial", value: options.defaultInitialValueText, status: issueMap["options.defaultInitialValueText"] ? "Issue" : "OK" },
                {
                  label: "Hidden equation",
                  value: hiddenEquationEnabled
                    ? `${options.hiddenLeftVariable} = ${options.hiddenRightVariable}`
                    : "disabled",
                  status: issueMap["options.hiddenEquation"] ? "Issue" : "OK"
                },
                { label: "Hidden tolerance", value: options.hiddenToleranceText, status: issueMap["options.hiddenToleranceText"] ? "Issue" : "OK" },
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
          <details className="notebook-model-editor">
            <summary>Edit solver cell</summary>
            <div className="notebook-model-editor-body">
              <SolverPanel options={options} issues={issueMap} onChange={onChange} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function ExternalsCellView({
  cell,
  currentValues,
  issueMap,
  onChange,
  onToggleCollapsed
}: {
  cell: ExternalsCell;
  currentValues: Record<string, number | undefined>;
  issueMap: Record<string, string | undefined>;
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

  return (
    <div className="notebook-model-stack notebook-linked-editor-cell">
      <div className="notebook-linked-editor-topline">
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
        <button type="button" className="notebook-run-button" onClick={onToggleCollapsed}>
          {cell.collapsed ? "Show contents" : "Hide contents"}
        </button>
      </div>
      {cell.collapsed ? null : (
        <>
          <section className="notebook-model-view" aria-label="Externals view">
            <div className="notebook-model-view-header">
              <h3>Externals view</h3>
              <p className="panel-subtitle">Compact read-only external parameter list.</p>
            </div>
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
          <details className="notebook-model-editor">
            <summary>Edit externals cell</summary>
            <div className="notebook-model-editor-body">
              <ExternalEditor
                currentValues={currentValues}
                externals={cell.externals}
                issues={issueMap}
                onChange={onChange}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function InitialValuesCellView({
  cell,
  currentValues,
  issueMap,
  variableDescriptions,
  variableUnitMetadata,
  onChange,
  onToggleCollapsed
}: {
  cell: InitialValuesCell;
  currentValues: Record<string, number | undefined>;
  issueMap: Record<string, string | undefined>;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onChange(initialValues: EditorState["initialValues"]): void;
  onToggleCollapsed(): void;
}) {
  const issuePaths = Object.keys(issueMap);

  return (
    <div className="notebook-model-stack notebook-linked-editor-cell">
      <div className="notebook-linked-editor-topline">
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
              {cell.initialValues.filter((initialValue) => initialValue.valueText.trim() !== "").length}
            </strong>
          </span>
          <span className="notebook-model-chip">
            Issues{" "}
            <strong>
              {countModelSectionIssues(issuePaths, "initialValues.")}
            </strong>
          </span>
        </div>
        <button type="button" className="notebook-run-button" onClick={onToggleCollapsed}>
          {cell.collapsed ? "Show contents" : "Hide contents"}
        </button>
      </div>
      {cell.collapsed ? null : (
        <>
          <section className="notebook-model-view" aria-label="Initial values view">
            <div className="notebook-model-view-header">
              <h3>Initial values view</h3>
              <p className="panel-subtitle">Compact read-only list of initial conditions.</p>
            </div>
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
          <details className="notebook-model-editor">
            <summary>Edit initial values cell</summary>
            <div className="notebook-model-editor-body">
              <InitialValuesEditor
                currentValues={currentValues}
                initialValues={cell.initialValues}
                issues={issueMap}
                onChange={onChange}
                variableUnitMetadata={variableUnitMetadata}
              />
            </div>
          </details>
        </>
      )}
    </div>
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
                    </InstantTooltip>:{" "}
                    {formatShockValue(value)}
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
    (candidate): candidate is RunCell => candidate.type === "run" && candidate.id === cell.sourceRunCellId
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
                Math.max(baselineStartPeriod - 1, 0) + (sourceRunCell.periods ?? series[0]?.values.length ?? 0)
              ) ?? []
            )
          }))
          .filter((entry) => entry.values.length > 0)
      : [];
  const timeRangeDefaults = resolveChartTimeRangeDefaults(sourceRunCell, series[0]?.values.length ?? 0);

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
                          {formatResolvedMatrixValue(entry.source, entry.resolved, variableUnitMetadata)}
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

  const variableName = inferPrimaryVariableName(source);
  const unitMeta = variableName ? variableUnitMetadata.get(variableName) : undefined;
  return `= ${formatValueWithUnits(numericValue, unitMeta, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
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

  return `[${value.values.map((item) => item.toLocaleString(undefined, { maximumFractionDigits: 6 })).join(", ")}]`;
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
  return !["model", "equations", "solver", "externals", "initial-values"].includes(cell.type);
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
      if (
        typeof (parsed as RunCell).sourceModelId !== "string" &&
        typeof (parsed as RunCell).sourceModelCellId !== "string"
      ) {
        throw new Error("Run cells require sourceModelId or sourceModelCellId.");
      }
      if (
        (parsed as RunCell).baselineRunCellId != null &&
        typeof (parsed as RunCell).baselineRunCellId !== "string"
      ) {
        throw new Error("Run cells require baselineRunCellId to be a string when provided.");
      }
      if (
        (parsed as RunCell).baselineStartPeriod != null &&
        typeof (parsed as RunCell).baselineStartPeriod !== "number"
      ) {
        throw new Error("Run cells require baselineStartPeriod to be a number when provided.");
      }
      if (!["baseline", "scenario"].includes(String((parsed as RunCell).mode))) {
        throw new Error("Run cells require mode to be 'baseline' or 'scenario'.");
      }
      if (typeof (parsed as RunCell).resultKey !== "string") {
        throw new Error("Run cells require resultKey.");
      }
      if ((parsed as RunCell).periods != null && typeof (parsed as RunCell).periods !== "number") {
        throw new Error("Run cells require periods to be a number when provided.");
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
      if (
        (parsed as ChartCell).axisSnapTolarance != null &&
        typeof (parsed as ChartCell).axisSnapTolarance !== "number"
      ) {
        throw new Error("Chart axisSnapTolarance must be a number.");
      }
      validateChartAxisRange((parsed as ChartCell).sharedRange, "sharedRange");
      validateChartTimeRangeInclusive((parsed as ChartCell).timeRangeInclusive, "timeRangeInclusive");
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
    case "solver":
      if (typeof (parsed as SolverCell).modelId !== "string") {
        throw new Error("solver cells require modelId.");
      }
      if ((parsed as SolverCell).collapsed != null && typeof (parsed as SolverCell).collapsed !== "boolean") {
        throw new Error("solver cells require collapsed to be a boolean when provided.");
      }
      if (!(parsed as SolverCell).options || typeof (parsed as SolverCell).options !== "object") {
        throw new Error("solver cells require options.");
      }
      return;
    case "externals":
    case "initial-values":
      if (typeof (parsed as ExternalsCell | InitialValuesCell).modelId !== "string") {
        throw new Error(`${cellType} cells require modelId.`);
      }
      if (
        (parsed as ExternalsCell | InitialValuesCell).collapsed != null &&
        typeof (parsed as ExternalsCell | InitialValuesCell).collapsed !== "boolean"
      ) {
        throw new Error(`${cellType} cells require collapsed to be a boolean when provided.`);
      }
      if (cellType === "externals" && !Array.isArray((parsed as ExternalsCell).externals)) {
        throw new Error("externals cells require externals.");
      }
      if (
        cellType === "initial-values" &&
        !Array.isArray((parsed as InitialValuesCell).initialValues)
      ) {
        throw new Error("initial-values cells require initialValues.");
      }
      return;
    case "equations":
      if (typeof (parsed as EquationsCell).modelId !== "string") {
        throw new Error("equations cells require modelId.");
      }
      if (!Array.isArray((parsed as EquationsCell).equations)) {
        throw new Error("equations cells require equations.");
      }
      if (
        (parsed as EquationsCell).collapsed != null &&
        typeof (parsed as EquationsCell).collapsed !== "boolean"
      ) {
        throw new Error("equations cells require collapsed to be a boolean when provided.");
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
        { label: "Shared range", insert: '"sharedRange": {\n  "min": 0,\n  "max": 200\n}' },
        {
          label: "Time range",
          insert: '"timeRangeInclusive": [5, 20]'
        },
        { label: "Series ranges", insert: '"seriesRanges": {\n  "y": {\n    "includeZero": true\n  }\n}' },
        { label: "Axis snap", insert: '"axisSnapTolarance": 0.1' },
        { label: "Include zero", insert: '"sharedRange": {\n  "includeZero": true\n}' },
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
        { label: "Baseline run id", insert: '"baselineRunCellId": "baseline-run"' },
        { label: "Baseline start", insert: '"baselineStartPeriod": 55' },
        { label: "Periods", insert: '"periods": 60' },
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
    case "equations":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Equations array", insert: '"equations": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "solver":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Options object", insert: '"options": {\n  "periods": 100,\n  "solverMethod": "GAUSS_SEIDEL",\n  "toleranceText": "1e-15",\n  "maxIterations": 200,\n  "defaultInitialValueText": "1e-15",\n  "hiddenLeftVariable": "",\n  "hiddenRightVariable": "",\n  "hiddenToleranceText": "0.00001",\n  "relativeHiddenTolerance": false\n}' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "externals":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Externals array", insert: '"externals": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "initial-values":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Initial values array", insert: '"initialValues": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
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
- sourceModelId or sourceModelCellId
- mode: "baseline" | "scenario"
- resultKey

Optional:
- baselineRunCellId
- baselineStartPeriod
- periods

Scenario example:
${formatCellBody(
  {
    id: cell.id,
    type: "run",
    sourceModelId: "main",
    baselineRunCellId: "baseline-run",
    baselineStartPeriod: 55,
    mode: "scenario",
    periods: 60,
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
    case "equations":
      return `Required fields:
- id
- type: "equations"
- modelId
- equations: []

Optional:
- collapsed: boolean

Behavior:
This cell owns the model equation list for one notebook model.`;
    case "chart":
      return `Required fields:
- id
- type: "chart"
- sourceRunCellId
- variables: string[]

Optional:
- axisMode: "shared" | "separate"
- axisSnapTolarance: number
- timeRangeInclusive: [startPeriodInclusive, endPeriodInclusive]
- sharedRange: { "includeZero"?: boolean, "min"?: number, "max"?: number }
- seriesRanges: { [variableName]: range }

Example:
${formatCellBody(
  {
    id: cell.id,
    type: "chart",
    sourceRunCellId: "baseline-run",
    variables: ["ydhs", "c", "p"],
    axisMode: "separate",
    axisSnapTolarance: 0.1,
    timeRangeInclusive: [5, 20],
    sharedRange: {
      includeZero: true
    },
    seriesRanges: {
      p: {
        min: 0,
        max: 2
      }
    }
  } as Omit<NotebookCell, "title">,
  "compact"
)}`;
    case "externals":
      return `Required fields:
- id
- type: "externals"
- modelId
- externals: []

Optional:
- collapsed: boolean

Behavior:
This cell owns the external parameter list for one notebook model. Hide/show only affects visibility in the notebook UI.`;
    case "solver":
      return `Required fields:
- id
- type: "solver"
- modelId
- options

Optional:
- collapsed: boolean

Behavior:
This cell owns the solver/options section for one notebook model. Hide/show only affects visibility in the notebook UI.`;
    case "initial-values":
      return `Required fields:
- id
- type: "initial-values"
- modelId
- initialValues: []

Optional:
- collapsed: boolean

Behavior:
This cell owns the initial-values section for one notebook model. Hide/show only affects visibility in the notebook UI.`;
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

function validateChartTimeRangeInclusive(range: unknown, label: string): void {
  if (range == null) {
    return;
  }
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    range.some((value) => !Number.isInteger(value) || Number(value) < 1)
  ) {
    throw new Error(`${label} must be a [start, end] pair of integers >= 1.`);
  }
  if (range[0] > range[1]) {
    throw new Error(`${label}[0] must be <= ${label}[1].`);
  }
}

function resolveChartTimeRangeDefaults(
  sourceRunCell: RunCell | undefined,
  seriesLength: number
): { endPeriodInclusive: number; startPeriodInclusive: number } {
  return {
    startPeriodInclusive: 1,
    endPeriodInclusive: Math.max(seriesLength, 1)
  };
}
