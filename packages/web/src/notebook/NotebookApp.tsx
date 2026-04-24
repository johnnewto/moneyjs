import { useEffect, useRef, useState } from "react";

import { detectNotebookSourceFormat, notebookToJson, notebookToMarkdown, parseNotebookSource } from "./document";
import {
  buildEditorStateForNotebookModel,
  resolveNotebookModelKey,
  resolveRunCellModelKey
} from "./modelSections";
import { NotebookCellView } from "./NotebookCellView";
import {
  createNotebookFromTemplate,
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  type NotebookTemplateId,
  isNotebookTemplateId,
  NOTEBOOK_TEMPLATES
} from "./templates";
import type {
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  ModelCell,
  NotebookCell,
  NotebookDocument,
  SolverCell
} from "./types";
import { useNotebookRunner } from "./useNotebookRunner";
import {
  diagnoseBuildRuntime,
  validateEditorState,
  type EditorState
} from "../lib/editorModel";
import { PeriodScrubber } from "../components/PeriodScrubber";
import { VariableInspector } from "../components/VariableInspector";
import { useDragScroll } from "../hooks/useDragScroll";
import { usePanelSplitter } from "../hooks/usePanelSplitter";
import { buildVariableInspectorData } from "../lib/variableInspector";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";

const APP_BASE_URL = import.meta.env.BASE_URL;

function resolveAppHref(path: string): string {
  return `${APP_BASE_URL}${path.replace(/^\/+/, "")}`;
}

const NOTEBOOK_AI_INDEX_URL = resolveAppHref(".well-known/sfcr.json");
const NOTEBOOK_AI_LANDING_URL = resolveAppHref("ai/index.html");
const NOTEBOOK_AI_GUIDE_URL = resolveAppHref("notebook-guide.md");
const NOTEBOOK_AI_MANIFEST_URL = resolveAppHref(".well-known/sfcr-notebook-guide.json");
const NOTEBOOK_AI_SCHEMA_URL = resolveAppHref("sfcr-notebook.schema.json");
const NOTEBOOK_AI_PROMPT_URL = resolveAppHref("ai-prompts/create-sfcr-notebook.md");

export function NotebookApp() {
  const mainColumnRef = useRef<HTMLDivElement | null>(null);
  const [notebookDocument, setNotebookDocument] = useState(() =>
    createNotebookFromTemplate(resolveNotebookTemplateIdFromHash(window.location.hash))
  );
  const [importText, setImportText] = useState("");
  const [committedImportText, setCommittedImportText] = useState("");
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [sourceFormat, setSourceFormat] = useState<"json" | "markdown">("json");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [autoRunRevision, setAutoRunRevision] = useState(0);
  const [isDataPanelOpen, setIsDataPanelOpen] = useState(false);
  const [activeEditorCellId, setActiveEditorCellId] = useState<string | null>(null);
  const [activeRailTab, setActiveRailTab] = useState<"inspect" | "contents" | "preview">(
    "inspect"
  );
  const [inspectorContext, setInspectorContext] = useState<{
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  } | null>(null);
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
  const selectedVariableData = inspectorContext
    ? buildVariableInspectorData({
        currentValues: inspectorContext.currentValues,
        editor: inspectorContext.editor,
        notebookCells: notebookDocument.cells,
        selectedVariable: inspectorContext.selectedVariable,
        variableDescriptions: inspectorContext.variableDescriptions,
        variableUnitMetadata: inspectorContext.variableUnitMetadata
      })
    : null;
  const notebookMainDragScroll = useDragScroll<HTMLDivElement>();
  const notebookRailDragScroll = useDragScroll<HTMLElement>();
  const notebookPanelSplitter = usePanelSplitter({
    defaultLeftWidthPercent: 62,
    minLeftWidthPx: 640,
    minRightWidthPx: 320,
    storageKey: "sfcr:notebook-panel-split"
  });

  useEffect(() => {
    setSelectedPeriodIndex((current) => Math.min(current, maxResultPeriodIndex));
  }, [maxResultPeriodIndex]);

  useEffect(() => {
    void runner.runAll();
  }, [autoRunRevision]);

  useEffect(() => {
    if (!uiMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setUiMessage((current) => (current === uiMessage ? null : current));
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [uiMessage]);

  useEffect(() => {
    if (activeEditorCellId) {
      setActiveRailTab("contents");
    }
  }, [activeEditorCellId]);

  useEffect(() => {
    if (!importPreview && activeRailTab === "preview") {
      setActiveRailTab("inspect");
      return;
    }
    if (importPreview) {
      setActiveRailTab("preview");
    }
  }, [activeRailTab, importPreview]);

  function updateCell(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void {
    setNotebookDocument((current) => ({
      ...current,
      cells: current.cells.map((cell) => (cell.id === cellId ? updater(cell) : cell))
    }));
  }

  function handleVariableInspectRequest(args: {
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  }): void {
    setInspectorContext(args);
    setActiveRailTab("inspect");
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
    setAutoRunRevision((current) => current + 1);
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
      setUiMessage(`Imported notebook ${parsed.format === "json" ? "JSON" : "Markdown"}.`);
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
    setUiMessage(`Imported notebook ${importPreview.source === "json" ? "JSON" : "Markdown"}.`);
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
            (
              cell
            ): cell is EquationsCell | SolverCell | ExternalsCell | InitialValuesCell =>
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

  async function handleRunAll(): Promise<void> {
    const startTime = performance.now();

    try {
      await runner.runAll();
      const durationMs = performance.now() - startTime;
      setUiMessage(`Ran all notebook cells in ${formatElapsedTime(durationMs)}.`);
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unable to run notebook cells");
    }
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
    const cell = document.getElementById(cellId);
    if (!cell) {
      return;
    }

    const mainColumn = mainColumnRef.current;
    const scrubber = document.querySelector(".notebook-scrubber-slot");
    const scrubberHeight =
      scrubber instanceof HTMLElement ? scrubber.getBoundingClientRect().height : 0;
    const extraOffset = 0;

    if (mainColumn) {
      const mainColumnRect = mainColumn.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const targetTop =
        mainColumn.scrollTop + cellRect.top - mainColumnRect.top - scrubberHeight - extraOffset;

      mainColumn.scrollTo({
        behavior: "smooth",
        top: Math.max(targetTop, 0)
      });
      return;
    }

    const targetTop =
      window.scrollY + cell.getBoundingClientRect().top - scrubberHeight - extraOffset;

    window.scrollTo({
      behavior: "smooth",
      top: Math.max(targetTop, 0)
    });
  }

  const hasPendingImportTextChanges = importText !== committedImportText;
  const currentTemplateId = isNotebookTemplateId(notebookDocument.metadata.template ?? "")
    ? notebookDocument.metadata.template
    : "";

  return (
    <main className="app-shell notebook-shell">
      {uiMessage ? (
        <section className="toast-stack" aria-live="polite" aria-atomic="true">
          <div
            className={`toast-notification ${
              uiMessage.toLowerCase().includes("imported") ||
              uiMessage.toLowerCase().includes("exported") ||
              uiMessage.toLowerCase().includes("downloaded") ||
              uiMessage.toLowerCase().includes("loaded") ||
              uiMessage.toLowerCase().includes("ran all")
                ? "is-success"
                : "is-error"
            }`}
            role="status"
          >
            <div className="toast-notification-message">{uiMessage}</div>
            <button
              type="button"
              className="toast-notification-close"
              onClick={() => setUiMessage(null)}
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        </section>
      ) : null}

      <div ref={notebookPanelSplitter.layoutRef} className="notebook-layout">
        <div
          ref={(node) => {
            mainColumnRef.current = node;
            notebookMainDragScroll.dragScrollRef.current = node;
          }}
          className={`notebook-main-column ${notebookMainDragScroll.dragScrollProps.className}`}
          onClickCapture={notebookMainDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={notebookMainDragScroll.dragScrollProps.onMouseDown}
        >
          {maxResultPeriodIndex > 0 ? (
            <div className="notebook-scrubber-slot">
              <PeriodScrubber
                maxIndex={maxResultPeriodIndex}
                onChange={setSelectedPeriodIndex}
                selectedIndex={selectedPeriodIndex}
              />
            </div>
          ) : null}

          <section className="control-panel notebook-app-bar">
            <div className="notebook-app-bar-main">
              <div className="notebook-app-bar-brand">
                <span className="eyebrow">Notebook commands</span>
                <strong>{notebookDocument.title}</strong>
              </div>

              <div className="notebook-app-bar-actions">
                <button type="button" className="notebook-run-button" onClick={() => void handleRunAll()}>
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
                <button
                  type="button"
                  className="notebook-run-button"
                  aria-pressed={activeRailTab === "contents"}
                  onClick={() => setActiveRailTab("contents")}
                >
                  Contents
                </button>
                <a
                  className="notebook-toolbar-link notebook-run-button notebook-action-desktop"
                  href={NOTEBOOK_AI_LANDING_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  AI resources
                </a>
                <a
                  className="notebook-toolbar-link notebook-run-button notebook-action-desktop"
                  href={NOTEBOOK_AI_GUIDE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  AI guide
                </a>
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
            className={`control-panel notebook-data-panel${isDataPanelOpen ? "" : " is-collapsed"}`}
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

            <div className="status-hint">
              Browser-based AI should start with <a href={NOTEBOOK_AI_INDEX_URL}>{NOTEBOOK_AI_INDEX_URL}</a>.
              {" "}For manual browsing, see <a href={NOTEBOOK_AI_LANDING_URL}>{NOTEBOOK_AI_LANDING_URL}</a>. That index links the authoring guide at <a href={NOTEBOOK_AI_GUIDE_URL}>{NOTEBOOK_AI_GUIDE_URL}</a>, the notebook manifest at <a href={NOTEBOOK_AI_MANIFEST_URL}>{NOTEBOOK_AI_MANIFEST_URL}</a>, the schema at <a href={NOTEBOOK_AI_SCHEMA_URL}>{NOTEBOOK_AI_SCHEMA_URL}</a>, and the prompt at <a href={NOTEBOOK_AI_PROMPT_URL}>{NOTEBOOK_AI_PROMPT_URL}</a>.
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

          <section
            className={`notebook-canvas${
              activeEditorCellId ? " notebook-has-active-editor" : ""
            }`}
            aria-label="Notebook sheet"
          >
            {notebookDocument.cells.map((cell) => (
              <NotebookCellView
                key={cell.id}
                activeEditorCellId={activeEditorCellId}
                cell={cell}
                cells={notebookDocument.cells}
                getModelCurrentValues={getCurrentValueMapForModelRef}
                maxPeriodIndex={maxResultPeriodIndex}
                onSelectedPeriodIndexChange={setSelectedPeriodIndex}
                runner={runner}
                onActiveEditorCellIdChange={setActiveEditorCellId}
                onModelChange={updateModelCell}
                onCellChange={updateCell}
                onVariableInspectRequest={handleVariableInspectRequest}
                selectedPeriodIndex={selectedPeriodIndex}
              />
            ))}
          </section>
        </div>

        <div {...notebookPanelSplitter.splitterProps} />

        <aside
          ref={notebookRailDragScroll.dragScrollRef}
          className={`notebook-outline notebook-rail editor-panel${
            activeEditorCellId ? " notebook-outline-has-active-editor" : ""
          } ${notebookRailDragScroll.dragScrollProps.className}`}
          onClickCapture={notebookRailDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={notebookRailDragScroll.dragScrollProps.onMouseDown}
        >
          <div className="panel-header">
            <div className="notebook-rail-header">
              <label className="notebook-rail-template-picker">
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
            </div>
          </div>

          <div className="notebook-rail-tabs" role="tablist" aria-label="Notebook sidebar panels">
            <button
              type="button"
              role="tab"
              aria-selected={activeRailTab === "inspect"}
              className={`notebook-rail-tab${activeRailTab === "inspect" ? " is-active" : ""}`}
              onClick={() => setActiveRailTab("inspect")}
            >
              Inspect
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeRailTab === "contents"}
              className={`notebook-rail-tab${activeRailTab === "contents" ? " is-active" : ""}`}
              onClick={() => setActiveRailTab("contents")}
            >
              Contents
            </button>
            {importPreview ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeRailTab === "preview"}
                className={`notebook-rail-tab${activeRailTab === "preview" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("preview")}
              >
                Preview
              </button>
            ) : null}
          </div>

          {activeRailTab === "inspect" ? (
            <VariableInspector
              currentValues={inspectorContext?.currentValues}
              data={selectedVariableData}
              onSelectVariable={(variableName) => {
                setActiveRailTab("inspect");
                setInspectorContext((current) =>
                  current ? { ...current, selectedVariable: variableName } : current
                );
              }}
              variableDescriptions={inspectorContext?.variableDescriptions}
              variableUnitMetadata={inspectorContext?.variableUnitMetadata}
            />
          ) : null}

          {activeRailTab === "contents" ? (
            <section className="notebook-sidebar-panel" id="notebook-outline-panel" role="tabpanel">
              <ol className="notebook-outline-list">
                {notebookDocument.cells.map((cell, index) => (
                  <li
                    key={cell.id}
                    className={activeEditorCellId === cell.id ? "notebook-outline-item-is-active" : ""}
                  >
                    <button type="button" onClick={() => scrollToCell(cell.id)}>
                      <span className="outline-index">{index + 1}</span>
                      <span>{cell.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {importPreview && activeRailTab === "preview" ? (
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
                <li>Types: {summarizeCellTypes(importPreview.document.cells)}</li>
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

function formatElapsedTime(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)} s`;
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

function summarizeCellTypes(cells: NotebookCell[]): string {
  const counts = cells.reduce<Record<string, number>>((accumulator, cell) => {
    accumulator[cell.type] = (accumulator[cell.type] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([type, count]) => `${type} (${count})`)
    .join(", ");
}
