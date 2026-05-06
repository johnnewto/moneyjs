import { useEffect, useMemo, useRef, useState } from "react";

import {
  analyzeNotebookSource,
  detectNotebookSourceFormat,
  notebookToJson,
  notebookToMarkdown,
  parseNotebookSource,
  type NotebookSourceDiagnostic,
  type NotebookSourceFormat
} from "./document";
import {
  buildEditorStateForNotebookModel,
  resolveNotebookModelKey,
  resolveRunCellModelKey
} from "./modelSections";
import { NotebookCellView } from "./NotebookCellView";
import { SourceCodeEditor } from "./SourceCodeEditor";
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
import { validateNotebookDocument } from "./validation";
import {
  diagnoseBuildRuntime,
  validateEditorState,
  type EditorState
} from "../lib/editorModel";
import { PeriodScrubber } from "../components/PeriodScrubber";
import { AssistantMarkdown } from "../components/AssistantMarkdown";
import { VariableInspector } from "../components/VariableInspector";
import { VariableMathLabel } from "../components/VariableMathLabel";
import { useDragScroll } from "../hooks/useDragScroll";
import { usePanelSplitter } from "../hooks/usePanelSplitter";
import { buildVariableInspectorData } from "../lib/variableInspector";
import { buildVariableDescriptions, type VariableDescriptions } from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";

const APP_BASE_URL = import.meta.env.BASE_URL;
const NOTEBOOK_ASSISTANT_API_URL = resolveNotebookAssistantApiUrl();
const NOTEBOOK_ASSISTANT_DEFAULT_MODEL = "gpt-4.1";
const NOTEBOOK_ASSISTANT_MODEL_STORAGE_KEY = "sfcr:notebook-assistant-model";

type NotebookRailTab = "editor" | "inspect" | "contents" | "assistant" | "preview";

interface NotebookAssistantMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

const NOTEBOOK_ASSISTANT_INITIAL_MESSAGES: NotebookAssistantMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    text: "Ask about the current notebook, selected variable, validation state, or run results. I will explain and suggest changes without applying them."
  }
];

function resolveAppHref(path: string): string {
  return `${APP_BASE_URL}${path.replace(/^\/+/, "")}`;
}

function resolveNotebookAssistantApiUrl(): string {
  const configuredAssistantUrl = (import.meta.env.VITE_NOTEBOOK_ASSISTANT_API_URL ?? "").trim();
  if (configuredAssistantUrl) {
    return configuredAssistantUrl;
  }

  const configuredChatUrl = (import.meta.env.VITE_CHAT_BUILDER_API_URL ?? "").trim();
  if (configuredChatUrl) {
    return configuredChatUrl.replace(/\/v1\/chat-builder\/draft\/?$/, "/v1/notebook-assistant/ask");
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8787/v1/notebook-assistant/ask";
  }

  return "";
}

async function requestNotebookAssistantAnswer(args: {
  betaPassword: string;
  context: string;
  messages: NotebookAssistantMessage[];
  model: string;
  onTextDelta?: (delta: string) => void;
  question: string;
}): Promise<string> {
  if (!NOTEBOOK_ASSISTANT_API_URL) {
    throw new Error("Notebook assistant API endpoint is not configured.");
  }

  const response = await fetch(NOTEBOOK_ASSISTANT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...(args.betaPassword.trim() ? { betaPassword: args.betaPassword.trim() } : {}),
      context: args.context,
      messages: args.messages.map((message) => ({
        role: message.role,
        text: message.text
      })),
      model: args.model,
      question: args.question
    })
  });

  if (!response.ok) {
    let message = "Failed to ask notebook assistant.";

    try {
      const error = (await response.json()) as {
        error?: string | {
          message?: string;
        };
      };
      message =
        typeof error.error === "string"
          ? error.error
          : error.error?.message ?? message;
    } catch {
      // Keep fallback message.
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (response.body && contentType.includes("text/event-stream")) {
    const streamedText = await readNotebookAssistantSseResponse(response, args.onTextDelta);
    if (streamedText.trim()) {
      return streamedText.trim();
    }
  }

  const result = (await response.json()) as {
    output?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
    output_text?: string;
  };
  const text =
    typeof result.output_text === "string" && result.output_text.trim()
      ? result.output_text
      : result.output
          ?.flatMap((entry) => entry.content ?? [])
          .find((entry) => typeof entry.text === "string" && entry.text.trim())?.text;

  if (!text) {
    throw new Error("Assistant response did not include text.");
  }

  args.onTextDelta?.(text);
  return text;
}

async function readNotebookAssistantSseResponse(
  response: Response,
  onTextDelta: ((delta: string) => void) | undefined
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const eventText = parseNotebookAssistantSseChunk(chunk);
      if (eventText) {
        text += eventText;
        onTextDelta?.(eventText);
      }
    }
  }

  buffer += decoder.decode();
  const remainingText = parseNotebookAssistantSseChunk(buffer);
  if (remainingText) {
    text += remainingText;
    onTextDelta?.(remainingText);
  }

  return text;
}

function parseNotebookAssistantSseChunk(chunk: string): string {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  let text = "";
  for (const data of dataLines) {
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const event = JSON.parse(data) as { delta?: unknown; type?: unknown };
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
      }
    } catch {
      // Ignore malformed stream frames.
    }
  }

  return text;
}

function buildNotebookAssistantContext(args: {
  document: NotebookDocument;
  inspectorContext: {
    currentValues: Record<string, number | undefined>;
    selectedVariable: string;
  } | null;
  resultCount: number;
  selectedPeriodIndex: number;
  selectedVariable?: string;
  uiMessage: string | null;
}): string {
  const notebookJson = notebookToJson(args.document);
  return truncateNotebookAssistantContext(
    [
      `Notebook title: ${args.document.title}`,
      `Notebook id: ${args.document.id}`,
      `Cells: ${args.document.cells.length}`,
      `Cell types: ${summarizeCellTypes(args.document.cells)}`,
      `Selected period index: ${args.selectedPeriodIndex}`,
      `Completed run result count: ${args.resultCount}`,
      args.selectedVariable ? `Selected variable: ${args.selectedVariable}` : null,
      args.inspectorContext
        ? `Selected variable current values: ${JSON.stringify(args.inspectorContext.currentValues)}`
        : null,
      args.uiMessage ? `Current UI message: ${args.uiMessage}` : null,
      "Notebook JSON:",
      notebookJson
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")
  );
}

function truncateNotebookAssistantContext(context: string): string {
  const maxLength = 56000;
  if (context.length <= maxLength) {
    return context;
  }

  return `${context.slice(0, maxLength)}\n\n[Context truncated for size.]`;
}

const NOTEBOOK_AI_INDEX_URL = resolveAppHref(".well-known/sfcr.json");
const NOTEBOOK_AI_LANDING_URL = resolveAppHref("ai/index.html");
const NOTEBOOK_AI_GUIDE_URL = resolveAppHref("notebook-guide.md");
const NOTEBOOK_AI_MANIFEST_URL = resolveAppHref(".well-known/sfcr-notebook-guide.json");
const NOTEBOOK_AI_SCHEMA_URL = resolveAppHref("sfcr-notebook.schema.json");
const NOTEBOOK_AI_PROMPT_URL = resolveAppHref("ai-prompts/create-sfcr-notebook.md");

interface NotebookSourceValidation {
  canApply: boolean;
  diagnostics: NotebookSourceDiagnostic[];
  document: NotebookDocument | null;
  issues: string[];
  modelIssueCount: number;
  notebookIssueCount: number;
  parse: ValidationStep;
  schema: ValidationStep;
}

interface ValidationStep {
  message: string;
  status: "valid" | "invalid";
}

export function NotebookApp() {
  const mainColumnRef = useRef<HTMLDivElement | null>(null);
  const [notebookDocument, setNotebookDocument] = useState(() =>
    createNotebookFromTemplate(resolveNotebookTemplateIdFromHash(window.location.hash))
  );
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [sourceFormat, setSourceFormat] = useState<NotebookSourceFormat>("json");
  const [importText, setImportText] = useState(() =>
    serializeNotebookSource(notebookDocument, sourceFormat)
  );
  const [committedImportText, setCommittedImportText] = useState(() =>
    serializeNotebookSource(notebookDocument, sourceFormat)
  );
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [autoRunRevision, setAutoRunRevision] = useState(0);
  const [activeEditorCellId, setActiveEditorCellId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [activeRailTab, setActiveRailTab] = useState<NotebookRailTab>("contents");
  const [assistantMessages, setAssistantMessages] = useState<NotebookAssistantMessage[]>(
    NOTEBOOK_ASSISTANT_INITIAL_MESSAGES
  );
  const [assistantPromptText, setAssistantPromptText] = useState("");
  const [assistantBetaPassword, setAssistantBetaPassword] = useState("");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [isAssistantAsking, setIsAssistantAsking] = useState(false);
  const [selectedImportFileName, setSelectedImportFileName] = useState("No file chosen");
  const [assistantModel, setAssistantModel] = useState(() => {
    if (typeof window === "undefined") {
      return NOTEBOOK_ASSISTANT_DEFAULT_MODEL;
    }

    return (
      window.localStorage.getItem(NOTEBOOK_ASSISTANT_MODEL_STORAGE_KEY) ??
      NOTEBOOK_ASSISTANT_DEFAULT_MODEL
    );
  });
  const [inspectorContext, setInspectorContext] = useState<{
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<{
    document: NotebookDocument;
    source: NotebookSourceFormat;
  } | null>(null);
  const runner = useNotebookRunner(notebookDocument);
  const assistantVariableDescriptions = useMemo(
    () => buildNotebookVariableDescriptions(notebookDocument.cells),
    [notebookDocument.cells]
  );
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
  const hasPendingImportTextChanges = importText !== committedImportText;
  const sourceValidation = useMemo(
    () => buildNotebookSourceValidation(importText, sourceFormat),
    [importText, sourceFormat]
  );

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
      setActiveRailTab("editor");
      setSelectedCellId(activeEditorCellId);
    }
  }, [activeEditorCellId]);

  useEffect(() => {
    if (importText !== committedImportText) {
      return;
    }

    const nextSource = serializeNotebookSource(notebookDocument, sourceFormat);
    setImportText(nextSource);
    setCommittedImportText(nextSource);
    setImportPreview(null);
  }, [notebookDocument, sourceFormat]);

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
    const exported = importText || serializeNotebookSource(notebookDocument, sourceFormat);
    setActiveRailTab("editor");
    navigator.clipboard
      .writeText(exported)
      .then(() =>
        setUiMessage(
          `Copied notebook ${formatNotebookSourceLabel(sourceFormat)} source to the clipboard.`
        )
      )
      .catch(() =>
        setUiMessage(
          `Notebook ${formatNotebookSourceLabel(sourceFormat)} source is shown in the editor.`
        )
      );
  }

  function handleSourceFormatChange(nextFormat: NotebookSourceFormat): void {
    if (nextFormat === sourceFormat) {
      return;
    }

    if (hasPendingImportTextChanges) {
      setUiMessage("Apply or discard the source draft before changing format.");
      return;
    }

    const nextSource = serializeNotebookSource(notebookDocument, nextFormat);
    setSourceFormat(nextFormat);
    setImportText(nextSource);
    setCommittedImportText(nextSource);
    setImportPreview(null);
    setUiMessage(null);
  }

  function handleImportJson(): void {
    try {
      const parsed = parseNotebookSource(importText);
      setImportPreview({ document: parsed.document, source: parsed.format });
      setUiMessage(
        `Previewed notebook ${formatNotebookSourceLabel(parsed.format)}. Apply to replace the current notebook.`
      );
    } catch (error) {
      setImportPreview(null);
      setUiMessage(
        error instanceof Error
          ? error.message
          : `Invalid notebook ${formatNotebookSourceLabel(sourceFormat)}`
      );
    }
  }

  function handleApplyImportText(): void {
    if (!sourceValidation.canApply) {
      setUiMessage("Fix source validation issues before applying the draft.");
      return;
    }

    try {
      const parsed = parseNotebookSource(importText);
      replaceNotebookDocument(parsed.document);
      writeNotebookHash();
      setCommittedImportText(importText);
      setImportPreview(null);
      setUiMessage(`Imported notebook ${formatNotebookSourceLabel(parsed.format)}.`);
    } catch (error) {
      setImportPreview(null);
      setUiMessage(
        error instanceof Error
          ? error.message
          : `Invalid notebook ${formatNotebookSourceLabel(sourceFormat)}`
      );
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const inferredFormat = inferFormatFromFileName(file.name) ?? detectNotebookSourceFormat(text);
      const parsed = parseNotebookSource(text, inferredFormat);
      setSelectedImportFileName(file.name);
      setImportText(text);
      setCommittedImportText(text);
      setImportPreview({ document: parsed.document, source: parsed.format });
      setSourceFormat(parsed.format);
      if (!isNotebookTemplateId(parsed.document.metadata.template ?? "")) {
        writeNotebookHash();
      }
      setActiveRailTab("editor");
      setUiMessage(
        `Previewed ${file.name} as ${formatNotebookSourceLabel(parsed.format)}. Apply to replace the current notebook.`
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
    setUiMessage(`Imported notebook ${formatNotebookSourceLabel(importPreview.source)}.`);
    setImportPreview(null);
  }

  function handleDiscardPreview(): void {
    setImportPreview(null);
    setUiMessage("Cleared import preview.");
  }

  function handleDiscardImportTextChanges(): void {
    const currentSource = serializeNotebookSource(notebookDocument, sourceFormat);
    setImportText(currentSource);
    setCommittedImportText(currentSource);
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
    const exported = serializeNotebookSource(notebookDocument, sourceFormat);
    const blob = new Blob([exported], {
      type: getNotebookSourceMimeType(sourceFormat)
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${notebookDocument.id}.${getNotebookSourceFileSuffix(sourceFormat)}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setUiMessage(`Downloaded notebook ${formatNotebookSourceLabel(sourceFormat)}.`);
  }

  function handleValidateNotebook(): void {
    const notebookIssues = validateNotebookDocument(notebookDocument);
    const modelValidation = validateNotebookModels(notebookDocument);
    const issueCount = notebookIssues.length + modelValidation.issueCount;

    setUiMessage(
      issueCount === 0
        ? `Validated notebook and ${modelValidation.modelCount} model${modelValidation.modelCount === 1 ? "" : "s"} with no issues.`
        : `Validation found ${issueCount} issue${issueCount === 1 ? "" : "s"} across the notebook and ${modelValidation.modelCount} model${modelValidation.modelCount === 1 ? "" : "s"}.`
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

  function handleAssistantModelChange(nextModel: string): void {
    setAssistantModel(nextModel);
    window.localStorage.setItem(NOTEBOOK_ASSISTANT_MODEL_STORAGE_KEY, nextModel);
  }

  async function handleAskNotebookAssistant(): Promise<void> {
    const question = assistantPromptText.trim();
    if (!question || isAssistantAsking || !NOTEBOOK_ASSISTANT_API_URL) {
      return;
    }

    const userMessage: NotebookAssistantMessage = {
      id: `user-${assistantMessages.length + 1}`,
      role: "user",
      text: question
    };
    const nextMessages = [...assistantMessages, userMessage];
    const assistantMessageId = `assistant-${nextMessages.length + 1}`;

    setAssistantMessages(nextMessages);
    setAssistantPromptText("");
    setAssistantError(null);
    setIsAssistantAsking(true);

    try {
      let streamedText = "";
      await requestNotebookAssistantAnswer({
        betaPassword: assistantBetaPassword,
        context: buildNotebookAssistantContext({
          document: notebookDocument,
          inspectorContext,
          resultCount: Object.values(runner.outputs).filter((output) => output?.type === "result").length,
          selectedPeriodIndex,
          selectedVariable: inspectorContext?.selectedVariable,
          uiMessage
        }),
        messages: assistantMessages.slice(-8),
        model: assistantModel,
        onTextDelta: (delta) => {
          streamedText += delta;
          setAssistantMessages((current) => {
            const existingMessage = current.find((message) => message.id === assistantMessageId);
            if (existingMessage) {
              return current.map((message) =>
                message.id === assistantMessageId ? { ...message, text: streamedText } : message
              );
            }

            return [
              ...current,
              {
                id: assistantMessageId,
                role: "assistant",
                text: streamedText || "Thinking..."
              }
            ];
          });
        },
        question
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to ask notebook assistant.";
      setAssistantError(message);
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${current.length + 1}`,
          role: "assistant",
          text: `Assistant request failed: ${message}`
        }
      ]);
    } finally {
      setIsAssistantAsking(false);
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
                    setActiveRailTab("editor");
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
                <a
                  className="notebook-toolbar-link notebook-run-button notebook-action-desktop"
                  href="#/chat-builder"
                >
                  Chat builder
                </a>
              </div>
            </div>
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
                onSelectedCellIdChange={setSelectedCellId}
                onSelectedPeriodIndexChange={setSelectedPeriodIndex}
                runner={runner}
                onActiveEditorCellIdChange={setActiveEditorCellId}
                onModelChange={updateModelCell}
                onCellChange={updateCell}
                onVariableInspectRequest={handleVariableInspectRequest}
                selectedCellId={selectedCellId}
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
          <div className="notebook-rail-sticky-panel">
            <div className="panel-header">
              <div className="notebook-rail-header">
                <label className="notebook-rail-template-picker">
                  <span className="notebook-rail-template-label">Notebook template</span>
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
                aria-selected={activeRailTab === "contents"}
                className={`notebook-rail-tab${activeRailTab === "contents" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("contents")}
              >
                Contents
              </button>
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
                aria-selected={activeRailTab === "assistant"}
                className={`notebook-rail-tab${activeRailTab === "assistant" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("assistant")}
              >
                Assistant
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeRailTab === "editor"}
                className={`notebook-rail-tab${activeRailTab === "editor" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("editor")}
              >
                Editor
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
          </div>

          {activeRailTab === "editor" ? (
            <section className="notebook-sidebar-panel notebook-source-panel" role="tabpanel">
              <div className="notebook-utility-actions notebook-editor-actions">
                <button
                  type="button"
                  className="notebook-utility-button notebook-source-format-toggle"
                  aria-label={`Source format is ${formatNotebookSourceLabel(sourceFormat)}. Switch to ${formatNotebookSourceLabel(sourceFormat === "json" ? "markdown" : "json")}.`}
                  title={`Source format: ${formatNotebookSourceLabel(sourceFormat)}. Click to switch to ${formatNotebookSourceLabel(sourceFormat === "json" ? "markdown" : "json")}.`}
                  onClick={() =>
                    handleSourceFormatChange(sourceFormat === "json" ? "markdown" : "json")
                  }
                >
                  JSON / Markdown
                </button>
                <label className="notebook-file-picker">
                  <span className="notebook-utility-button notebook-utility-button-muted notebook-file-input-trigger">
                    Choose file
                  </span>
                  <span className="notebook-file-name">{selectedImportFileName}</span>
                  <input
                    className="notebook-file-input"
                    type="file"
                    aria-label="Choose notebook source file"
                    accept=".sfnb.json,.json,.sfnb.md,.md,.markdown,.txt,application/json,text/markdown"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setSelectedImportFileName(file.name);
                        void handleImportFile(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button type="button" className="notebook-utility-button" onClick={handleImportJson}>
                  Preview import
                </button>
                <button type="button" className="notebook-utility-button" onClick={handleDownloadJson}>
                  Download {formatNotebookSourceLabel(sourceFormat)}
                </button>
              </div>

              <SourceCodeEditor
                diagnostics={{
                  issues: sourceValidation.diagnostics,
                  parseValid: sourceValidation.parse.status === "valid",
                  schemaValid: sourceValidation.schema.status === "valid"
                }}
                document={notebookDocument}
                format={sourceFormat}
                onChange={updateImportText}
                placeholderText={getNotebookSourcePlaceholder(sourceFormat)}
                selectedCellId={selectedCellId}
                value={importText}
              />

              <SourceValidationPanel validation={sourceValidation} />

              {hasPendingImportTextChanges ? (
                <div className="notebook-import-draft-actions">
                  <div className="status-hint">Unapplied import text changes.</div>
                  <div className="button-row">
                    <button type="button" onClick={handleApplyImportText} disabled={!sourceValidation.canApply}>
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
          ) : null}

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
                    className={`${selectedCellId === cell.id ? "notebook-outline-item-is-selected" : ""}${
                      activeEditorCellId === cell.id ? " notebook-outline-item-is-active" : ""
                    }`.trim()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCellId(cell.id);
                        scrollToCell(cell.id);
                      }}
                    >
                      <span className="outline-index">{index + 1}</span>
                      <VariableMathLabel name={cell.title} />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {activeRailTab === "assistant" ? (
            <section className="notebook-sidebar-panel notebook-assistant-panel" role="tabpanel">
              <div className="panel-header">
                <div>
                  <h2>Assistant</h2>
                  <p className="panel-subtitle">
                    Read-only help for the current notebook context.
                  </p>
                </div>
              </div>

              <label className="field" htmlFor="notebook-assistant-model">
                <span>Model</span>
                <select
                  id="notebook-assistant-model"
                  value={assistantModel}
                  onChange={(event) => handleAssistantModelChange(event.target.value)}
                >
                  <option value="gpt-5.5">GPT-5.5</option>
                  <option value="gpt-4.1">GPT-4.1</option>
                  <option value="o3">o3</option>
                </select>
              </label>

              <label className="field" htmlFor="notebook-assistant-beta-password">
                <span>Beta password</span>
                <input
                  id="notebook-assistant-beta-password"
                  type="password"
                  value={assistantBetaPassword}
                  onChange={(event) => setAssistantBetaPassword(event.target.value)}
                  placeholder="Required only when the API gate is enabled"
                />
              </label>

              <div className="status-hint">
                {NOTEBOOK_ASSISTANT_API_URL
                  ? `Endpoint: ${NOTEBOOK_ASSISTANT_API_URL}`
                  : "Set VITE_NOTEBOOK_ASSISTANT_API_URL or VITE_CHAT_BUILDER_API_URL to enable the assistant."}
              </div>
              {assistantError ? <div className="field-error">{assistantError}</div> : null}

              <div className="chat-thread notebook-assistant-thread" role="log" aria-label="Notebook assistant conversation">
                {assistantMessages.map((message) => (
                  <article
                    key={message.id}
                    className={`chat-message ${
                      message.role === "assistant" ? "chat-message-assistant" : "chat-message-user"
                    }`}
                  >
                    <div className="chat-message-role">
                      {message.role === "assistant" ? "Assistant" : "You"}
                    </div>
                    {message.role === "assistant" ? (
                      <AssistantMarkdown
                        text={message.text}
                        variableDescriptions={assistantVariableDescriptions}
                      />
                    ) : (
                      <p>{message.text}</p>
                    )}
                  </article>
                ))}
              </div>

              <form
                className="chat-composer"
                aria-label="Notebook assistant composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAskNotebookAssistant();
                }}
              >
                <label className="field" htmlFor="notebook-assistant-question">
                  <span>Question</span>
                  <textarea
                    id="notebook-assistant-question"
                    rows={5}
                    value={assistantPromptText}
                    onChange={(event) => setAssistantPromptText(event.target.value)}
                    placeholder="Ask about this notebook, a variable, a matrix, an error, or a result."
                  />
                </label>
                <div className="button-row">
                  <button
                    type="submit"
                    disabled={!assistantPromptText.trim() || isAssistantAsking || !NOTEBOOK_ASSISTANT_API_URL}
                  >
                    {isAssistantAsking ? "Asking..." : "Ask"}
                  </button>
                </div>
              </form>
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

function SourceValidationPanel({ validation }: { validation: NotebookSourceValidation }) {
  const notebookChecksValid = validation.notebookIssueCount + validation.modelIssueCount === 0;

  return (
    <section className="notebook-source-validation-panel" aria-label="Notebook source validation">
      <div className="notebook-source-validation-grid">
        <ValidationStepBadge label="Parse" step={validation.parse} />
        <ValidationStepBadge label="Schema" step={validation.schema} />
        <div className={`notebook-source-validation-step${notebookChecksValid ? " is-valid" : " is-invalid"}`}>
          <span>Notebook checks</span>
          <strong>
            {notebookChecksValid
              ? "valid"
              : `${validation.notebookIssueCount + validation.modelIssueCount} issue${validation.notebookIssueCount + validation.modelIssueCount === 1 ? "" : "s"}`}
          </strong>
        </div>
      </div>

      {validation.issues.length > 0 ? (
        <ul className="notebook-source-validation-list">
          {validation.issues.slice(0, 5).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <div className="status-hint">Source is ready to apply.</div>
      )}
    </section>
  );
}

function ValidationStepBadge({ label, step }: { label: string; step: ValidationStep }) {
  return (
    <div className={`notebook-source-validation-step is-${step.status}`}>
      <span>{label}</span>
      <strong>{step.message}</strong>
    </div>
  );
}

function inferFormatFromFileName(fileName: string): NotebookSourceFormat | null {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".json")) {
    return "json";
  }
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return "markdown";
  }
  return null;
}

function serializeNotebookSource(
  document: NotebookDocument,
  format: NotebookSourceFormat
): string {
  if (format === "json") {
    return notebookToJson(document);
  }
  return notebookToMarkdown(document);
}

function formatNotebookSourceLabel(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "JSON";
  }
  return "Markdown";
}

function getNotebookSourceMimeType(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "application/json";
  }
  return "text/markdown";
}

function getNotebookSourceFileSuffix(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "sfnb.json";
  }
  return "sfnb.md";
}

function getNotebookSourcePlaceholder(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "Paste a notebook JSON document";
  }
  return "Paste notebook Markdown with headings and fenced sfcr-* blocks";
}

function buildNotebookSourceValidation(
  source: string,
  format: NotebookSourceFormat
): NotebookSourceValidation {
  if (!source.trim()) {
    return {
      canApply: false,
      diagnostics: [
        {
          message: "Source is empty.",
          phase: "parse"
        }
      ],
      document: null,
      issues: ["Source is empty."],
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "invalid", message: "empty" },
      schema: { status: "invalid", message: "not checked" }
    };
  }

  const analysis = analyzeNotebookSource(source, format);
  if (analysis.parseDiagnostics.length > 0) {
    return {
      canApply: false,
      diagnostics: analysis.parseDiagnostics,
      document: null,
      issues: analysis.parseDiagnostics.map((issue) => issue.message),
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "invalid", message: "invalid" },
      schema: { status: "invalid", message: "not checked" }
    };
  }

  if (analysis.schemaDiagnostics.length > 0) {
    return {
      canApply: false,
      diagnostics: analysis.schemaDiagnostics,
      document: null,
      issues: analysis.schemaDiagnostics.map((issue) => issue.message),
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "valid", message: "valid" },
      schema: { status: "invalid", message: "invalid" }
    };
  }

  if (!analysis.document) {
    return {
      canApply: false,
      diagnostics: [
        {
          message: "Unable to parse source.",
          phase: "parse"
        }
      ],
      document: null,
      issues: ["Unable to parse source."],
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "invalid", message: "invalid" },
      schema: { status: "invalid", message: "not checked" }
    };
  }

  const notebookIssues = validateNotebookDocument(analysis.document);
  const modelValidation = validateNotebookModels(analysis.document);
  const diagnostics: NotebookSourceDiagnostic[] = [
    ...notebookIssues.map((issue) => ({ message: issue.message, path: issue.path, phase: "schema" as const })),
    ...modelValidation.issues
  ];
  const issues = diagnostics.map((issue) => issue.message);

  return {
    canApply: issues.length === 0,
    diagnostics,
    document: analysis.document,
    issues,
    modelIssueCount: modelValidation.issueCount,
    notebookIssueCount: notebookIssues.length,
    parse: { status: "valid", message: "valid" },
    schema: { status: "valid", message: "valid" }
  };
}

function validateNotebookModels(document: NotebookDocument): {
  issueCount: number;
  issues: NotebookSourceDiagnostic[];
  modelCount: number;
} {
  const legacyEditors = document.cells
    .filter((cell): cell is ModelCell => cell.type === "model")
    .map((cell) => ({ editor: cell.editor, label: `Model cell \"${cell.title}\"` }));
  const modelIds = Array.from(
    new Set(
      document.cells
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
    .map((modelId) => {
      const editor = buildEditorStateForNotebookModel(document, { modelId });
      if (!editor) {
        return null;
      }

      return { editor, label: `Model \"${modelId}\"` };
    })
    .filter((entry): entry is { editor: EditorState; label: string } => entry != null);
  const editors = [...legacyEditors, ...splitEditors];
  const issues = editors.flatMap(({ editor, label }) => {
    const editorIssues = validateEditorState(editor).map((issue) => ({
      message: formatModelValidationIssue(label, issue.path, issue.message),
      path: issue.path,
      phase: "schema" as const
    }));
    const runtimeIssues = diagnoseBuildRuntime(editor).issues.map((issue) => ({
      message: formatModelValidationIssue(label, issue.path, issue.message),
      path: issue.path,
      phase: "schema" as const
    }));

    return [...editorIssues, ...runtimeIssues];
  });

  return { issueCount: issues.length, issues, modelCount: editors.length };
}

function formatModelValidationIssue(modelLabel: string, path: string, message: string): string {
  return `${modelLabel} ${path}: ${message}`;
}

function buildNotebookVariableDescriptions(cells: NotebookCell[]): VariableDescriptions {
  const descriptions: VariableDescriptions = new Map();

  for (const cell of cells) {
    const nextDescriptions =
      cell.type === "model"
        ? buildVariableDescriptions({
            equations: cell.editor.equations,
            externals: cell.editor.externals
          })
        : cell.type === "equations"
          ? buildVariableDescriptions({ equations: cell.equations })
          : cell.type === "externals"
            ? buildVariableDescriptions({ externals: cell.externals })
            : null;

    for (const [name, description] of nextDescriptions ?? []) {
      if (!descriptions.has(name)) {
        descriptions.set(name, description);
      }
    }
  }

  return descriptions;
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
