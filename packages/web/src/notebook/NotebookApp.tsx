import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { externalRowsOnly, isRowComment, type EquationRow } from "@sfcr/notebook-core";

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
  preferMatrixLookupForMatrixEditQuestion,
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
import { NotebookCellView, type NotebookCellViewProps } from "./NotebookCellView";
import { PinnedCellPanel } from "./components/PinnedCellPanel";
import { resolveNotebookScopeId } from "./resolveNotebookScopeId";
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
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  type NotebookTemplateId,
  isNotebookTemplateId,
  NOTEBOOK_TEMPLATES
} from "./templates";
import {
  buildNotebookVariableDescriptions,
  buildNotebookVariableUnitMetadata,
  formatElapsedTime,
  NOTEBOOK_AI_GUIDE_URL,
  NOTEBOOK_AI_LANDING_URL,
  migrateNotebookHashToPathname,
  parseNotebookTemplateIdFromHash,
  parseNotebookVariantIdFromHash,
  readNotebookRouteLocation,
  resolveNotebookTemplateIdFromLocation,
  type NotebookRouteLocation,
  writeNotebookLocation,
  writeNotebookVariantHash
} from "./notebookAppHelpers";
import { NotebookVariantManagerDialog } from "./NotebookVariantManagerDialog";
import {
  createNotebookVariantFromDocument,
  createNotebookVariantFromTemplate,
  CUSTOM_NOTEBOOK_STORAGE_KEY,
  IMPORTED_NOTEBOOK_VARIANT_ID,
  isNotebookVariantId,
  listImportedNotebookVariants,
  listNotebookVariants,
  loadNotebookVariantDocument,
  migrateLegacyStoredNotebooks,
  removeNotebookVariant,
  renameNotebookVariant,
  saveNotebookVariantDocument,
  upsertImportedNotebookVariant,
  type NotebookVariantIndexEntry
} from "./notebookVariants";
import type {
  MatrixCell,
  NotebookCell,
  NotebookDocument,
  NotebookCellInsertType,
  RunCell
} from "./types";
import { useNotebookRunner } from "./useNotebookRunner";
import { validateNotebookDocument } from "./validation";
import { buildRuntimeConfig, type EditorState } from "../lib/editorModel";
import { PeriodScrubber } from "../components/PeriodScrubber";
import { AssistantMarkdown } from "../components/AssistantMarkdown";
import { formatAssistantTokenUsage, mergeAssistantTokenUsage, type AssistantTokenUsage } from "../assistant/sse";
import { VariableInspector } from "../components/VariableInspector";
import {
  StabilityRawDataDialog,
  STABILITY_RAW_PANEL_DEBOUNCE_MS
} from "../components/StabilityRawDataDialog";
import { VariableCatalogPanel } from "../components/VariableCatalogPanel";
import type { MatrixGraphSliceHighlight } from "./graphDocumentHighlight";
import { matrixGraphSliceHighlightsEqual } from "./graphDocumentHighlight";
import { MatrixGraphRailPanel } from "./components/MatrixGraphRailPanel";
import {
  applyMatrixGraphRequest,
  addMatrixGraphChartSeries,
  removeMatrixGraphChart,
  removeMatrixGraphChartSeries,
  toggleMatrixGraphChartLegendMode,
  toggleMatrixGraphChartPin,
  type MatrixGraphChartEntry
} from "./matrixGraphRailState";
import { collectMatrixGraphSliceSeries } from "./matrixSliceGraph";
import { VariableMathLabel } from "../components/VariableMathLabel";
import { useDragScroll } from "../hooks/useDragScroll";
import { useInspectorVariableHistory } from "../hooks/useInspectorVariableHistory";
import {
  stabilityTargetCacheKey,
  useStabilityMetrics
} from "../hooks/useStabilityMetrics";
import { resolveNotebookStabilityTarget } from "../lib/stabilityAtPeriod";
import { usePanelSplitter } from "../hooks/usePanelSplitter";
import { useNotebookStickySurfaceTop } from "./useNotebookStickySurfaceTop";
import { buildVariableInspectorData } from "../lib/variableInspector";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { buildVariableDescriptions } from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";
import {
  applyInspectorDefiningEquationExpression,
  buildInspectorCurrentValues,
  buildInspectorSeriesValues,
  resolvePreferredInspectorRunCell,
  buildVariableInspectRequestFromCatalogRow,
  resolveInspectorRunCell,
  isInspectorModelEditable,
  isSameInspectorContext,
  resolveInspectorModelSource,
  updateEditorDefiningEquationExpression,
  type VariableInspectRequest
} from "../lib/variableInspect";
import {
  buildCurrentValuesByModel,
  buildModelCurrentValues,
  buildModelLaggedCurrentValues,
  buildVariableCatalogRows,
  findPreferredRunForModelKey,
  listCatalogModelContexts,
  type VariableCatalogRow
} from "../lib/variableCatalog";
import {
  hasParameterOverrides,
  type ConstantExternalOverrides
} from "../lib/externalParameterControls";
import {
  isPartialSimulationResult,
  partialResultFailurePeriodIndex,
  resolvePartialRunMaxPeriodIndex
} from "../lib/partialRunResult";
import type { MatrixGraphRequest } from "./matrixSliceGraph";

type NotebookRailTab =
  | "editor"
  | "variables"
  | "inspect"
  | "graph"
  | "contents"
  | "assistant"
  | "help"
  | "preview";

const BUILD_DATE_LABEL = formatBuildDate(__SFCR_BUILD_DATE__);
const NOTEBOOK_HISTORY_LIMIT = 50;

interface NotebookHistoryEntry {
  document: NotebookDocument;
  label: string;
  messageId?: string;
}

interface NotebookJournalState {
  future: NotebookHistoryEntry[];
  past: NotebookHistoryEntry[];
  present: NotebookDocument;
}

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

export { CUSTOM_NOTEBOOK_STORAGE_KEY } from "./notebookVariants";

const LEGACY_CUSTOM_NOTEBOOK_HASH = "#/notebook/custom";
const UNNAMED_NOTEBOOK_SELECT_VALUE = "__unnamed__";
const NOTEBOOK_SOURCE_FORMATS: readonly NotebookSourceFormat[] = ["json", "markdown", "yaml"];

interface NotebookSessionState {
  activeVariantId: string | null;
  document: NotebookDocument;
}

function isNotebookAssistantLocalLiveTestEnabled(): boolean {
  return (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  );
}

function getNextNotebookSourceFormat(format: NotebookSourceFormat): NotebookSourceFormat {
  const currentIndex = NOTEBOOK_SOURCE_FORMATS.indexOf(format);
  return NOTEBOOK_SOURCE_FORMATS[(currentIndex + 1) % NOTEBOOK_SOURCE_FORMATS.length] ?? "json";
}

function formatNotebookSourceFormatOptions(): string {
  return NOTEBOOK_SOURCE_FORMATS.map(formatNotebookSourceLabel).join(" / ");
}

function limitNotebookHistory(entries: NotebookHistoryEntry[]): NotebookHistoryEntry[] {
  return entries.length > NOTEBOOK_HISTORY_LIMIT
    ? entries.slice(entries.length - NOTEBOOK_HISTORY_LIMIT)
    : entries;
}

function isNotebookHistoryShortcutEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest("input, textarea, select, [contenteditable='true'], .cm-editor") != null;
}

function resolveInitialNotebookSession(
  location: NotebookRouteLocation,
  hash: string
): NotebookSessionState {
  const variants = migrateLegacyStoredNotebooks();

  if (location.variantId) {
    const variantDocument = loadNotebookVariantDocument(location.variantId);
    if (variantDocument) {
      return { activeVariantId: location.variantId, document: variantDocument };
    }
  }

  if (hash === LEGACY_CUSTOM_NOTEBOOK_HASH) {
    const imported = variants.find((entry) => entry.id === IMPORTED_NOTEBOOK_VARIANT_ID);
    if (imported) {
      const importedDocument = loadNotebookVariantDocument(imported.id);
      if (importedDocument) {
        return { activeVariantId: imported.id, document: importedDocument };
      }
    }
  }

  const templateId = resolveNotebookTemplateIdFromLocation(location);
  return {
    activeVariantId: null,
    document: createNotebookFromTemplate(templateId)
  };
}

function resolveNotebookDerivedFrom(
  document: NotebookDocument,
  activeVariantId: string | null,
  currentTemplateId: NotebookTemplateId | ""
): NotebookTemplateId | null {
  if (activeVariantId) {
    const entry = listNotebookVariants().find((variant) => variant.id === activeVariantId);
    return entry?.derivedFrom ?? null;
  }

  if (currentTemplateId) {
    return currentTemplateId;
  }

  const templateId = document.metadata.template;
  return templateId && isNotebookTemplateId(templateId) ? templateId : null;
}

function resolveCurrentTemplateId(document: NotebookDocument): NotebookTemplateId | "" {
  const templateId = document.metadata.template;
  if (!templateId || !isNotebookTemplateId(templateId)) {
    return "";
  }

  const documentJson = serializeNotebookSource(document, "json");
  const templateJson = serializeNotebookSource(NOTEBOOK_TEMPLATES[templateId].document, "json");
  return documentJson === templateJson ? templateId : "";
}

function createNotebookCellForInsert(
  cells: NotebookCell[],
  anchorIndex: number,
  type: NotebookCellInsertType
): NotebookCell | null {
  const anchorCell = cells[anchorIndex];
  switch (type) {
    case "markdown":
      return {
        id: createUniqueNotebookCellId(cells, "note"),
        type: "markdown",
        title: "New note",
        source: ""
      };
    case "run": {
      const modelSource = resolveDefaultModelSource(cells, anchorIndex);
      if (!modelSource) {
        return null;
      }
      const runId = createUniqueNotebookCellId(cells, "run");
      return {
        id: runId,
        type: "run",
        title: "New run",
        mode: "baseline",
        periods: resolveDefaultRunPeriods(cells, anchorCell),
        resultKey: runId.replace(/-/g, "_"),
        ...modelSource
      };
    }
    case "chart": {
      const runCell = resolveDefaultRunCell(cells, anchorIndex);
      if (!runCell) {
        return null;
      }
      return {
        id: createUniqueNotebookCellId(cells, "chart"),
        type: "chart",
        title: "New chart",
        sourceRunCellId: runCell.id,
        variables: resolveDefaultVariablesForRun(cells, runCell).slice(0, 3),
        axisMode: "separate",
        referenceTrace: "none"
      };
    }
    case "table": {
      const runCell = resolveDefaultRunCell(cells, anchorIndex);
      if (!runCell) {
        return null;
      }
      return {
        id: createUniqueNotebookCellId(cells, "table"),
        type: "table",
        title: "New table",
        sourceRunCellId: runCell.id,
        variables: resolveDefaultVariablesForRun(cells, runCell).slice(0, 6)
      };
    }
    case "matrix": {
      const runCell = resolveDefaultRunCell(cells, anchorIndex);
      return {
        id: createUniqueNotebookCellId(cells, "matrix"),
        type: "matrix",
        title: "New matrix",
        ...(runCell ? { sourceRunCellId: runCell.id } : {}),
        columns: ["Column 1", "Column 2", "Sum"],
        sectors: ["", "", ""],
        rows: [{ label: "Sum", values: ["", "", "0"] }]
      };
    }
    case "sequence": {
      const matrixCell = resolveDefaultMatrixCell(cells, anchorIndex);
      if (matrixCell) {
        return {
          id: createUniqueNotebookCellId(cells, "sequence"),
          type: "sequence",
          title: "New sequence",
          source: { kind: "matrix", matrixCellId: matrixCell.id }
        };
      }
      const modelSource = resolveDefaultModelSource(cells, anchorIndex);
      if (modelSource) {
        return {
          id: createUniqueNotebookCellId(cells, "sequence"),
          type: "sequence",
          title: "New dependency sequence",
          source: { kind: "dependency", ...modelSource }
        };
      }
      return {
        id: createUniqueNotebookCellId(cells, "sequence"),
        type: "sequence",
        title: "New sequence",
        source: { kind: "plantuml", source: "" }
      };
    }
  }
}

function createUniqueNotebookCellId(cells: NotebookCell[], base: string): string {
  const existingIds = new Set(cells.map((cell) => cell.id));
  if (!existingIds.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existingIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function resolveDefaultRunPeriods(cells: NotebookCell[], anchorCell: NotebookCell | undefined): number {
  if (anchorCell?.type === "run") {
    return anchorCell.periods;
  }
  return cells.find((cell): cell is RunCell => cell.type === "run")?.periods ?? 60;
}

function resolveDefaultRunCell(cells: NotebookCell[], anchorIndex: number): RunCell | null {
  const anchorCell = cells[anchorIndex];
  if (anchorCell?.type === "run") {
    return anchorCell;
  }
  if (
    (anchorCell?.type === "chart" || anchorCell?.type === "table" || anchorCell?.type === "matrix") &&
    anchorCell.sourceRunCellId
  ) {
    const sourceRun = cells.find(
      (cell): cell is RunCell => cell.type === "run" && cell.id === anchorCell.sourceRunCellId
    );
    if (sourceRun) {
      return sourceRun;
    }
  }
  return resolveNearestCell(cells, anchorIndex, (cell): cell is RunCell => cell.type === "run");
}

function resolveDefaultMatrixCell(cells: NotebookCell[], anchorIndex: number) {
  const anchorCell = cells[anchorIndex];
  if (anchorCell?.type === "matrix") {
    return anchorCell;
  }
  if (anchorCell?.type === "sequence" && anchorCell.source.kind === "matrix") {
    const source = anchorCell.source;
    const sourceMatrix = cells.find(
      (cell) => cell.type === "matrix" && cell.id === source.matrixCellId
    );
    if (sourceMatrix?.type === "matrix") {
      return sourceMatrix;
    }
  }
  return resolveNearestCell(cells, anchorIndex, (cell) => cell.type === "matrix");
}

function resolveDefaultModelSource(
  cells: NotebookCell[],
  anchorIndex: number
): { sourceModelCellId: string } | { sourceModelId: string } | null {
  const anchorCell = cells[anchorIndex];
  const fromAnchor = anchorCell ? resolveModelSourceFromCell(cells, anchorCell) : null;
  if (fromAnchor) {
    return fromAnchor;
  }

  const nearest = resolveNearestCell(cells, anchorIndex, (cell) => resolveModelSourceFromCell(cells, cell) != null);
  return nearest ? resolveModelSourceFromCell(cells, nearest) : null;
}

function resolveModelSourceFromCell(
  cells: NotebookCell[],
  cell: NotebookCell
): { sourceModelCellId: string } | { sourceModelId: string } | null {
  if (cell.type === "model") {
    return { sourceModelCellId: cell.id };
  }
  if (
    cell.type === "equations" ||
    cell.type === "solver" ||
    cell.type === "externals" ||
    cell.type === "initial-values"
  ) {
    return hasRunnableSectionModel(cells, cell.modelId) ? { sourceModelId: cell.modelId } : null;
  }
  if (cell.type === "run") {
    if (cell.sourceModelId && hasRunnableSectionModel(cells, cell.sourceModelId)) {
      return { sourceModelId: cell.sourceModelId };
    }
    if (cell.sourceModelCellId && cells.some((candidate) => candidate.type === "model" && candidate.id === cell.sourceModelCellId)) {
      return { sourceModelCellId: cell.sourceModelCellId };
    }
  }
  if (
    cell.type === "sequence" &&
    (cell.source.kind === "dependency" || cell.source.kind === "cld")
  ) {
    const source = cell.source;
    const modelId = source.modelId ?? source.sourceModelId;
    if (modelId && hasRunnableSectionModel(cells, modelId)) {
      return { sourceModelId: modelId };
    }
    if (source.sourceModelCellId && cells.some((candidate) => candidate.type === "model" && candidate.id === source.sourceModelCellId)) {
      return { sourceModelCellId: source.sourceModelCellId };
    }
  }
  return null;
}

function hasRunnableSectionModel(cells: NotebookCell[], modelId: string): boolean {
  return (
    cells.some((cell) => cell.type === "equations" && cell.modelId === modelId) &&
    cells.some((cell) => cell.type === "solver" && cell.modelId === modelId)
  );
}

function resolveDefaultVariablesForRun(cells: NotebookCell[], runCell: RunCell): string[] {
  const modelId = runCell.sourceModelId;
  if (modelId) {
    const equationsCell = cells.find(
      (cell) => cell.type === "equations" && cell.modelId === modelId
    );
    if (equationsCell?.type === "equations") {
      return equationsCell.equations
        .filter((equation): equation is EquationRow => !isRowComment(equation))
        .map((equation) => equation.name)
        .filter(Boolean);
    }
  }

  const modelCell = runCell.sourceModelCellId
    ? cells.find((cell) => cell.type === "model" && cell.id === runCell.sourceModelCellId)
    : null;
  return modelCell?.type === "model"
    ? modelCell.editor.equations
        .filter((equation): equation is EquationRow => !isRowComment(equation))
        .map((equation) => equation.name)
        .filter(Boolean)
    : [];
}

function resolveNearestCell<T extends NotebookCell>(
  cells: NotebookCell[],
  anchorIndex: number,
  predicate: (cell: NotebookCell) => cell is T
): T | null;
function resolveNearestCell(
  cells: NotebookCell[],
  anchorIndex: number,
  predicate: (cell: NotebookCell) => boolean
): NotebookCell | null;
function resolveNearestCell(
  cells: NotebookCell[],
  anchorIndex: number,
  predicate: (cell: NotebookCell) => boolean
): NotebookCell | null {
  for (let index = anchorIndex - 1; index >= 0; index -= 1) {
    if (predicate(cells[index])) {
      return cells[index];
    }
  }
  for (let index = anchorIndex + 1; index < cells.length; index += 1) {
    if (predicate(cells[index])) {
      return cells[index];
    }
  }
  return null;
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
  const scrollToCellRef = useRef<(cellId: string) => void>(() => {});
  const [mainColumnElement, setMainColumnElement] = useState<HTMLDivElement | null>(null);
  const initialNotebookRoute = useMemo(() => readNotebookRouteLocation(), []);
  const initialNotebookSession = useMemo(
    () => resolveInitialNotebookSession(initialNotebookRoute, window.location.hash),
    [initialNotebookRoute]
  );
  const [notebookJournal, setNotebookJournal] = useState<NotebookJournalState>(() => ({
    future: [],
    past: [],
    present: initialNotebookSession.document
  }));
  const notebookDocument = notebookJournal.present;
  const [activeVariantId, setActiveVariantId] = useState<string | null>(
    initialNotebookSession.activeVariantId
  );
  const [variantIndex, setVariantIndex] = useState<NotebookVariantIndexEntry[]>(() =>
    listNotebookVariants()
  );
  const [isVariantManagerOpen, setIsVariantManagerOpen] = useState(false);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [sourceFormat, setSourceFormat] = useState<NotebookSourceFormat>("yaml");
  const [importText, setImportText] = useState(() =>
    serializeNotebookSource(notebookDocument, sourceFormat)
  );
  const [committedImportText, setCommittedImportText] = useState(() =>
    serializeNotebookSource(notebookDocument, sourceFormat)
  );
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [isNotebookCommandTrayOpen, setIsNotebookCommandTrayOpen] = useState(false);
  const [isNotebookCommandTrayDismissed, setIsNotebookCommandTrayDismissed] = useState(false);
  const [autoRunRevision, setAutoRunRevision] = useState(0);
  const [activeEditorCellId, setActiveEditorCellId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(
    () => initialNotebookRoute.cellId
  );
  const [pinnedCellId, setPinnedCellId] = useState<string | null>(null);
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
  const [inspectorContext, setInspectorContext] = useState<VariableInspectRequest | null>(null);
  const [matrixGraphCharts, setMatrixGraphCharts] = useState<MatrixGraphChartEntry[]>([]);
  const [graphSliceHighlight, setGraphSliceHighlight] = useState<MatrixGraphSliceHighlight | null>(null);
  const [graphExpressionHighlight, setGraphExpressionHighlight] = useState<string | null>(null);
  const matrixGraphChartIdRef = useRef(0);
  const inspectorVariableHistory = useInspectorVariableHistory();
  const [parameterOverrides, setParameterOverrides] = useState<ConstantExternalOverrides>({});
  const parameterRunTimeoutRef = useRef<number | null>(null);
  const [importPreview, setImportPreview] = useState<{
    document: NotebookDocument;
    source: NotebookSourceFormat;
  } | null>(null);
  const handleRunError = useCallback((cellId: string, context?: { failurePeriodIndex?: number }) => {
    setPinnedCellId(cellId);
    if (context?.failurePeriodIndex != null) {
      setSelectedPeriodIndex(context.failurePeriodIndex);
    }
  }, []);
  const runner = useNotebookRunner(notebookDocument, {
    constantExternalOverrides: parameterOverrides,
    onRunError: handleRunError
  });
  const hasPendingParameterOverrides = useMemo(
    () => hasParameterOverrides(parameterOverrides),
    [parameterOverrides]
  );
  const latestHistoryUpdateRef = useRef(0);
  const notebookCommandTrayRef = useRef<HTMLElement | null>(null);
  const notebookCommandTrayToggleRef = useRef<HTMLButtonElement | null>(null);
  const assistantVariableDescriptions = useMemo(
    () => buildNotebookVariableDescriptions(notebookDocument.cells),
    [notebookDocument.cells]
  );
  const catalogVariableUnitMetadata = useMemo(
    () => buildNotebookVariableUnitMetadata(notebookDocument.cells),
    [notebookDocument.cells]
  );
  const catalogModelContexts = useMemo(
    () => listCatalogModelContexts(notebookDocument),
    [notebookDocument]
  );
  const catalogCurrentValuesByModel = useMemo(
    () =>
      buildCurrentValuesByModel({
        document: notebookDocument,
        getResult: (runCellId) => runner.getResult(runCellId),
        selectedPeriodIndex
      }),
    [notebookDocument, runner.outputs, selectedPeriodIndex]
  );
  const catalogRows = useMemo(() => {
    if (activeRailTab !== "variables") {
      return [];
    }

    return buildVariableCatalogRows({
      document: notebookDocument,
      currentValuesByModel: catalogCurrentValuesByModel
    });
  }, [activeRailTab, notebookDocument, catalogCurrentValuesByModel]);

  useEffect(() => {
    if (activeRailTab !== "graph") {
      setGraphSliceHighlight(null);
      setGraphExpressionHighlight(null);
    }
  }, [activeRailTab]);

  const handleGraphSliceHighlightChange = useCallback((slice: MatrixGraphSliceHighlight | null) => {
    setGraphSliceHighlight((current) =>
      matrixGraphSliceHighlightsEqual(current, slice) ? current : slice
    );
  }, []);

  const handleGraphExpressionHighlightChange = useCallback((expression: string | null) => {
    setGraphExpressionHighlight((current) => (current === expression ? current : expression));
  }, []);

  const scheduleParameterRun = useCallback(() => {
    if (parameterRunTimeoutRef.current != null) {
      window.clearTimeout(parameterRunTimeoutRef.current);
    }

    parameterRunTimeoutRef.current = window.setTimeout(() => {
      parameterRunTimeoutRef.current = null;
      void runner.runAll();
    }, 300);
  }, [runner]);

  useEffect(
    () => () => {
      if (parameterRunTimeoutRef.current != null) {
        window.clearTimeout(parameterRunTimeoutRef.current);
      }
    },
    []
  );

  const handleParameterOverrideChange = useCallback((modelId: string, name: string, value: number) => {
    setParameterOverrides((current) => ({
      ...current,
      [modelId]: {
        ...(current[modelId] ?? {}),
        [name]: value
      }
    }));
  }, []);

  const handleParameterOverrideRelease = useCallback(() => {
    scheduleParameterRun();
  }, [scheduleParameterRun]);

  const discardParameterOverrides = useCallback(() => {
    setParameterOverrides({});
    scheduleParameterRun();
  }, [scheduleParameterRun]);

  const inspectorModelId = useMemo(() => {
    const source = inspectorContext?.modelSource ?? null;
    const resolved = resolveInspectorModelSource(source ?? undefined);
    return resolved && "sourceModelId" in resolved ? resolved.sourceModelId : null;
  }, [inspectorContext?.modelSource]);

  const inspectorHasPendingParameterOverrides = useMemo(() => {
    if (!inspectorModelId) {
      return false;
    }

    const modelOverrides = parameterOverrides[inspectorModelId];
    return modelOverrides != null && Object.keys(modelOverrides).length > 0;
  }, [inspectorModelId, parameterOverrides]);
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
    const partialRunMaxPeriodIndex = resolvePartialRunMaxPeriodIndex({
      outputs: runner.outputs,
      status: runner.status
    });

    if (partialRunMaxPeriodIndex != null) {
      return partialRunMaxPeriodIndex;
    }

    return Math.max(configuredMaxPeriodIndex, outputMaxPeriodIndex);
  }, [notebookDocument, runner.outputs, runner.status]);
  const inspectorCurrentValues = useMemo(
    () =>
      inspectorContext
        ? buildInspectorCurrentValues({
            document: notebookDocument,
            getResult: (runCellId) => runner.getResult(runCellId),
            modelSource: inspectorContext.modelSource,
            selectedPeriodIndex
          })
        : {},
    [
      inspectorContext,
      inspectorContext?.sourceRunCellId,
      notebookDocument.cells,
      runner.outputs,
      selectedPeriodIndex
    ]
  );
  const inspectorLaggedCurrentValues = useMemo(
    () =>
      inspectorContext?.modelSource
        ? buildModelLaggedCurrentValues({
            document: notebookDocument,
            getResult: (runCellId) => runner.getResult(runCellId),
            modelRef: inspectorContext.modelSource,
            selectedPeriodIndex
          })
        : {},
    [
      inspectorContext?.modelSource,
      notebookDocument.cells,
      runner.outputs,
      selectedPeriodIndex
    ]
  );
  const inspectorLaggedPeriodLabel =
    selectedPeriodIndex > 0 ? `period ${selectedPeriodIndex}` : undefined;
  const selectedVariableData = inspectorContext
    ? buildVariableInspectorData({
        currentValues: inspectorCurrentValues,
        editor: inspectorContext.editor,
        notebookCells: notebookDocument.cells,
        selectedVariable: inspectorContext.selectedVariable,
        variableDescriptions: inspectorContext.variableDescriptions,
        variableUnitMetadata: inspectorContext.variableUnitMetadata
      })
    : null;
  const inspectorSeriesValues = useMemo(() => {
    if (!inspectorContext || !selectedVariableData) {
      return undefined;
    }

    return buildInspectorSeriesValues({
      document: notebookDocument,
      getResult: (runCellId) => runner.getResult(runCellId),
      modelSource: inspectorContext.modelSource,
      variableName: selectedVariableData.name
    });
  }, [
    inspectorContext,
    notebookDocument,
    runner.outputs,
    selectedVariableData?.name
  ]);
  const stabilityTarget = useMemo(
    () =>
      resolveNotebookStabilityTarget({
        document: notebookDocument,
        getResult: (runCellId) => runner.getResult(runCellId),
        inspectorContext
      }),
    [notebookDocument, inspectorContext, runner.outputs]
  );
  const [stabilityEnabled, setStabilityEnabled] = useState(false);
  const [showStabilityRawPanel, setShowStabilityRawPanel] = useState(false);
  const stabilityTargetKey = stabilityTarget ? stabilityTargetCacheKey(stabilityTarget) : null;
  const stabilityAnalysisEnabled = stabilityEnabled || showStabilityRawPanel;
  useEffect(() => {
    setStabilityEnabled(false);
    setShowStabilityRawPanel(false);
  }, [stabilityTargetKey]);
  const { display: stabilityDisplay, isComputing: stabilityIsComputing } = useStabilityMetrics(
    stabilityTarget,
    selectedPeriodIndex,
    {
      enabled: stabilityAnalysisEnabled,
      debounceMs: showStabilityRawPanel ? STABILITY_RAW_PANEL_DEBOUNCE_MS : 0
    }
  );
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
  useNotebookStickySurfaceTop(mainColumnElement);
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
  const currentTemplateId = useMemo(
    () => resolveCurrentTemplateId(notebookDocument),
    [notebookDocument]
  );
  const notebookScopeId = useMemo(
    () =>
      resolveNotebookScopeId({
        activeVariantId,
        document: notebookDocument,
        currentTemplateId
      }),
    [activeVariantId, currentTemplateId, notebookDocument]
  );
  const syncNotebookLocation = useCallback(
    (cellId?: string | null) => {
      if (activeVariantId) {
        writeNotebookVariantHash(activeVariantId, cellId ?? undefined);
        return;
      }

      const templateId =
        currentTemplateId || resolveNotebookTemplateIdFromLocation(readNotebookRouteLocation());
      writeNotebookLocation({
        templateId: templateId || undefined,
        cellId: cellId ?? undefined
      });
    },
    [activeVariantId, currentTemplateId]
  );
  const selectNotebookCell = useCallback((cellId: string | null) => {
    setSelectedCellId(cellId);
  }, []);
  const handlePinCellRequest = useCallback((cellId: string) => {
    setPinnedCellId((current) => (current === cellId ? null : cellId));
  }, []);
  const setNotebookCellUrl = useCallback(
    (cellId: string) => {
      syncNotebookLocation(cellId);
      const cell = notebookDocument.cells.find((candidate) => candidate.id === cellId);
      setUiMessage(cell ? `Updated URL for ${cell.title}.` : "Updated section URL.");
    },
    [notebookDocument.cells, syncNotebookLocation]
  );
  const applyNotebookCellFromRoute = useCallback(
    (cellId: string) => {
      if (!notebookDocument.cells.some((cell) => cell.id === cellId)) {
        return;
      }

      setSelectedCellId(cellId);

      let attempts = 0;
      const tryScroll = () => {
        scrollToCellRef.current(cellId);
        const cell = document.getElementById(cellId);
        if (!cell || attempts >= 12) {
          return;
        }

        attempts += 1;
        const hasSequenceView = cell.querySelector(".sequence-viewer") != null;
        if (!hasSequenceView || cell.getBoundingClientRect().height < 40) {
          requestAnimationFrame(tryScroll);
        }
      };

      requestAnimationFrame(tryScroll);
    },
    [notebookDocument.cells]
  );
  const nextUndoEntry = notebookJournal.past.at(-1);
  const nextUndoLabel = nextUndoEntry?.label;
  const nextRedoLabel = notebookJournal.future[0]?.label;

  const commitNotebookDocument = useCallback(
    (
      label: string,
      updater: NotebookDocument | ((current: NotebookDocument) => NotebookDocument),
      options: { messageId?: string } = {}
    ) => {
      setNotebookJournal((current) => {
        const nextDocument =
          typeof updater === "function" ? updater(current.present) : updater;
        if (nextDocument === current.present) {
          return current;
        }

        return {
          future: [],
          past: limitNotebookHistory([
            ...current.past,
            {
              document: current.present,
              label,
              messageId: options.messageId
            }
          ]),
          present: nextDocument
        };
      });
    },
    []
  );

  const applyParameterOverrides = useCallback(() => {
    if (!hasParameterOverrides(parameterOverrides)) {
      return;
    }

    commitNotebookDocument("parameter apply", (current) => ({
      ...current,
      cells: current.cells.map((cell) => {
        if (cell.type !== "externals") {
          return cell;
        }

        const modelOverrides = parameterOverrides[cell.modelId];
        if (!modelOverrides || Object.keys(modelOverrides).length === 0) {
          return cell;
        }

        return {
          ...cell,
          externals: cell.externals.map((external) => {
            if (isRowComment(external)) {
              return external;
            }
            const name = external.name.trim();
            if (external.kind !== "constant" || !(name in modelOverrides)) {
              return external;
            }

            return {
              ...external,
              valueText: String(modelOverrides[name])
            };
          })
        };
      })
    }));
    setParameterOverrides({});
    setAutoRunRevision((revision) => revision + 1);
  }, [commitNotebookDocument, parameterOverrides]);

  const handleUndoNotebookEdit = useCallback(
    (fallbackMessageId?: string) => {
      setNotebookJournal((current) => {
        const previousEntry = current.past.at(-1);
        if (!previousEntry) {
          return current;
        }

        const messageId = previousEntry.messageId ?? fallbackMessageId;
        if (messageId) {
          setAssistantMessages((messages) =>
            rearmNotebookAssistantMessagePatchAfterUndo(
              messages,
              previousEntry.document,
              messageId
            )
          );
        }
        setSelectedPeriodIndex(0);
        setAutoRunRevision((revision) => revision + 1);
        setUiMessage(`Undid ${previousEntry.label}.`);

        return {
          future: [
            {
              document: current.present,
              label: previousEntry.label,
              messageId: previousEntry.messageId
            },
            ...current.future
          ],
          past: current.past.slice(0, -1),
          present: previousEntry.document
        };
      });
    },
    []
  );

  const handleRedoNotebookEdit = useCallback(() => {
    setNotebookJournal((current) => {
      const nextEntry = current.future[0];
      if (!nextEntry) {
        return current;
      }

      if (nextEntry.messageId) {
        setAssistantMessages((messages) =>
          messages.map((message) =>
            message.id === nextEntry.messageId && message.patch
              ? {
                  ...message,
                  patch: {
                    ...message.patch,
                    status: "applied"
                  }
                }
              : message
          )
        );
      }
      setSelectedPeriodIndex(0);
      setAutoRunRevision((revision) => revision + 1);
      setUiMessage(`Redid ${nextEntry.label}.`);

      return {
        future: current.future.slice(1),
        past: limitNotebookHistory([
          ...current.past,
          {
            document: current.present,
            label: nextEntry.label,
            messageId: nextEntry.messageId
          }
        ]),
        present: nextEntry.document
      };
    });
  }, []);

  const refreshVariantIndex = useCallback(() => {
    setVariantIndex(listNotebookVariants());
  }, []);

  useEffect(() => {
    if (!activeVariantId) {
      return;
    }

    const savedNotebook = saveNotebookVariantDocument(activeVariantId, notebookDocument);
    if (savedNotebook) {
      refreshVariantIndex();
    }
  }, [activeVariantId, notebookDocument, refreshVariantIndex]);

  useEffect(() => {
    setSelectedPeriodIndex((current) => Math.min(current, maxResultPeriodIndex));
  }, [maxResultPeriodIndex]);

  useEffect(() => {
    if (!isNotebookCommandTrayOpen) {
      return;
    }

    function handleCommandTrayOutsidePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (notebookCommandTrayRef.current?.contains(target)) {
        return;
      }

      if (notebookCommandTrayToggleRef.current?.contains(target)) {
        return;
      }

      setIsNotebookCommandTrayOpen(false);
      setIsNotebookCommandTrayDismissed(true);
    }

    document.addEventListener("pointerdown", handleCommandTrayOutsidePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handleCommandTrayOutsidePointerDown, true);
    };
  }, [isNotebookCommandTrayOpen]);

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
    function handleNotebookHistoryShortcut(event: KeyboardEvent): void {
      const key = event.key.toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (key !== "z" && key !== "y")) {
        return;
      }
      if (isNotebookHistoryShortcutEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey || key === "y") {
        handleRedoNotebookEdit();
        return;
      }
      handleUndoNotebookEdit();
    }

    window.addEventListener("keydown", handleNotebookHistoryShortcut);
    return () => window.removeEventListener("keydown", handleNotebookHistoryShortcut);
  }, [handleRedoNotebookEdit, handleUndoNotebookEdit]);

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
      selectNotebookCell(activeEditorCellId);
    }
  }, [activeEditorCellId, selectNotebookCell]);

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
    const previousCell = notebookDocument.cells.find((cell) => cell.id === cellId);
    const nextCell = previousCell ? updater(previousCell) : null;

    commitNotebookDocument("cell edit", (current) => ({
      ...current,
      cells: current.cells.map((cell) => (cell.id === cellId ? updater(cell) : cell))
    }));

    if (nextCell?.type === "externals") {
      setParameterOverrides((current) => {
        if (!(nextCell.modelId in current)) {
          return current;
        }

        const { [nextCell.modelId]: _removed, ...rest } = current;
        return rest;
      });
    }
  }

  function replaceCells(nextCells: NotebookCell[]): void {
    commitNotebookDocument("cell reorder", (current) => ({
      ...current,
      cells: nextCells
    }));
  }

  function deleteCell(cellId: string): void {
    const cellIndex = notebookDocument.cells.findIndex((cell) => cell.id === cellId);
    if (cellIndex < 0) {
      return;
    }

    const nextCells = notebookDocument.cells.filter((cell) => cell.id !== cellId);
    const fallbackCell = nextCells[Math.min(cellIndex, nextCells.length - 1)] ?? null;

    commitNotebookDocument("cell delete", (current) => ({
      ...current,
      cells: current.cells.filter((cell) => cell.id !== cellId)
    }));
    if (selectedCellId === cellId) {
      selectNotebookCell(fallbackCell?.id ?? null);
    }
    if (activeEditorCellId === cellId) {
      setActiveEditorCellId(null);
    }
  }

  function moveCell(cellId: string, direction: -1 | 1): void {
    commitNotebookDocument("cell move", (current) => {
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
    selectNotebookCell(cellId);
  }

  function insertCell(
    anchorCellId: string,
    placement: "above" | "below",
    type: NotebookCellInsertType
  ): void {
    const anchorIndex = notebookDocument.cells.findIndex((cell) => cell.id === anchorCellId);
    if (anchorIndex < 0) {
      return;
    }

    const nextCell = createNotebookCellForInsert(notebookDocument.cells, anchorIndex, type);
    if (!nextCell) {
      setUiMessage(`Add a ${type === "run" ? "model" : "run"} cell before creating this cell type.`);
      return;
    }

    const insertIndex = placement === "above" ? anchorIndex : anchorIndex + 1;
    commitNotebookDocument("cell insert", (current) => ({
      ...current,
      cells: [
        ...current.cells.slice(0, insertIndex),
        nextCell,
        ...current.cells.slice(insertIndex)
      ]
    }));
    selectNotebookCell(nextCell.id);
  }

  function handleVariableInspectRequest(args: VariableInspectRequest): void {
    const sourceRunCellId =
      resolvePreferredInspectorRunCell(notebookDocument, args.modelSource)?.id ??
      args.sourceRunCellId ??
      resolveInspectorRunCell(notebookDocument.cells, args.modelSource, null)?.id ??
      null;
    const request: VariableInspectRequest = { ...args, sourceRunCellId };

    if (isSameInspectorContext(inspectorContext, request)) {
      inspectorVariableHistory.push(request.selectedVariable);
    } else {
      inspectorVariableHistory.reset(request.selectedVariable);
    }
    setInspectorContext(request);
    setActiveRailTab("inspect");
  }

  function handleMatrixGraphRequest(request: MatrixGraphRequest): void {
    setMatrixGraphCharts((current) =>
      applyMatrixGraphRequest(current, request, () => {
        matrixGraphChartIdRef.current += 1;
        return `matrix-graph-${matrixGraphChartIdRef.current}`;
      })
    );
    setActiveRailTab("graph");
  }

  function handleToggleMatrixGraphChartPin(chartId: string): void {
    setMatrixGraphCharts((current) => toggleMatrixGraphChartPin(current, chartId));
  }

  function handleToggleMatrixGraphChartLegendMode(chartId: string): void {
    setMatrixGraphCharts((current) => toggleMatrixGraphChartLegendMode(current, chartId));
  }

  function handleDismissMatrixGraphChart(chartId: string): void {
    setMatrixGraphCharts((current) => removeMatrixGraphChart(current, chartId));
  }

  function handleAddMatrixGraphChartSeries(chartId: string, source: string): void {
    setMatrixGraphCharts((charts) => {
      const chart = charts.find((entry) => entry.id === chartId);
      if (!chart) {
        return charts;
      }

      const matrixCell = notebookDocument.cells.find(
        (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === chart.matrixCellId
      );
      const result = runner.getResult(chart.sourceRunCellId);
      if (!matrixCell || !result) {
        return charts;
      }

      const sliceEntry = collectMatrixGraphSliceSeries(matrixCell, chart.kind, chart.index, result).find(
        (entry) => entry.source === source
      );
      if (!sliceEntry) {
        return charts;
      }

      return addMatrixGraphChartSeries(charts, chartId, sliceEntry);
    });
  }

  function handleRemoveMatrixGraphChartSeries(chartId: string, source: string): void {
    setMatrixGraphCharts((current) => removeMatrixGraphChartSeries(current, chartId, source));
  }

  function handleCatalogRowSelect(row: VariableCatalogRow): void {
    const currentValues =
      buildCurrentValuesByModel({
        document: notebookDocument,
        getResult: (runCellId) => runner.getResult(runCellId),
        selectedPeriodIndex
      }).get(row.modelId) ?? getCurrentValueMapForModelRef({
        sourceModelId: row.modelId
      });

    const request = buildVariableInspectRequestFromCatalogRow({
      currentValues,
      document: notebookDocument,
      row
    });
    if (!request) {
      return;
    }

    handleVariableInspectRequest(request);
  }

  function handleInspectorGoBack(): void {
    const variableName = inspectorVariableHistory.goBack();
    if (!variableName) {
      return;
    }

    setInspectorContext((current) =>
      current ? { ...current, selectedVariable: variableName } : current
    );
  }

  function handleInspectorGoForward(): void {
    const variableName = inspectorVariableHistory.goForward();
    if (!variableName) {
      return;
    }

    setInspectorContext((current) =>
      current ? { ...current, selectedVariable: variableName } : current
    );
  }

  function handleInspectorDefiningExpressionApply(expression: string): void {
    const context = inspectorContext;
    const definingEquation = selectedVariableData?.definingEquation;
    if (!context || !definingEquation) {
      return;
    }

    const nextEditor = updateEditorDefiningEquationExpression(
      context.editor,
      definingEquation.id,
      expression
    );

    if (context.modelSource) {
      commitNotebookDocument("inspector equation edit", (current) =>
        applyInspectorDefiningEquationExpression(
          current,
          context.modelSource!,
          definingEquation.id,
          expression
        )
      );
      setAutoRunRevision((current) => current + 1);
    }

    setInspectorContext({
      ...context,
      editor: nextEditor,
      variableDescriptions: buildVariableDescriptions({
        equations: nextEditor.equations,
        externals: nextEditor.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: nextEditor.equations,
        externals: nextEditor.externals
      })
    });
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
    selectNotebookCell(args.cellId);
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

  function replaceNotebookDocument(
    nextDocument: NotebookDocument,
    label = "notebook change",
    messageId?: string
  ): void {
    commitNotebookDocument(label, nextDocument, { messageId });
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

    replaceNotebookDocument(result.document, "assistant patch");
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
    if (
      nextUndoEntry?.label !== "assistant patch" ||
      (messageId && nextUndoEntry.messageId !== messageId)
    ) {
      setUiMessage("No applied assistant patch is next in the undo history.");
      return;
    }
    handleUndoNotebookEdit(messageId);
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

    replaceNotebookDocument(result.document, "assistant patch", messageId);
    setUiMessage("Applied inline assistant patch.");
  }

  function replaceNotebookDocumentFromTemplate(templateId: NotebookTemplateId): void {
    replaceNotebookDocument(createNotebookFromTemplate(templateId), "template load");
  }

  function loadNotebookVariant(variantId: string, label = "variant load"): boolean {
    const variantDocument = loadNotebookVariantDocument(variantId);
    if (!variantDocument) {
      setUiMessage("Saved variant could not be loaded.");
      refreshVariantIndex();
      return false;
    }

    replaceNotebookDocument(variantDocument, label);
    setActiveVariantId(variantId);
    writeNotebookVariantHash(variantId);
    setImportPreview(null);
    return true;
  }

  function resolveDerivedFromForCurrentNotebook(): NotebookTemplateId | null {
    return resolveNotebookDerivedFrom(notebookDocument, activeVariantId, currentTemplateId);
  }

  function handleOpenVariant(variantId: string): void {
    if (loadNotebookVariant(variantId)) {
      const entry = listNotebookVariants().find((variant) => variant.id === variantId);
      setUiMessage(`Loaded variant ${entry?.title ?? variantId}.`);
      setIsVariantManagerOpen(false);
    }
  }

  function handleCreateVariantFromTemplate(templateId: NotebookTemplateId, title: string): void {
    const entry = createNotebookVariantFromTemplate(templateId, title);
    if (!entry) {
      setUiMessage("Could not create variant. Browser storage may be full.");
      return;
    }

    refreshVariantIndex();
    if (loadNotebookVariant(entry.id, "variant create")) {
      setUiMessage(`Created variant ${entry.title}.`);
      setIsVariantManagerOpen(false);
    }
  }

  function handleCreateVariantFromCurrent(title: string): void {
    const entry = createNotebookVariantFromDocument(notebookDocument, {
      derivedFrom: resolveDerivedFromForCurrentNotebook() ?? undefined,
      title
    });
    if (!entry) {
      setUiMessage("Could not save variant. Browser storage may be full.");
      return;
    }

    refreshVariantIndex();
    if (loadNotebookVariant(entry.id, "variant save")) {
      setUiMessage(`Saved variant ${entry.title}.`);
      setIsVariantManagerOpen(false);
    }
  }

  function handleRenameVariant(variantId: string, title: string): void {
    if (!renameNotebookVariant(variantId, title)) {
      setUiMessage("Could not rename variant.");
      return;
    }

    refreshVariantIndex();
    if (activeVariantId === variantId) {
      setNotebookJournal((current) => ({
        ...current,
        present: {
          ...current.present,
          title: title.trim()
        }
      }));
    }
    setUiMessage(`Renamed variant to ${title.trim()}.`);
  }

  function handleDeleteVariant(variantId: string): void {
    const entry = listNotebookVariants().find((variant) => variant.id === variantId);
    removeNotebookVariant(variantId);
    refreshVariantIndex();

    if (activeVariantId !== variantId) {
      setUiMessage(entry ? `Deleted variant ${entry.title}.` : "Deleted variant.");
      return;
    }

    setActiveVariantId(null);
    const fallbackTemplateId =
      entry?.derivedFrom ?? resolveNotebookTemplateIdFromLocation(readNotebookRouteLocation());
    replaceNotebookDocumentFromTemplate(fallbackTemplateId);
    writeNotebookLocation({ templateId: fallbackTemplateId });
    setImportPreview(null);
    setUiMessage(
      entry
        ? `Deleted variant ${entry.title} and loaded ${NOTEBOOK_TEMPLATES[fallbackTemplateId].label}.`
        : "Deleted variant."
    );
    setIsVariantManagerOpen(false);
  }

  function activateImportedNotebookVariant(document: NotebookDocument): void {
    const entry = upsertImportedNotebookVariant(document);
    if (!entry) {
      setUiMessage("Could not save imported notebook to browser storage.");
      return;
    }

    refreshVariantIndex();
    setActiveVariantId(entry.id);
    writeNotebookVariantHash(entry.id);
  }

  useEffect(() => {
    migrateNotebookHashToPathname();
  }, []);

  useEffect(() => {
    function handleNotebookRouteChange(): void {
      const location = readNotebookRouteLocation();
      const { cellId, templateId, variantId } = location;
      const hash = window.location.hash;

      if (variantId) {
        if (variantId === activeVariantId && notebookDocument.id === variantId) {
          if (cellId) {
            applyNotebookCellFromRoute(cellId);
          }
          return;
        }
        if (loadNotebookVariant(variantId, "variant route load")) {
          const entry = listNotebookVariants().find((variant) => variant.id === variantId);
          setUiMessage(`Loaded variant ${entry?.title ?? variantId}.`);
        }
        return;
      }

      if (hash === LEGACY_CUSTOM_NOTEBOOK_HASH) {
        const imported = loadNotebookVariantDocument(IMPORTED_NOTEBOOK_VARIANT_ID);
        if (!imported) {
          setUiMessage("No imported notebook variant found.");
          return;
        }
        if (activeVariantId === IMPORTED_NOTEBOOK_VARIANT_ID && notebookDocument.id === imported.id) {
          if (cellId) {
            applyNotebookCellFromRoute(cellId);
          }
          return;
        }
        loadNotebookVariant(IMPORTED_NOTEBOOK_VARIANT_ID, "imported notebook load");
        setUiMessage(`Loaded ${imported.title}.`);
        return;
      }

      if (!templateId) {
        if (cellId) {
          applyNotebookCellFromRoute(cellId);
        }
        return;
      }
      if (activeVariantId == null && notebookDocument.metadata.template === templateId && currentTemplateId) {
        if (cellId) {
          applyNotebookCellFromRoute(cellId);
        }
        return;
      }
      setActiveVariantId(null);
      replaceNotebookDocumentFromTemplate(templateId);
      setImportPreview(null);
      setUiMessage(`Loaded template ${NOTEBOOK_TEMPLATES[templateId].label}.`);
    }

    window.addEventListener("hashchange", handleNotebookRouteChange);
    window.addEventListener("popstate", handleNotebookRouteChange);
    return () => {
      window.removeEventListener("hashchange", handleNotebookRouteChange);
      window.removeEventListener("popstate", handleNotebookRouteChange);
    };
  }, [
    activeVariantId,
    applyNotebookCellFromRoute,
    currentTemplateId,
    notebookDocument.id,
    notebookDocument.metadata.template
  ]);

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
      replaceNotebookDocument(parsed.document, "source import");
      const templateId = resolveCurrentTemplateId(parsed.document);
      if (templateId) {
        setActiveVariantId(null);
        writeNotebookLocation({ templateId });
      } else {
        activateImportedNotebookVariant(parsed.document);
      }
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
        writeNotebookLocation({});
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
    replaceNotebookDocument(importPreview.document, "source import");
    const templateId = resolveCurrentTemplateId(importPreview.document);
    if (templateId) {
      setActiveVariantId(null);
      writeNotebookLocation({ templateId });
    } else {
      activateImportedNotebookVariant(importPreview.document);
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

  function handleNotebookPickerChange(value: string): void {
    if (value === UNNAMED_NOTEBOOK_SELECT_VALUE) {
      return;
    }

    if (isNotebookTemplateId(value)) {
      setActiveVariantId(null);
      replaceNotebookDocumentFromTemplate(value);
      writeNotebookLocation({ templateId: value });
      setImportPreview(null);
      setUiMessage(`Loaded template ${NOTEBOOK_TEMPLATES[value].label}.`);
      return;
    }

    if (isNotebookVariantId(value)) {
      handleOpenVariant(value);
    }
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

      const preferredToolRequests = preferMatrixLookupForMatrixEditQuestion(
        activeAssistantMode,
        question,
        toolRequestExtraction.requests
      );
      if (preferredToolRequests !== toolRequestExtraction.requests) {
        appendAssistantDebugEvent({
          detail: {
            from: toolRequestExtraction.requests,
            to: preferredToolRequests
          },
          label: "Rewrote matrix edit lookup to getMatrix",
          turnId,
          type: "tool:extracted"
        });
      }

      const modeFilteredRequests = filterNotebookAssistantToolRequestsForMode(activeAssistantMode, preferredToolRequests);
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
      const followupMessages: NotebookAssistantMessage[] = [
        ...assistantMessages.slice(-6),
        userMessage,
        {
          id: assistantMessageId,
          role: "assistant",
          text: firstAnswer
        }
      ];
      let resolvedFinalAnswer = finalAnswer;
      let resolvedToolSummary = toolSummary;

      for (let followupRound = 0; followupRound < 2; followupRound += 1) {
        const followupToolRequestExtraction = extractNotebookAssistantToolRequests(resolvedFinalAnswer);
        appendAssistantDebugEvent({
          detail: followupToolRequestExtraction,
          label: followupToolRequestExtraction.error
            ? "Tool request extraction failed"
            : `Extracted ${followupToolRequestExtraction.requests.length} tool request${followupToolRequestExtraction.requests.length === 1 ? "" : "s"}`,
          turnId,
          type: "tool:extracted"
        });
        if (followupToolRequestExtraction.error) {
          setAssistantMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    text: followupToolRequestExtraction.error ?? "Assistant requested notebook tools, but the request could not be parsed."
                  }
                : message
            )
          );
          return;
        }

        if (followupToolRequestExtraction.requests.length === 0) {
          break;
        }

        const followupModeFilteredRequests = filterNotebookAssistantToolRequestsForMode(
          activeAssistantMode,
          followupToolRequestExtraction.requests
        );
        if (followupModeFilteredRequests.blocked.length > 0) {
          appendAssistantDebugEvent({
            detail: { blocked: followupModeFilteredRequests.blocked, mode: activeAssistantMode },
            label: `Blocked ${followupModeFilteredRequests.blocked.length} tool request${followupModeFilteredRequests.blocked.length === 1 ? "" : "s"}`,
            turnId,
            type: "tool:blocked"
          });
        }
        if (followupModeFilteredRequests.allowed.length === 0 && followupModeFilteredRequests.blocked.length > 0) {
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

        const followupToolRequests = followupModeFilteredRequests.allowed.slice(0, NOTEBOOK_ASSISTANT_MAX_TOOL_REQUESTS_PER_ROUND);
        const followupToolDispatch = dispatchNotebookAssistantToolRequests(buildNotebookAssistantSnapshot(), followupToolRequests);
        const followupToolResults = followupToolDispatch.toolResults;
        const followupProposedPatch = followupToolDispatch.proposedPatch ?? getPatchFromNotebookAssistantToolResults(followupToolResults, followupToolRequests);
        appendAssistantDebugEvent({
          detail: { requests: followupToolRequests, results: followupToolResults },
          label: `Ran ${followupToolResults.length} assistant tool${followupToolResults.length === 1 ? "" : "s"}`,
          turnId,
          type: "tool:result"
        });
        if (followupProposedPatch) {
          appendAssistantDebugEvent({
            detail: followupProposedPatch,
            label: `Prepared patch with ${followupProposedPatch.operations.length} operation${followupProposedPatch.operations.length === 1 ? "" : "s"}`,
            turnId,
            type: "patch:proposed"
          });
          setNotebookAssistantMessagePatch(setAssistantMessages, assistantMessageId, followupProposedPatch, notebookDocument);
        }

        const localFollowupToolResultAnswer = activeAssistantMode === "edit"
          ? buildNotebookAssistantLocalToolResultAnswer({ proposedPatch: followupProposedPatch, toolResults: followupToolResults })
          : null;
        if (localFollowupToolResultAnswer) {
          appendAssistantDebugEvent({
            detail: { reason: "successful follow-up edit tool patch", toolResultCount: followupToolResults.length },
            label: "Skipped follow-up assistant request",
            phase: "followup",
            turnId,
            type: "request:skipped"
          });
          setNotebookAssistantMessageText(setAssistantMessages, assistantMessageId, localFollowupToolResultAnswer);
          return;
        }

        if (followupRound === 1) {
          setNotebookAssistantMessageText(
            setAssistantMessages,
            assistantMessageId,
            "The notebook assistant needed more notebook tool lookups than this turn allows. Try again with the specific matrix, chart, run, or variable name included."
          );
          return;
        }

        resolvedToolSummary = summarizeNotebookAssistantToolResults(followupToolResults);
        followupMessages.push({
          id: `${assistantMessageId}-followup-${followupRound + 1}`,
          role: "assistant",
          text: resolvedFinalAnswer
        });
        setAssistantMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text: `${resolvedToolSummary} Preparing answer...`
                }
              : message
          )
        );

        streamedText = "";
        let nestedFollowupStreamDeltaLogged = false;
        const nestedFollowupContext = buildNotebookAssistantToolResultContext({
          assistantMode: activeAssistantMode,
          document: notebookDocument,
          resultCount,
          selectedPeriodIndex,
          selectedVariable: inspectorContext?.selectedVariable,
          toolResults: followupToolResults,
          uiMessage
        });
        appendAssistantDebugEvent({
          detail: {
            contextChars: nestedFollowupContext.length,
            resultCount,
            selectedPeriodIndex,
            selectedVariable: inspectorContext?.selectedVariable ?? null,
            toolResultCount: followupToolResults.length
          },
          label: `Built follow-up context (${nestedFollowupContext.length} chars)`,
          phase: "followup",
          turnId,
          type: "context:built"
        });
        appendAssistantDebugEvent({
          detail: {
            messageCount: followupMessages.length,
            model: assistantModel,
            toolResultCount: followupToolResults.length
          },
          label: "Sent follow-up assistant request",
          phase: "followup",
          turnId,
          type: "request:start"
        });
        const nestedFollowupAnswerResult = await requestNotebookAssistantAnswer({
          betaPassword: assistantBetaPassword,
          context: nestedFollowupContext,
          messages: followupMessages,
          model: assistantModel,
          onTextDelta: (delta) => {
            streamedText += delta;
            if (!nestedFollowupStreamDeltaLogged) {
              nestedFollowupStreamDeltaLogged = true;
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
                message.id === assistantMessageId ? { ...message, text: `${resolvedToolSummary}\n\n${streamedText}` } : message
              )
            );
          },
          question: buildNotebookAssistantToolFollowupQuestion({
            originalQuestion: question,
            toolResults: followupToolResults
          })
        });
        if (nestedFollowupAnswerResult.usage) {
          turnUsage = mergeAssistantTokenUsage(turnUsage, nestedFollowupAnswerResult.usage);
          if (turnUsage) {
            setUiMessage(formatAssistantTokenUsage(turnUsage, assistantModel));
          }
        }
        resolvedFinalAnswer = nestedFollowupAnswerResult.text;
        appendAssistantDebugEvent({
          detail: { chars: resolvedFinalAnswer.length, text: resolvedFinalAnswer },
          label: `Received follow-up assistant response (${resolvedFinalAnswer.length} chars)`,
          phase: "followup",
          turnId,
          type: "response:received"
        });
      }

      const directPatch = activeAssistantMode === "edit"
        ? extractNotebookPatchProposal({ document: notebookDocument, question, text: resolvedFinalAnswer })
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
        ? extractTextChartVariablesToolRequest(notebookDocument, `${question}\n${resolvedFinalAnswer}`)
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
    return buildModelCurrentValues({
      document: notebookDocument,
      getResult: (runCellId) => runner.getResult(runCellId),
      modelRef: ref,
      selectedPeriodIndex
    });
  }

  function getLaggedValueMapForModelRef(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined> {
    return buildModelLaggedCurrentValues({
      document: notebookDocument,
      getResult: (runCellId) => runner.getResult(runCellId),
      modelRef: ref,
      selectedPeriodIndex
    });
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

      const nextTop = Math.max(targetTop, 0);
      if (typeof mainColumn.scrollTo === "function") {
        mainColumn.scrollTo({
          behavior: "smooth",
          top: nextTop
        });
      } else {
        mainColumn.scrollTop = nextTop;
      }
      return;
    }

    const targetTop =
      window.scrollY + cell.getBoundingClientRect().top - scrubberHeight - extraOffset;
    const nextTop = Math.max(targetTop, 0);

    if (typeof window.scrollTo === "function") {
      window.scrollTo({
        behavior: "smooth",
        top: nextTop
      });
    } else {
      window.scrollY = nextTop;
    }
  }
  scrollToCellRef.current = scrollToCell;

  useEffect(() => {
    if (pinnedCellId && !notebookDocument.cells.some((cell) => cell.id === pinnedCellId)) {
      setPinnedCellId(null);
    }
  }, [notebookDocument.cells, pinnedCellId]);

  const pinnedCell = useMemo(
    () =>
      pinnedCellId
        ? notebookDocument.cells.find((cell) => cell.id === pinnedCellId) ?? null
        : null,
    [notebookDocument.cells, pinnedCellId]
  );

  const buildNotebookCellViewProps = useCallback(
    (cell: (typeof notebookDocument.cells)[number], overrides: Partial<NotebookCellViewProps> = {}) =>
      ({
        activeEditorCellId,
        cell,
        cells: notebookDocument.cells,
        notebookScopeId,
        getModelCurrentValues: getCurrentValueMapForModelRef,
        getModelLaggedCurrentValues: getLaggedValueMapForModelRef,
        maxPeriodIndex: maxResultPeriodIndex,
        onPinCellRequest: handlePinCellRequest,
        onSelectedCellIdChange: selectNotebookCell,
        onSetCellUrl: setNotebookCellUrl,
        onSelectedPeriodIndexChange: setSelectedPeriodIndex,
        runner,
        onActiveEditorCellIdChange: setActiveEditorCellId,
        onDeleteCell: deleteCell,
        onInsertCell: insertCell,
        onMoveCell: moveCell,
        onModelChange: updateModelCell,
        onCellChange: updateCell,
        onReplaceCells: replaceCells,
        onCellHelpRequest: handleCellHelpRequest,
        onMatrixGraphRequest: handleMatrixGraphRequest,
        onVariableInspectRequest: handleVariableInspectRequest,
        highlightedVariable:
          cell.id === graphSliceHighlight?.matrixCellId
            ? graphExpressionHighlight
            : inspectorContext?.selectedVariable ?? null,
        graphSliceHighlight:
          cell.id === graphSliceHighlight?.matrixCellId ? graphSliceHighlight : null,
        selectedCellId,
        selectedPeriodIndex,
        viewportRoot: mainColumnElement,
        ...overrides
      }) satisfies NotebookCellViewProps,
    [
      activeEditorCellId,
      deleteCell,
      getCurrentValueMapForModelRef,
      getLaggedValueMapForModelRef,
      graphExpressionHighlight,
      graphSliceHighlight,
      handleCellHelpRequest,
      handleMatrixGraphRequest,
      handlePinCellRequest,
      handleVariableInspectRequest,
      insertCell,
      inspectorContext?.selectedVariable,
      mainColumnElement,
      maxResultPeriodIndex,
      moveCell,
      notebookDocument.cells,
      notebookScopeId,
      replaceCells,
      runner,
      selectNotebookCell,
      selectedCellId,
      selectedPeriodIndex,
      setNotebookCellUrl,
      updateCell,
      updateModelCell
    ]
  );

  useEffect(() => {
    const cellId = readNotebookRouteLocation().cellId;
    if (!cellId) {
      return;
    }

    applyNotebookCellFromRoute(cellId);
  }, [applyNotebookCellFromRoute, notebookDocument.id]);

  const currentDerivedFrom = resolveNotebookDerivedFrom(
    notebookDocument,
    activeVariantId,
    currentTemplateId
  );
  const isUnnamedNotebookSession =
    activeVariantId == null && !currentTemplateId && currentDerivedFrom != null;
  const notebookPickerValue = activeVariantId
    ? activeVariantId
    : currentTemplateId
      ? currentTemplateId
      : isUnnamedNotebookSession
        ? UNNAMED_NOTEBOOK_SELECT_VALUE
        : DEFAULT_NOTEBOOK_TEMPLATE_ID;
  const unnamedPickerLabel = currentDerivedFrom
    ? `Unnamed (${NOTEBOOK_TEMPLATES[currentDerivedFrom].label})`
    : "Unnamed";
  const importedVariants = useMemo(() => listImportedNotebookVariants(), [variantIndex]);
  const variantsByTemplate = useMemo(() => {
    const groups = new Map<NotebookTemplateId, NotebookVariantIndexEntry[]>();
    for (const entry of variantIndex) {
      if (!entry.derivedFrom) {
        continue;
      }
      const group = groups.get(entry.derivedFrom) ?? [];
      group.push(entry);
      groups.set(entry.derivedFrom, group);
    }
    return groups;
  }, [variantIndex]);
  const nextNotebookSourceFormat = getNextNotebookSourceFormat(sourceFormat);

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
          <div
            className={`notebook-top-tray${
              isNotebookCommandTrayOpen ? " is-command-tray-open" : ""
            }${isNotebookCommandTrayDismissed ? " is-command-tray-dismissed" : ""
            }${maxResultPeriodIndex > 0 ? " has-period-scrubber" : ""}`}
            onMouseLeave={() => setIsNotebookCommandTrayDismissed(false)}
          >
            {maxResultPeriodIndex > 0 ? (
              <div className="notebook-scrubber-slot">
                <PeriodScrubber
                  maxIndex={maxResultPeriodIndex}
                  onChange={setSelectedPeriodIndex}
                  selectedIndex={selectedPeriodIndex}
                />
                <button
                  ref={notebookCommandTrayToggleRef}
                  type="button"
                  className="notebook-command-tray-toggle"
                  aria-controls="notebook-command-tray"
                  aria-expanded={isNotebookCommandTrayOpen}
                  aria-pressed={isNotebookCommandTrayOpen}
                  onClick={() => {
                    const nextIsOpen = !isNotebookCommandTrayOpen;
                    setIsNotebookCommandTrayOpen(nextIsOpen);
                    setIsNotebookCommandTrayDismissed(!nextIsOpen);
                  }}
                >
                  Commands
                </button>
              </div>
            ) : null}

            <section
              ref={notebookCommandTrayRef}
              id="notebook-command-tray"
              className="control-panel notebook-app-bar notebook-command-tray"
            >
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
                  <button
                    type="button"
                    className="notebook-run-button"
                    title={nextUndoLabel ? `Undo: ${nextUndoLabel}` : "Nothing to undo"}
                    aria-label={nextUndoLabel ? `Undo: ${nextUndoLabel}` : "Undo"}
                    onClick={() => handleUndoNotebookEdit()}
                    disabled={!nextUndoLabel}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="notebook-run-button"
                    title={nextRedoLabel ? `Redo: ${nextRedoLabel}` : "Nothing to redo"}
                    aria-label={nextRedoLabel ? `Redo: ${nextRedoLabel}` : "Redo"}
                    onClick={handleRedoNotebookEdit}
                    disabled={!nextRedoLabel}
                  >
                    Redo
                  </button>
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
          </div>

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
                  {...buildNotebookCellViewProps(cell, {
                    isPinnedInPanel: pinnedCellId === cell.id
                  })}
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
                    value={notebookPickerValue}
                    onChange={(event) => handleNotebookPickerChange(event.target.value)}
                  >
                    {isUnnamedNotebookSession ? (
                      <optgroup label="Current">
                        <option value={UNNAMED_NOTEBOOK_SELECT_VALUE}>{unnamedPickerLabel}</option>
                      </optgroup>
                    ) : null}
                    <optgroup label="Templates">
                      {Object.values(NOTEBOOK_TEMPLATES).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </optgroup>
                    {Object.values(NOTEBOOK_TEMPLATES).map((template) => {
                      const group = variantsByTemplate.get(template.id) ?? [];
                      if (group.length === 0) {
                        return null;
                      }

                      return (
                        <optgroup key={`variants-${template.id}`} label={`${template.label} variants`}>
                          {group.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.title}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {importedVariants.length > 0 ? (
                      <optgroup label="Imported">
                        {importedVariants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.title}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <div className="notebook-rail-template-actions">
                  <button
                    type="button"
                    className="notebook-run-button"
                    onClick={() => setIsVariantManagerOpen(true)}
                  >
                    Manage variants…
                  </button>
                </div>
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
                {...{ "aria-selected": activeRailTab === "variables" }}
                className={`notebook-rail-tab${activeRailTab === "variables" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("variables")}
              >
                Variables
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
                {...{ "aria-selected": activeRailTab === "graph" }}
                className={`notebook-rail-tab${activeRailTab === "graph" ? " is-active" : ""}`}
                onClick={() => setActiveRailTab("graph")}
              >
                Graph
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
                  aria-label={`Source format is ${formatNotebookSourceLabel(sourceFormat)}. Switch to ${formatNotebookSourceLabel(nextNotebookSourceFormat)}.`}
                  title={`Source format: ${formatNotebookSourceLabel(sourceFormat)}. Click to switch to ${formatNotebookSourceLabel(nextNotebookSourceFormat)}.`}
                  onClick={() => handleSourceFormatChange(nextNotebookSourceFormat)}
                >
                  {formatNotebookSourceFormatOptions()}
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
                    accept=".sfnb.json,.json,.sfnb.md,.md,.markdown,.notebook.yaml,.yaml,.yml,.txt,application/json,text/markdown,application/yaml,text/yaml"
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

          {activeRailTab === "variables" ? (
            <VariableCatalogPanel
              catalogModelContexts={catalogModelContexts}
              hasPendingParameterOverrides={hasPendingParameterOverrides}
              onApplyParameterOverrides={applyParameterOverrides}
              onDiscardParameterOverrides={discardParameterOverrides}
              onParameterOverrideChange={handleParameterOverrideChange}
              onParameterOverrideRelease={handleParameterOverrideRelease}
              onSelectRow={handleCatalogRowSelect}
              parameterOverrides={parameterOverrides}
              rows={catalogRows}
              selectedVariable={inspectorContext?.selectedVariable}
              showModelColumn={catalogModelContexts.length > 1}
              variableUnitMetadata={catalogVariableUnitMetadata}
            />
          ) : null}

          {activeRailTab === "inspect" ? (
            <VariableInspector
              canEditDefiningEquation={
                inspectorContext?.modelSource != null &&
                isInspectorModelEditable(notebookDocument.cells, inspectorContext.modelSource) &&
                selectedVariableData?.definingEquation != null
              }
              canGoBack={inspectorVariableHistory.canGoBack}
              canGoForward={inspectorVariableHistory.canGoForward}
              commitStyle="draft"
              currentValues={inspectorCurrentValues}
              laggedCurrentValues={inspectorLaggedCurrentValues}
              laggedPeriodLabel={inspectorLaggedPeriodLabel}
              data={selectedVariableData}
              onApplyDefiningExpression={handleInspectorDefiningExpressionApply}
              onGoBack={handleInspectorGoBack}
              onGoForward={handleInspectorGoForward}
              onSelectVariable={(variableName) => {
                setActiveRailTab("inspect");
                inspectorVariableHistory.push(variableName);
                setInspectorContext((current) =>
                  current ? { ...current, selectedVariable: variableName } : current
                );
              }}
              hasPendingParameterOverrides={inspectorHasPendingParameterOverrides}
              inspectorModelId={inspectorModelId}
              onParameterOverrideChange={handleParameterOverrideChange}
              onParameterOverrideRelease={handleParameterOverrideRelease}
              parameterNames={externalRowsOnly(inspectorContext?.editor.externals ?? []).map((external) => external.name)}
              parameterOverrides={parameterOverrides}
              selectedPeriodIndex={selectedPeriodIndex}
              seriesValues={inspectorSeriesValues}
              stability={{
                display: stabilityDisplay,
                isComputing: stabilityIsComputing,
                onClearAnalysis: () => {
                  setStabilityEnabled(false);
                  setShowStabilityRawPanel(false);
                },
                onRequestAnalysis: () => setStabilityEnabled(true),
                selectedPeriodIndex,
                simulationResult: stabilityTarget?.result ?? null
              }}
              variableDescriptions={inspectorContext?.variableDescriptions}
              variableUnitMetadata={inspectorContext?.variableUnitMetadata}
            />
          ) : null}

          {activeRailTab === "graph" ? (
            <MatrixGraphRailPanel
              cells={notebookDocument.cells}
              charts={matrixGraphCharts}
              getResult={(runCellId) => runner.getResult(runCellId)}
              onAddChartSeries={handleAddMatrixGraphChartSeries}
              onDismissChart={handleDismissMatrixGraphChart}
              onGraphExpressionHighlightChange={handleGraphExpressionHighlightChange}
              onGraphSliceHighlightChange={handleGraphSliceHighlightChange}
              onRemoveChartSeries={handleRemoveMatrixGraphChartSeries}
              onToggleChartLegendMode={handleToggleMatrixGraphChartLegendMode}
              onToggleChartPin={handleToggleMatrixGraphChartPin}
              selectedPeriodIndex={selectedPeriodIndex}
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
                        selectNotebookCell(cell.id);
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
                    disabled={nextUndoEntry?.label !== "assistant patch"}
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
                          undoStackLength={
                            nextUndoEntry?.label === "assistant patch" &&
                            nextUndoEntry.messageId === message.id
                              ? 1
                              : 0
                          }
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
      <NotebookVariantManagerDialog
        activeVariantId={activeVariantId}
        currentDerivedFrom={currentDerivedFrom}
        isOpen={isVariantManagerOpen}
        variants={variantIndex}
        onClose={() => setIsVariantManagerOpen(false)}
        onCreateFromCurrent={handleCreateVariantFromCurrent}
        onCreateFromTemplate={handleCreateVariantFromTemplate}
        onDelete={handleDeleteVariant}
        onOpenVariant={handleOpenVariant}
        onRename={handleRenameVariant}
      />
      {showStabilityRawPanel ? (
        <StabilityRawDataDialog
          display={stabilityDisplay}
          isComputing={stabilityIsComputing}
          periodLabel={selectedPeriodIndex + 1}
          selectedPeriodIndex={selectedPeriodIndex}
          runLabel={stabilityTarget?.modelLabel ?? stabilityDisplay.modelLabel}
          simulationResult={stabilityTarget?.result ?? null}
          onClose={() => setShowStabilityRawPanel(false)}
        />
      ) : null}
      {pinnedCell ? (
        <PinnedCellPanel
          cellTitle={pinnedCell.title}
          cellType={pinnedCell.type}
          maxPeriodIndex={maxResultPeriodIndex}
          selectedPeriodIndex={selectedPeriodIndex}
          onClose={() => setPinnedCellId(null)}
          renderContent={(viewportRoot) => (
            <NotebookCellView
              key={pinnedCell.id}
              {...buildNotebookCellViewProps(pinnedCell, {
                presentation: "pinned-panel",
                viewportRoot
              })}
            />
          )}
        />
      ) : null}
      </main>
    </NotebookRenderProfiler>
  );
}
