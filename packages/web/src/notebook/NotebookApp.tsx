import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  detectNotebookSourceFormat,
  parseNotebookSource,
  type NotebookSourceFormat
} from "./document";
import {
  buildEditorStateForNotebookModel,
  resolveNotebookModelKey,
  resolveRunCellModelKey
} from "./modelSections";
import {
  dispatchNotebookAssistantTool,
  dispatchNotebookAssistantToolRequests,
  type NotebookAssistantSnapshot,
  type NotebookAssistantToolRequest,
  type NotebookAssistantToolResult
} from "./notebookAssistantTools";
import {
  buildNotebookAssistantContext,
  buildNotebookAssistantLocalToolResultAnswer,
  buildNotebookAssistantToolResultContext,
  createAssistantPatchIssue,
  NOTEBOOK_ASSISTANT_API_URL,
  NOTEBOOK_ASSISTANT_DEFAULT_MODEL,
  NOTEBOOK_ASSISTANT_INITIAL_MESSAGES,
  NOTEBOOK_ASSISTANT_MAX_TOOL_REQUESTS_PER_ROUND,
  NOTEBOOK_ASSISTANT_MODE_STORAGE_KEY,
  NOTEBOOK_ASSISTANT_MODEL_STORAGE_KEY,
  requestNotebookAssistantAnswer,
  rearmNotebookAssistantMessagePatchAfterUndo,
  setNotebookAssistantMessagePatch,
  setNotebookAssistantMessageText,
  type NotebookAssistantInlinePatch,
  type NotebookAssistantMessage
} from "./notebookAssistantRuntime";
import {
  buildNotebookAssistantToolFollowupQuestion,
  evaluateNotebookAssistantDirectPatchPolicy,
  extractNotebookAssistantToolRequests,
  extractNotebookPatchProposal,
  extractTextAddChartToolRequest,
  extractTextChartVariablesToolRequest,
  filterNotebookAssistantToolRequestsForMode,
  formatNotebookAssistantMode,
  getNotebookAssistantModeContract,
  getPatchFromNotebookAssistantToolResults,
  resolveNotebookAssistantMode,
  summarizeNotebookAssistantToolResults,
  type NotebookAssistantMode
} from "./notebookAssistantFlow";
import {
  createNotebookAssistantDebugEvent,
  formatNotebookAssistantDebugTime,
  serializeNotebookAssistantDebugEvents,
  stringifyNotebookAssistantDebugDetail,
  type NotebookAssistantDebugEvent,
  type NotebookAssistantDebugEventType
} from "./notebookAssistantDebug";
import {
  applyNotebookPatch,
  previewNotebookPatch,
  type NotebookPatch,
  type NotebookPatchResult
} from "./notebookPatch";
import { NotebookCellView } from "./NotebookCellView";
import { NotebookRenderProfiler } from "./notebookProfiler";
import { AssistantInlinePatchView } from "./AssistantInlinePatchView";
import { SourceCodeEditor } from "./SourceCodeEditor";
import { SourceValidationPanel } from "./SourceValidationPanel";
import {
  findNotebookHelpTopic,
  getNotebookHelpTopicIdForCell,
  NOTEBOOK_HELP_TOPICS,
  type NotebookHelpTopicId
} from "./sourceEditing";
import {
  buildNotebookSourceValidation,
  formatNotebookSourceLabel,
  getNotebookSourceFileSuffix,
  getNotebookSourceMimeType,
  getNotebookSourcePlaceholder,
  inferFormatFromFileName,
  serializeNotebookSource,
  summarizeCellTypes,
  validateNotebookModels
} from "./notebookSourceWorkflow";
import {
  createNotebookFromTemplate,
  type NotebookTemplateId,
  isNotebookTemplateId,
  NOTEBOOK_TEMPLATES
} from "./templates";
import {
  buildNotebookVariableDescriptions,
  formatElapsedTime,
  NOTEBOOK_AI_GUIDE_URL,
  NOTEBOOK_AI_LANDING_URL,
  parseNotebookTemplateIdFromHash,
  resolveNotebookTemplateIdFromHash,
  writeNotebookHash
} from "./notebookAppHelpers";
import type {
  NotebookCell,
  NotebookDocument
} from "./types";
import { useNotebookRunner } from "./useNotebookRunner";
import { validateNotebookDocument } from "./validation";
import { buildRuntimeConfig, type EditorState } from "../lib/editorModel";
import { PeriodScrubber } from "../components/PeriodScrubber";
import { AssistantMarkdown } from "../components/AssistantMarkdown";
import { formatAssistantTokenUsage, mergeAssistantTokenUsage, type AssistantTokenUsage } from "../assistant/sse";
import { VariableInspector } from "../components/VariableInspector";
import { VariableMathLabel } from "../components/VariableMathLabel";
import { useDragScroll } from "../hooks/useDragScroll";
import { usePanelSplitter } from "../hooks/usePanelSplitter";
import { buildVariableInspectorData } from "../lib/variableInspector";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";

type NotebookRailTab = "editor" | "inspect" | "contents" | "assistant" | "help" | "preview";

const BUILD_DATE_LABEL = formatBuildDate(__SFCR_BUILD_DATE__);

const NOTEBOOK_ASSISTANT_LOCAL_LIVE_TESTS: Array<{
  label: string;
  mode: NotebookAssistantMode;
  question: string;
}> = [
  { label: "List runs", mode: "ask", question: "What runs are in this notebook?" },
  { label: "Change alpha1", mode: "edit", question: "Change alpha1 to 0.65." },
  { label: "Add chart", mode: "edit", question: "Add a chart for YD and Cd." },
  {
    label: "BMW consumption sensitivity",
    mode: "edit",
    question: "Make consumption less sensitive to current income and more to wealth by reducing α1 and increasing α2 by 20%."
  }
];

function isNotebookAssistantLocalLiveTestEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  );
}

function formatBuildDate(buildDate: string): string {
  const parsedDate = new Date(buildDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Build unknown";
  }

  return `Built ${parsedDate.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  })}`;
}

export function NotebookApp() {
  const mainColumnRef = useRef<HTMLDivElement | null>(null);
  const [mainColumnElement, setMainColumnElement] = useState<HTMLDivElement | null>(null);
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
  const [helpContext, setHelpContext] = useState<{
    cellId: string;
    cellType: NotebookCell["type"];
    title: string;
  } | null>(null);
  const [selectedHelpTopicId, setSelectedHelpTopicId] =
    useState<NotebookHelpTopicId>("introduction");
  const [isHelpContentsVisible, setIsHelpContentsVisible] = useState(true);
  const [assistantMessages, setAssistantMessages] = useState<NotebookAssistantMessage[]>(
    NOTEBOOK_ASSISTANT_INITIAL_MESSAGES
  );
  const [assistantPromptText, setAssistantPromptText] = useState("");
  const [assistantBetaPassword, setAssistantBetaPassword] = useState("");
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantDebugEvents, setAssistantDebugEvents] = useState<NotebookAssistantDebugEvent[]>([]);
  const [isAssistantAsking, setIsAssistantAsking] = useState(false);
  const [assistantPatchText, setAssistantPatchText] = useState("");
  const [assistantPatchPreview, setAssistantPatchPreview] = useState<NotebookPatchResult | null>(null);
  const [assistantPatchUndoStack, setAssistantPatchUndoStack] = useState<Array<{
    document: NotebookDocument;
    messageId?: string;
  }>>([]);
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
  const [assistantMode, setAssistantMode] = useState<NotebookAssistantMode>(() => {
    if (typeof window === "undefined") {
      return "ask";
    }

    return resolveNotebookAssistantMode(window.localStorage.getItem(NOTEBOOK_ASSISTANT_MODE_STORAGE_KEY));
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
  const latestHistoryUpdateRef = useRef(0);
  const assistantVariableDescriptions = useMemo(
    () => buildNotebookVariableDescriptions(notebookDocument.cells),
    [notebookDocument.cells]
  );
  const maxResultPeriodIndex = useMemo(() => {
    const configuredMaxPeriodIndex = Math.max(
      0,
      ...notebookDocument.cells.flatMap((cell) => {
        if (cell.type !== "run") {
          return [];
        }

        const editor = buildEditorStateForNotebookModel(notebookDocument, cell);
        if (!editor) {
          return [];
        }

        const periods = cell.periods;
        return [Math.max(periods - 1, 0)];
      })
    );
    const outputMaxPeriodIndex = Math.max(
      0,
      ...Object.values(runner.outputs).flatMap((output) =>
        output?.type === "result"
          ? Object.values(output.result.series).map((values) => Math.max(values.length - 1, 0))
          : []
      )
    );

    return Math.max(configuredMaxPeriodIndex, outputMaxPeriodIndex);
  }, [notebookDocument, runner.outputs]);
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
  const handleMainColumnRef = useCallback(
    (node: HTMLDivElement | null) => {
      mainColumnRef.current = node;
      notebookMainDragScroll.dragScrollRef.current = node;
      setMainColumnElement(node);
    },
    [notebookMainDragScroll.dragScrollRef]
  );
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
  const selectedHelpTopic = findNotebookHelpTopic(selectedHelpTopicId);

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
    const historyUpdates = runner.historyUpdates;
    if (!historyUpdates) {
      return;
    }

    const latestUpdate = Object.entries(historyUpdates).reduce<{
      cellId: string;
      sequence: number;
    } | null>((latest, [cellId, sequence]) => {
      if (sequence == null || sequence <= latestHistoryUpdateRef.current) {
        return latest;
      }

      if (!latest || sequence > latest.sequence) {
        return { cellId, sequence };
      }

      return latest;
    }, null);

    if (!latestUpdate) {
      return;
    }

    latestHistoryUpdateRef.current = latestUpdate.sequence;
    const runCell = notebookDocument.cells.find(
      (cell) => cell.type === "run" && cell.id === latestUpdate.cellId
    );
    setUiMessage(`Updated previous-run trace for ${runCell?.title ?? latestUpdate.cellId}.`);
  }, [notebookDocument.cells, runner.historyUpdates]);

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

  function deleteCell(cellId: string): void {
    const cellIndex = notebookDocument.cells.findIndex((cell) => cell.id === cellId);
    if (cellIndex < 0) {
      return;
    }

    const nextCells = notebookDocument.cells.filter((cell) => cell.id !== cellId);
    const fallbackCell = nextCells[Math.min(cellIndex, nextCells.length - 1)] ?? null;

    setNotebookDocument((current) => ({
      ...current,
      cells: current.cells.filter((cell) => cell.id !== cellId)
    }));
    if (selectedCellId === cellId) {
      setSelectedCellId(fallbackCell?.id ?? null);
    }
    if (activeEditorCellId === cellId) {
      setActiveEditorCellId(null);
    }
  }

  function moveCell(cellId: string, direction: -1 | 1): void {
    setNotebookDocument((current) => {
      const cellIndex = current.cells.findIndex((cell) => cell.id === cellId);
      const nextIndex = cellIndex + direction;
      if (cellIndex < 0 || nextIndex < 0 || nextIndex >= current.cells.length) {
        return current;
      }

      const nextCells = [...current.cells];
      const [movedCell] = nextCells.splice(cellIndex, 1);
      nextCells.splice(nextIndex, 0, movedCell);

      return {
        ...current,
        cells: nextCells
      };
    });
    setSelectedCellId(cellId);
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

  function handleCellHelpRequest(args: {
    cellId: string;
    cellType: NotebookCell["type"];
    title: string;
  }): void {
    const cell = notebookDocument.cells.find((candidate) => candidate.id === args.cellId);
    setHelpContext(args);
    setSelectedHelpTopicId(cell ? getNotebookHelpTopicIdForCell(cell) : args.cellType);
    setIsHelpContentsVisible(false);
    setSelectedCellId(args.cellId);
    setActiveRailTab("help");
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

  function parseAssistantPatchTextValue(value: string): NotebookPatch {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return { operations: parsed as NotebookPatch["operations"] };
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as NotebookPatch;
    }
    throw new Error("Patch JSON must be an object with operations or an operations array.");
  }

  function parseAssistantPatchText(): NotebookPatch {
    return parseAssistantPatchTextValue(assistantPatchText);
  }

  function handlePreviewAssistantPatch(): void {
    try {
      const patch = parseAssistantPatchText();
      const preview = previewNotebookPatch(notebookDocument, patch);
      setAssistantPatchPreview(preview);
      setUiMessage(preview.ok ? "Previewed assistant notebook patch." : "Assistant patch has validation issues.");
    } catch (error) {
      setAssistantPatchPreview({
        issues: [
          createAssistantPatchIssue(error instanceof Error ? error.message : "Unable to parse assistant patch.")
        ],
        ok: false,
        summary: { addedCells: 0, changedCells: 0, operationCount: 0, removedCells: 0 }
      });
      setUiMessage("Assistant patch JSON could not be parsed.");
    }
  }

  function handleApplyAssistantPatch(): void {
    let result = assistantPatchPreview;
    if (!result) {
      try {
        result = applyNotebookPatch(notebookDocument, parseAssistantPatchText());
      } catch (error) {
        setAssistantPatchPreview({
          issues: [
            createAssistantPatchIssue(error instanceof Error ? error.message : "Unable to parse assistant patch.")
          ],
          ok: false,
          summary: { addedCells: 0, changedCells: 0, operationCount: 0, removedCells: 0 }
        });
        setUiMessage("Assistant patch JSON could not be parsed.");
        return;
      }
    }

    if (!result.ok) {
      setAssistantPatchPreview(result);
      setUiMessage("Fix assistant patch validation issues before applying.");
      return;
    }

    setAssistantPatchUndoStack((current) => [...current, { document: notebookDocument }]);
    replaceNotebookDocument(result.document);
    setAssistantPatchText("");
    setAssistantPatchPreview(null);
    setUiMessage("Applied assistant notebook patch.");
  }

  function handleDiscardAssistantPatch(): void {
    setAssistantPatchText("");
    setAssistantPatchPreview(null);
    setUiMessage("Discarded assistant notebook patch preview.");
  }

  function handleUndoAssistantPatch(messageId?: string): void {
    setAssistantPatchUndoStack((current) => {
      const previousEntry = current.at(-1);
      if (!previousEntry) {
        return current;
      }

      replaceNotebookDocument(previousEntry.document);
      setAssistantMessages((messages) =>
        rearmNotebookAssistantMessagePatchAfterUndo(
          messages,
          previousEntry.document,
          previousEntry.messageId ?? messageId
        )
      );
      setUiMessage("Undid assistant notebook patch.");
      return current.slice(0, -1);
    });
  }

  function updateInlineAssistantPatch(
    messageId: string,
    updater: (patch: NotebookAssistantInlinePatch) => NotebookAssistantInlinePatch
  ): void {
    setAssistantMessages((current) =>
      current.map((message) =>
        message.id === messageId && message.patch
          ? { ...message, patch: updater(message.patch) }
          : message
      )
    );
  }

  function handleToggleInlineAssistantPatchJson(messageId: string): void {
    updateInlineAssistantPatch(messageId, (patch) => ({
      ...patch,
      jsonText: patch.jsonText ?? JSON.stringify(patch.patch, null, 2),
      isJsonVisible: !patch.isJsonVisible
    }));
  }

  function handleUpdateInlineAssistantPatchJson(messageId: string, value: string): void {
    updateInlineAssistantPatch(messageId, (patch) => ({
      ...patch,
      isJsonDirty: true,
      jsonText: value
    }));
  }

  function handlePreviewInlineAssistantPatchJson(messageId: string): void {
    const message = assistantMessages.find((candidate) => candidate.id === messageId);
    if (!message?.patch) {
      return;
    }

    try {
      const patch = parseAssistantPatchTextValue(message.patch.jsonText ?? JSON.stringify(message.patch.patch, null, 2));
      const preview = previewNotebookPatch(notebookDocument, patch);
      updateInlineAssistantPatch(messageId, (current) => ({
        ...current,
        isJsonDirty: false,
        patch,
        preview
      }));
      setUiMessage(preview.ok ? "Previewed inline assistant patch." : "Inline assistant patch has validation issues.");
    } catch (error) {
      updateInlineAssistantPatch(messageId, (current) => ({
        ...current,
        isJsonDirty: true,
        preview: {
          issues: [
            createAssistantPatchIssue(error instanceof Error ? error.message : "Unable to parse assistant patch.")
          ],
          ok: false,
          summary: { addedCells: 0, changedCells: 0, operationCount: 0, removedCells: 0 }
        }
      }));
      setUiMessage("Inline assistant patch JSON could not be parsed.");
    }
  }

  function handleDiscardInlineAssistantPatch(messageId: string): void {
    updateInlineAssistantPatch(messageId, (patch) => ({
      ...patch,
      status: "discarded"
    }));
    setUiMessage("Discarded inline assistant patch proposal.");
  }

  function handleApplyInlineAssistantPatch(messageId: string): void {
    const message = assistantMessages.find((candidate) => candidate.id === messageId);
    if (!message?.patch || message.patch.status !== "ready") {
      return;
    }

    if (message.patch.isJsonDirty) {
      setUiMessage("Preview inline assistant patch JSON before applying.");
      return;
    }

    const result = applyNotebookPatch(notebookDocument, message.patch.patch);
    updateInlineAssistantPatch(messageId, (patch) => ({
      ...patch,
      isJsonDirty: false,
      preview: result,
      status: result.ok ? "applied" : patch.status
    }));

    if (!result.ok) {
      setUiMessage("Inline assistant patch has validation issues.");
      return;
    }

    setAssistantPatchUndoStack((current) => [...current, { document: notebookDocument, messageId }]);
    replaceNotebookDocument(result.document);
    setUiMessage("Applied inline assistant patch.");
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

  const appendAssistantDebugEvent = useCallback(
    (args: {
      detail?: unknown;
      label: string;
      phase?: NotebookAssistantDebugEvent["phase"];
      turnId: string;
      type: NotebookAssistantDebugEventType;
    }): void => {
      const event = createNotebookAssistantDebugEvent(args);
      setAssistantDebugEvents((current) => [...current.slice(-299), event]);
    },
    []
  );

  function handleCopyAssistantDebugTrace(): void {
    const trace = serializeNotebookAssistantDebugEvents(assistantDebugEvents);
    navigator.clipboard
      .writeText(trace)
      .then(() => setUiMessage("Copied assistant debug trace to the clipboard."))
      .catch(() => setUiMessage("Assistant debug trace is visible in the debug panel."));
  }

  function handleAssistantModeChange(nextMode: NotebookAssistantMode): void {
    setAssistantMode(nextMode);
    window.localStorage.setItem(NOTEBOOK_ASSISTANT_MODE_STORAGE_KEY, nextMode);
  }

  async function handleAskNotebookAssistant(args: {
    mode?: NotebookAssistantMode;
    question?: string;
  } = {}): Promise<void> {
    const question = (args.question ?? assistantPromptText).trim();
    const activeAssistantMode = args.mode ?? assistantMode;
    if (!question || isAssistantAsking || !NOTEBOOK_ASSISTANT_API_URL) {
      return;
    }

    const turnId = crypto.randomUUID();
    const turnStartTime = performance.now();
    const resultCount = Object.values(runner.outputs).filter((output) => output?.type === "result").length;

    appendAssistantDebugEvent({
      detail: {
        messageCount: assistantMessages.length,
        mode: activeAssistantMode,
        model: assistantModel,
        questionChars: question.length
      },
      label: `Started ${formatNotebookAssistantMode(activeAssistantMode)} assistant turn`,
      turnId,
      type: "turn:start"
    });

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
      let firstStreamDeltaLogged = false;
      let turnUsage: AssistantTokenUsage | undefined;
      const firstContext = buildNotebookAssistantContext({
        assistantMode: activeAssistantMode,
        document: notebookDocument,
        inspectorContext,
        resultCount,
        selectedPeriodIndex,
        selectedVariable: inspectorContext?.selectedVariable,
        uiMessage,
        userRequest: question
      });
      appendAssistantDebugEvent({
        detail: {
          cellCount: notebookDocument.cells.length,
          cellTypes: summarizeCellTypes(notebookDocument.cells),
          contextChars: firstContext.length,
          resultCount,
          selectedPeriodIndex,
          selectedVariable: inspectorContext?.selectedVariable ?? null,
          uiMessagePresent: uiMessage != null
        },
        label: `Built notebook context (${firstContext.length} chars)`,
        phase: "first",
        turnId,
        type: "context:built"
      });
      appendAssistantDebugEvent({
        detail: {
          messageCount: assistantMessages.slice(-8).length,
          model: assistantModel
        },
        label: "Sent first assistant request",
        phase: "first",
        turnId,
        type: "request:start"
      });
      const firstAnswerResult = await requestNotebookAssistantAnswer({
        betaPassword: assistantBetaPassword,
        context: firstContext,
        messages: assistantMessages.slice(-8),
        model: assistantModel,
        onTextDelta: (delta) => {
          streamedText += delta;
          if (!firstStreamDeltaLogged) {
            firstStreamDeltaLogged = true;
            appendAssistantDebugEvent({
              detail: { deltaChars: delta.length, totalChars: streamedText.length },
              label: "Received first stream text",
              phase: "first",
              turnId,
              type: "stream:delta"
            });
          }
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
      if (firstAnswerResult.usage) {
        turnUsage = mergeAssistantTokenUsage(turnUsage, firstAnswerResult.usage);
        if (turnUsage) {
          setUiMessage(formatAssistantTokenUsage(turnUsage, assistantModel));
        }
      }
      const firstAnswer = firstAnswerResult.text;
      appendAssistantDebugEvent({
        detail: { chars: firstAnswer.length, text: firstAnswer },
        label: `Received first assistant response (${firstAnswer.length} chars)`,
        phase: "first",
        turnId,
        type: "response:received"
      });

      const toolRequestExtraction = extractNotebookAssistantToolRequests(firstAnswer);
      appendAssistantDebugEvent({
        detail: toolRequestExtraction,
        label: toolRequestExtraction.error
          ? "Tool request extraction failed"
          : `Extracted ${toolRequestExtraction.requests.length} tool request${toolRequestExtraction.requests.length === 1 ? "" : "s"}`,
        turnId,
        type: "tool:extracted"
      });
      if (toolRequestExtraction.error) {
        setAssistantMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text: toolRequestExtraction.error ?? "Assistant requested notebook tools, but the request could not be parsed."
                }
              : message
          )
        );
        return;
      }

      if (toolRequestExtraction.requests.length === 0) {
        const directPatch = activeAssistantMode === "edit"
          ? extractNotebookPatchProposal({ document: notebookDocument, question, text: firstAnswer })
          : null;
        if (directPatch) {
          const policy = evaluateNotebookAssistantDirectPatchPolicy(notebookDocument, directPatch);
          if (!policy.ok) {
            setNotebookAssistantMessageText(setAssistantMessages, assistantMessageId, policy.message);
            return;
          }
          if ("request" in policy) {
            const result = dispatchNotebookAssistantTool(buildNotebookAssistantSnapshot(), policy.request);
            const proposedPatch = getPatchFromNotebookAssistantToolResults([result]);
            appendAssistantDebugEvent({
              detail: { request: policy.request, result },
              label: `Ran helper tool ${policy.request.name}`,
              turnId,
              type: "tool:result"
            });
            if (!result.ok || !proposedPatch) {
              setNotebookAssistantMessageText(
                setAssistantMessages,
                assistantMessageId,
                "The notebook helper could not prepare that edit automatically. Try asking again with the chart, run, or parameter name included."
              );
              return;
            }
            appendAssistantDebugEvent({
              detail: proposedPatch,
              label: `Prepared patch with ${proposedPatch.operations.length} operation${proposedPatch.operations.length === 1 ? "" : "s"}`,
              turnId,
              type: "patch:proposed"
            });
            setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, proposedPatch, notebookDocument);
            setNotebookAssistantMessageText(
              setAssistantMessages,
              assistantMessageId,
              "I prepared a validated patch with the notebook helper tools. Review it below, then apply it when ready."
            );
            return;
          }
          appendAssistantDebugEvent({
            detail: policy.patch,
            label: `Prepared direct patch with ${policy.patch.operations.length} operation${policy.patch.operations.length === 1 ? "" : "s"}`,
            turnId,
            type: "patch:proposed"
          });
          setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, policy.patch, notebookDocument);
          return;
        }

        const textProposalRequest = activeAssistantMode === "edit"
          ? extractTextChartVariablesToolRequest(notebookDocument, `${question}\n${firstAnswer}`)
          : null;
        const textAddChartRequest = activeAssistantMode === "edit" && !textProposalRequest
          ? extractTextAddChartToolRequest(notebookDocument, `${question}\n${firstAnswer}`)
          : null;
        const textFallbackRequest = textProposalRequest ?? textAddChartRequest;
        if (textFallbackRequest) {
          const result = dispatchNotebookAssistantTool(buildNotebookAssistantSnapshot(), textFallbackRequest);
          const proposedPatch = getPatchFromNotebookAssistantToolResults([result]);
            appendAssistantDebugEvent({
              detail: { request: textFallbackRequest, result },
              label: `Ran helper tool ${textFallbackRequest.name}`,
              turnId,
              type: "tool:result"
            });
          if (result.ok && proposedPatch) {
              appendAssistantDebugEvent({
                detail: proposedPatch,
                label: `Prepared patch with ${proposedPatch.operations.length} operation${proposedPatch.operations.length === 1 ? "" : "s"}`,
                turnId,
                type: "patch:proposed"
              });
            setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, proposedPatch, notebookDocument);
          }
        }
        return;
      }

      const modeFilteredRequests = filterNotebookAssistantToolRequestsForMode(
        activeAssistantMode,
        toolRequestExtraction.requests
      );
      if (modeFilteredRequests.blocked.length > 0) {
        appendAssistantDebugEvent({
          detail: { blocked: modeFilteredRequests.blocked, mode: activeAssistantMode },
          label: `Blocked ${modeFilteredRequests.blocked.length} tool request${modeFilteredRequests.blocked.length === 1 ? "" : "s"}`,
          turnId,
          type: "tool:blocked"
        });
      }
      if (modeFilteredRequests.allowed.length === 0 && modeFilteredRequests.blocked.length > 0) {
        setAssistantMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text: "Ask mode can inspect notebook state with read tools, but it will not create patch proposals. Switch to Edit mode to prepare notebook changes for preview."
                }
              : message
          )
        );
        return;
      }

      const toolRequests = modeFilteredRequests.allowed.slice(0, NOTEBOOK_ASSISTANT_MAX_TOOL_REQUESTS_PER_ROUND);

      const toolDispatch = dispatchNotebookAssistantToolRequests(buildNotebookAssistantSnapshot(), toolRequests);
      const toolResults = toolDispatch.toolResults;
      const toolSummary = summarizeNotebookAssistantToolResults(toolResults);
      const proposedPatch = toolDispatch.proposedPatch ?? getPatchFromNotebookAssistantToolResults(toolResults, toolRequests);
      appendAssistantDebugEvent({
        detail: { requests: toolRequests, results: toolResults },
        label: `Ran ${toolResults.length} assistant tool${toolResults.length === 1 ? "" : "s"}`,
        turnId,
        type: "tool:result"
      });
      if (proposedPatch) {
        appendAssistantDebugEvent({
          detail: proposedPatch,
          label: `Prepared patch with ${proposedPatch.operations.length} operation${proposedPatch.operations.length === 1 ? "" : "s"}`,
          turnId,
          type: "patch:proposed"
        });
        setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, proposedPatch, notebookDocument);
      }

      const localToolResultAnswer = activeAssistantMode === "edit"
        ? buildNotebookAssistantLocalToolResultAnswer({ proposedPatch, toolResults })
        : null;
      if (localToolResultAnswer) {
        appendAssistantDebugEvent({
          detail: { reason: "successful edit tool patch", toolResultCount: toolResults.length },
          label: "Skipped follow-up assistant request",
          phase: "followup",
          turnId,
          type: "request:skipped"
        });
        setNotebookAssistantMessageText(setAssistantMessages, assistantMessageId, localToolResultAnswer);
        return;
      }

      setAssistantMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: `${toolSummary} Preparing answer...`
              }
            : message
        )
      );

      streamedText = "";
      let followupStreamDeltaLogged = false;
      const followupContext = buildNotebookAssistantToolResultContext({
        assistantMode: activeAssistantMode,
        document: notebookDocument,
        resultCount,
        selectedPeriodIndex,
        selectedVariable: inspectorContext?.selectedVariable,
        toolResults,
        uiMessage
      });
      appendAssistantDebugEvent({
        detail: {
          contextChars: followupContext.length,
          resultCount,
          selectedPeriodIndex,
          selectedVariable: inspectorContext?.selectedVariable ?? null,
          toolResultCount: toolResults.length
        },
        label: `Built follow-up context (${followupContext.length} chars)`,
        phase: "followup",
        turnId,
        type: "context:built"
      });
      appendAssistantDebugEvent({
        detail: {
          messageCount: assistantMessages.slice(-6).length + 2,
          model: assistantModel,
          toolResultCount: toolResults.length
        },
        label: "Sent follow-up assistant request",
        phase: "followup",
        turnId,
        type: "request:start"
      });
      const finalAnswerResult = await requestNotebookAssistantAnswer({
        betaPassword: assistantBetaPassword,
        context: followupContext,
        messages: [
          ...assistantMessages.slice(-6),
          userMessage,
          {
            id: assistantMessageId,
            role: "assistant",
            text: firstAnswer
          }
        ],
        model: assistantModel,
        onTextDelta: (delta) => {
          streamedText += delta;
          if (!followupStreamDeltaLogged) {
            followupStreamDeltaLogged = true;
            appendAssistantDebugEvent({
              detail: { deltaChars: delta.length, totalChars: streamedText.length },
              label: "Received follow-up stream text",
              phase: "followup",
              turnId,
              type: "stream:delta"
            });
          }
          setAssistantMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId ? { ...message, text: `${toolSummary}\n\n${streamedText}` } : message
            )
          );
        },
        question: buildNotebookAssistantToolFollowupQuestion({
          originalQuestion: question,
          toolResults
        })
      });
      if (finalAnswerResult.usage) {
        turnUsage = mergeAssistantTokenUsage(turnUsage, finalAnswerResult.usage);
        if (turnUsage) {
          setUiMessage(formatAssistantTokenUsage(turnUsage, assistantModel));
        }
      }
      const finalAnswer = finalAnswerResult.text;
      appendAssistantDebugEvent({
        detail: { chars: finalAnswer.length, text: finalAnswer },
        label: `Received final assistant response (${finalAnswer.length} chars)`,
        phase: "followup",
        turnId,
        type: "response:received"
      });
      const directPatch = activeAssistantMode === "edit"
        ? extractNotebookPatchProposal({ document: notebookDocument, question, text: finalAnswer })
        : null;
      if (directPatch) {
        const policy = evaluateNotebookAssistantDirectPatchPolicy(notebookDocument, directPatch);
        if (!policy.ok) {
          setNotebookAssistantMessageText(setAssistantMessages, assistantMessageId, policy.message);
          return;
        }
        if ("request" in policy) {
          const result = dispatchNotebookAssistantTool(buildNotebookAssistantSnapshot(), policy.request);
          const proposedPatch = getPatchFromNotebookAssistantToolResults([result]);
          appendAssistantDebugEvent({
            detail: { request: policy.request, result },
            label: `Ran helper tool ${policy.request.name}`,
            turnId,
            type: "tool:result"
          });
          if (!result.ok || !proposedPatch) {
            setNotebookAssistantMessageText(
              setAssistantMessages,
              assistantMessageId,
              "The notebook helper could not prepare that edit automatically. Try asking again with the chart, run, or parameter name included."
            );
            return;
          }
          appendAssistantDebugEvent({
            detail: proposedPatch,
            label: `Prepared patch with ${proposedPatch.operations.length} operation${proposedPatch.operations.length === 1 ? "" : "s"}`,
            turnId,
            type: "patch:proposed"
          });
          setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, proposedPatch, notebookDocument);
          setNotebookAssistantMessageText(
            setAssistantMessages,
            assistantMessageId,
            "I prepared a validated patch with the notebook helper tools. Review it below, then apply it when ready."
          );
          return;
        }
        appendAssistantDebugEvent({
          detail: policy.patch,
          label: `Prepared direct patch with ${policy.patch.operations.length} operation${policy.patch.operations.length === 1 ? "" : "s"}`,
          turnId,
          type: "patch:proposed"
        });
        setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, policy.patch, notebookDocument);
        return;
      }

      const textProposalRequest = activeAssistantMode === "edit"
        ? extractTextChartVariablesToolRequest(notebookDocument, `${question}\n${finalAnswer}`)
        : null;
      if (textProposalRequest) {
        const result = dispatchNotebookAssistantTool(buildNotebookAssistantSnapshot(), textProposalRequest);
        const proposedPatch = getPatchFromNotebookAssistantToolResults([result]);
        appendAssistantDebugEvent({
          detail: { request: textProposalRequest, result },
          label: `Ran helper tool ${textProposalRequest.name}`,
          turnId,
          type: "tool:result"
        });
        if (result.ok && proposedPatch) {
          appendAssistantDebugEvent({
            detail: proposedPatch,
            label: `Prepared patch with ${proposedPatch.operations.length} operation${proposedPatch.operations.length === 1 ? "" : "s"}`,
            turnId,
            type: "patch:proposed"
          });
          setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, proposedPatch, notebookDocument);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to ask notebook assistant.";
      appendAssistantDebugEvent({
        detail: { message, stack: error instanceof Error ? error.stack : undefined },
        label: message,
        turnId,
        type: "turn:error"
      });
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
      appendAssistantDebugEvent({
        detail: { durationMs: performance.now() - turnStartTime },
        label: `Finished assistant turn in ${formatElapsedTime(performance.now() - turnStartTime)}`,
        turnId,
        type: "turn:done"
      });
      setIsAssistantAsking(false);
    }
  }

  function buildNotebookAssistantSnapshot(): NotebookAssistantSnapshot {
    return {
      document: notebookDocument,
      runtime: {
        errors: runner.errors,
        outputs: runner.outputs,
        status: runner.status
      },
      selectedCellId,
      selectedPeriodIndex,
      selectedVariable: inspectorContext?.selectedVariable
    };
  }

  function handleRunNotebookAssistantLocalLiveTest(test: (typeof NOTEBOOK_ASSISTANT_LOCAL_LIVE_TESTS)[number]): void {
    handleAssistantModeChange(test.mode);
    setAssistantPromptText(test.question);
    void handleAskNotebookAssistant({ mode: test.mode, question: test.question });
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
    <NotebookRenderProfiler
      id="NotebookApp"
      metadata={{
        activeRailTab,
        cellCount: notebookDocument.cells.length,
        hasActiveEditor: activeEditorCellId != null,
        selectedPeriodIndex
      }}
    >
      <main className="app-shell notebook-shell">
      {uiMessage ? (
        <section className="toast-stack" aria-live="polite" aria-atomic="true">
          <div
            className={`toast-notification ${
              uiMessage.toLowerCase().includes("imported") ||
              uiMessage.toLowerCase().includes("exported") ||
              uiMessage.toLowerCase().includes("downloaded") ||
              uiMessage.toLowerCase().includes("loaded") ||
              uiMessage.toLowerCase().includes("llm usage") ||
              uiMessage.toLowerCase().includes("ran all") ||
              uiMessage.toLowerCase().includes("previous-run trace")
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
          ref={handleMainColumnRef}
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
                <div className="notebook-app-bar-meta">
                  <span className="eyebrow">Notebook commands</span>
                  <span className="notebook-build-badge" title={__SFCR_BUILD_DATE__}>
                    {BUILD_DATE_LABEL}
                  </span>
                </div>
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
                  {...{ "aria-pressed": activeRailTab === "contents" }}
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

          <NotebookRenderProfiler
            id="NotebookCanvas"
            metadata={{
              cellCount: notebookDocument.cells.length,
              hasActiveEditor: activeEditorCellId != null,
              selectedPeriodIndex
            }}
          >
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
                  viewportRoot={mainColumnElement}
                  onSelectedCellIdChange={setSelectedCellId}
                  onSelectedPeriodIndexChange={setSelectedPeriodIndex}
                  runner={runner}
                  onActiveEditorCellIdChange={setActiveEditorCellId}
                  onDeleteCell={deleteCell}
                  onMoveCell={moveCell}
                  onModelChange={updateModelCell}
                  onCellChange={updateCell}
                  onCellHelpRequest={handleCellHelpRequest}
                  onVariableInspectRequest={handleVariableInspectRequest}
                  selectedCellId={selectedCellId}
                  selectedPeriodIndex={selectedPeriodIndex}
                />
              ))}
            </section>
          </NotebookRenderProfiler>
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
                {...{ "aria-selected": activeRailTab === "contents" }}
                className={`notebook-rail-tab${activeRailTab === "contents" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("contents")}
              >
                Contents
              </button>
              <button
                type="button"
                role="tab"
                {...{ "aria-selected": activeRailTab === "inspect" }}
                className={`notebook-rail-tab${activeRailTab === "inspect" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("inspect")}
              >
                Inspect
              </button>
              <button
                type="button"
                role="tab"
                {...{ "aria-selected": activeRailTab === "assistant" }}
                className={`notebook-rail-tab${activeRailTab === "assistant" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("assistant")}
              >
                Assistant
              </button>
              <button
                type="button"
                role="tab"
                {...{ "aria-selected": activeRailTab === "help" }}
                className={`notebook-rail-tab${activeRailTab === "help" ? " is-active" : ""}`}
                onClick={() => {
                  setSelectedHelpTopicId("introduction");
                  setHelpContext(null);
                  setIsHelpContentsVisible(true);
                  setActiveRailTab("help");
                }}
              >
                Help
              </button>
              <button
                type="button"
                role="tab"
                {...{ "aria-selected": activeRailTab === "editor" }}
                className={`notebook-rail-tab${activeRailTab === "editor" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("editor")}
              >
                Editor
              </button>
              {importPreview ? (
                <button
                  type="button"
                  role="tab"
                  {...{ "aria-selected": activeRailTab === "preview" }}
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

          {activeRailTab === "help" ? (
            <section className="notebook-sidebar-panel notebook-help-panel" role="tabpanel">
              <div className="panel-header">
                <div>
                  <h2>{selectedHelpTopic.title}</h2>
                  <p className="panel-subtitle">
                    {helpContext ? helpContext.title : selectedHelpTopic.description}
                  </p>
                </div>
                <button
                  type="button"
                  className="notebook-help-more-chip"
                  {...{ "aria-expanded": isHelpContentsVisible ? "true" : "false" }}
                  onClick={() => setIsHelpContentsVisible((current) => !current)}
                >
                  More Help
                </button>
              </div>
              {isHelpContentsVisible ? (
                <nav className="notebook-help-topic-nav" aria-label="Help contents">
                  {NOTEBOOK_HELP_TOPICS.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      className={`notebook-help-topic-button${
                        selectedHelpTopic.id === topic.id ? " is-active" : ""
                      }`}
                      onClick={() => {
                        setSelectedHelpTopicId(topic.id);
                        setHelpContext(null);
                        setIsHelpContentsVisible(false);
                      }}
                    >
                      <span>{topic.title}</span>
                      <small>{topic.description}</small>
                    </button>
                  ))}
                </nav>
              ) : null}
              <AssistantMarkdown text={selectedHelpTopic.text} />
            </section>
          ) : null}

          {activeRailTab === "assistant" ? (
            <section className="notebook-sidebar-panel notebook-assistant-panel" role="tabpanel">
              <div className="panel-header">
                <div>
                  <h2>Assistant</h2>
                  <p className="panel-subtitle">
                    {assistantMode === "edit"
                      ? "Prepare validated notebook changes for review."
                      : "Ask questions and inspect notebook state."}
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
                  <option value="gpt-5.4-mini">GPT-5.4 mini</option>
                  <option value="gpt-5.4">GPT-5.4</option>
                  <option value="gpt-4.1">GPT-4.1</option>
                  <option value="gpt-5.5">GPT-5.5</option>
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
              {isNotebookAssistantLocalLiveTestEnabled() ? (
                <details className="notebook-assistant-debug-panel">
                  <summary>Local Live Tests</summary>
                  <div className="notebook-assistant-debug-actions">
                    <span className="status-hint">
                      Runs fixed prompts through the same live assistant request and tool loop as the composer.
                    </span>
                    <div className="button-row">
                      {NOTEBOOK_ASSISTANT_LOCAL_LIVE_TESTS.map((test) => (
                        <button
                          key={`${test.mode}-${test.label}`}
                          type="button"
                          className="secondary-button"
                          onClick={() => handleRunNotebookAssistantLocalLiveTest(test)}
                          disabled={isAssistantAsking || !NOTEBOOK_ASSISTANT_API_URL}
                        >
                          {test.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </details>
              ) : null}
              {assistantError ? <div className="field-error">{assistantError}</div> : null}

              <details className="notebook-assistant-patch-panel">
                <summary>Manual Patch JSON</summary>
                <label className="field" htmlFor="notebook-assistant-patch-json">
                  <span>Patch JSON</span>
                  <textarea
                    id="notebook-assistant-patch-json"
                    className="notebook-utility-textarea"
                    rows={5}
                    value={assistantPatchText}
                    onChange={(event) => {
                      setAssistantPatchText(event.target.value);
                      setAssistantPatchPreview(null);
                    }}
                    placeholder='[{"op":"add","path":"/cells/-","value":{"id":"chart-y","type":"chart","title":"Income","sourceRunCellId":"baseline-newton","variables":["Y"]}}]'
                  />
                </label>

                {assistantPatchPreview ? (
                  <div className="notebook-assistant-patch-preview" role="status">
                    <div className="status-hint">
                      Patch preview: {assistantPatchPreview.ok ? "valid" : "invalid"}. Operations: {assistantPatchPreview.summary.operationCount}; added: {assistantPatchPreview.summary.addedCells}; changed: {assistantPatchPreview.summary.changedCells}; removed: {assistantPatchPreview.summary.removedCells}.
                    </div>
                    {assistantPatchPreview.issues.length > 0 ? (
                      <ul className="notebook-inline-list">
                        {assistantPatchPreview.issues.map((issue, index) => (
                          <li key={`${issue.message}-${index}`} className={issue.severity === "error" ? "field-error" : "status-hint"}>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handlePreviewAssistantPatch}
                    disabled={!assistantPatchText.trim()}
                  >
                    Preview patch
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyAssistantPatch}
                    disabled={!assistantPatchPreview?.ok}
                  >
                    Apply patch
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleDiscardAssistantPatch}
                    disabled={!assistantPatchText.trim() && !assistantPatchPreview}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleUndoAssistantPatch()}
                    disabled={assistantPatchUndoStack.length === 0}
                  >
                    Undo patch
                  </button>
                </div>
              </details>

              <details className="notebook-assistant-debug-panel">
                <summary>Debug Trace</summary>
                <div className="notebook-assistant-debug-actions">
                  <span className="status-hint">
                    {assistantDebugEvents.length === 0
                      ? "No assistant trace events yet."
                      : `${assistantDebugEvents.length} trace event${assistantDebugEvents.length === 1 ? "" : "s"}`}
                  </span>
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleCopyAssistantDebugTrace}
                      disabled={assistantDebugEvents.length === 0}
                    >
                      Copy trace
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setAssistantDebugEvents([])}
                      disabled={assistantDebugEvents.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {assistantDebugEvents.length > 0 ? (
                  <ol className="notebook-assistant-debug-list" aria-label="Assistant debug events">
                    {assistantDebugEvents.map((event) => {
                      const detail = stringifyNotebookAssistantDebugDetail(event.detail);
                      return (
                        <li key={event.id} className="notebook-assistant-debug-event">
                          <div className="notebook-assistant-debug-event-header">
                            <span className="notebook-assistant-debug-event-time">
                              {formatNotebookAssistantDebugTime(event.at)}
                            </span>
                            <span className="notebook-assistant-debug-event-type">
                              {event.phase ? `${event.phase} / ` : ""}{event.type}
                            </span>
                          </div>
                          <div className="notebook-assistant-debug-event-label">{event.label}</div>
                          {detail ? <pre>{detail}</pre> : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </details>

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
                      <>
                        <AssistantMarkdown
                          text={message.text}
                          variableDescriptions={assistantVariableDescriptions}
                        />
                        <AssistantInlinePatchView
                          message={message}
                          onApply={handleApplyInlineAssistantPatch}
                          onDiscard={handleDiscardInlineAssistantPatch}
                          onPreviewJson={handlePreviewInlineAssistantPatchJson}
                          onToggleJson={handleToggleInlineAssistantPatchJson}
                          onUndo={handleUndoAssistantPatch}
                          onUpdateJson={handleUpdateInlineAssistantPatchJson}
                          undoStackLength={assistantPatchUndoStack.length}
                        />
                      </>
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
                <div className="field">
                  <div className="notebook-assistant-question-header">
                    <label className="field-label" htmlFor="notebook-assistant-question">
                      Question
                    </label>
                    <div className="notebook-assistant-mode-switch notebook-assistant-mode-switch-compact" aria-label="Assistant mode">
                      <button
                        type="button"
                        aria-label="Ask mode"
                        className={assistantMode === "ask" ? "is-active" : ""}
                        onClick={() => handleAssistantModeChange("ask")}
                      >
                        Ask
                      </button>
                      <button
                        type="button"
                        aria-label="Edit mode"
                        className={assistantMode === "edit" ? "is-active" : ""}
                        onClick={() => handleAssistantModeChange("edit")}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="status-hint">
                    {getNotebookAssistantModeContract(assistantMode)}
                  </div>
                  <textarea
                    id="notebook-assistant-question"
                    rows={5}
                    value={assistantPromptText}
                    onChange={(event) => setAssistantPromptText(event.target.value)}
                    placeholder={
                      assistantMode === "edit"
                        ? "Describe the notebook change to prepare as a validated patch."
                        : "Ask about this notebook, a variable, a matrix, an error, or a result."
                    }
                  />
                </div>
                <div className="button-row">
                  <button
                    type="submit"
                    disabled={!assistantPromptText.trim() || isAssistantAsking || !NOTEBOOK_ASSISTANT_API_URL}
                  >
                    {isAssistantAsking ? "Working..." : assistantMode === "edit" ? "Prepare edit" : "Ask"}
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
    </NotebookRenderProfiler>
  );
}

