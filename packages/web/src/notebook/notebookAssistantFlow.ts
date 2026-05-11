import type { NotebookAssistantToolRequest, NotebookAssistantToolResult } from "./notebookAssistantTools";
import type { NotebookPatch } from "./notebookPatch";
import type { ExternalsCell, EquationsCell, NotebookCell, NotebookDocument } from "./types";

export type NotebookAssistantMode = "ask" | "edit";

interface NotebookAssistantToolRequestEnvelope {
  notebookAssistantToolRequests?: unknown;
  toolRequests?: unknown;
}

export interface NotebookAssistantToolRequestExtraction {
  error?: string;
  requests: NotebookAssistantToolRequest[];
}

export type NotebookAssistantDirectPatchPolicy =
  | {
      ok: true;
      patch: NotebookPatch;
    }
  | {
      ok: true;
      request: NotebookAssistantToolRequest;
    }
  | {
      message: string;
      ok: false;
    };

const NOTEBOOK_ASSISTANT_READ_TOOL_NAMES = new Set<string>([
  "getNotebookSummary",
  "getEquation",
  "getCurrentValues",
  "getSeries",
  "getSeriesWindow",
  "getMatrix",
  "getVariableMetadata",
  "getDependencyGraph",
  "listRuns",
  "listVariables",
  "listCharts"
]);

export function extractNotebookAssistantToolRequests(text: string): NotebookAssistantToolRequestExtraction {
  const candidates = collectNotebookAssistantJsonCandidates(text);
  let parseError = false;

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as NotebookAssistantToolRequestEnvelope | unknown;
      const semanticRequests = normalizeNotebookPatchProposalToolRequests(parsed);
      if (semanticRequests.length > 0) {
        return { requests: semanticRequests };
      }

      const envelope = parsed as NotebookAssistantToolRequestEnvelope;
      const rawRequests = envelope.notebookAssistantToolRequests ?? envelope.toolRequests;
      if (!Array.isArray(rawRequests)) {
        continue;
      }

      const requests = rawRequests.flatMap((request): NotebookAssistantToolRequest[] => {
        if (!request || typeof request !== "object" || Array.isArray(request)) {
          return [];
        }
        const record = request as { args?: unknown; name?: unknown };
        if (typeof record.name !== "string" || !record.name.trim()) {
          return [];
        }
        const name = record.name.trim();
        const args = record.args && typeof record.args === "object" && !Array.isArray(record.args)
          ? normalizeNotebookAssistantToolRequestArgs(name, record.args as Record<string, unknown>)
          : undefined;
        return [
          {
            args,
            name
          }
        ];
      });

      if (requests.length > 0) {
        return { requests };
      }
    } catch {
      parseError = true;
    }
  }

  if (parseError) {
    return {
      error: "Assistant requested notebook tools, but the request JSON could not be parsed.",
      requests: []
    };
  }

  return { requests: [] };
}

export function extractNotebookPatchProposal(args: {
  document: NotebookDocument;
  question: string;
  text: string;
}): NotebookPatch | null {
  for (const candidate of collectFencedJsonCandidates(args.text)) {
    try {
      const patch = normalizeNotebookPatchCandidate(JSON.parse(candidate) as unknown);
      if (patch) {
        return normalizeNotebookPatchForCurrentDocument(
          args.document,
          patch,
          `${args.question}\n${args.text}`
        );
      }
    } catch {
      // Try the next JSON block.
    }
  }

  return null;
}

export function extractTextChartVariablesToolRequest(
  document: NotebookDocument,
  contextText: string
): NotebookAssistantToolRequest | null {
  const normalizedContext = contextText.toLowerCase();
  if (!normalizedContext.includes("chart") || !/review|apply|proposed|proposal|update/.test(normalizedContext)) {
    return null;
  }
  if (/would you like|let me know|specify a different|if you want/.test(normalizedContext)) {
    return null;
  }

  const chartId = findVariableListCellId(document, contextText);
  const chart = chartId
    ? document.cells.find((cell): cell is Extract<NotebookCell, { type: "chart" }> => cell.id === chartId && cell.type === "chart")
    : null;
  if (!chart) {
    return null;
  }

  const arrays = Array.from(contextText.matchAll(/\[(?:\s*"[A-Za-z][A-Za-z0-9_^{}]*"\s*,?)+\s*\]/g))
    .map((match) => match[0])
    .filter((candidate) => candidate.includes('"'));
  for (const candidate of arrays.reverse()) {
    try {
      const variables = JSON.parse(candidate) as unknown;
      if (isStringArray(variables) && variables.length > 0) {
        return {
          name: "createUpdateChartVariablesPatch",
          args: {
            chartId: chart.id,
            variables
          }
        };
      }
    } catch {
      // Try the next array-shaped text fragment.
    }
  }

  return null;
}

export function evaluateNotebookAssistantDirectPatchPolicy(
  document: NotebookDocument,
  patch: NotebookPatch
): NotebookAssistantDirectPatchPolicy {
  const request = createToolRequestFromSupportedDirectPatch(document, patch);
  if (request) {
    return { ok: true, request };
  }

  const supportedEdit = patch.operations.some(isHelperCoveredPatchOperation);
  if (supportedEdit) {
    return {
      ok: false,
      message: "This edit is covered by notebook helper tools, but the assistant response did not include enough stable information to prepare it automatically. Try asking again with the chart, run, or parameter name included."
    };
  }

  return { ok: true, patch };
}

export function buildNotebookAssistantToolFollowupQuestion(args: {
  originalQuestion: string;
  toolResults: NotebookAssistantToolResult[];
}): string {
  const sanitizedToolResults = args.toolResults.map(sanitizeNotebookAssistantToolResultForFollowup);

  return [
    "Use these notebook assistant tool results to answer the original question.",
    "Do not ask for the same tool calls again unless the results are insufficient.",
    "If a result contains a patch proposal, summarize the proposed change and say it is ready for user preview/apply.",
    "Do not quote raw patch JSON, JSON Pointer paths, or internal cell ids from tool results.",
    `Original question: ${args.originalQuestion}`,
    "Tool results JSON:",
    JSON.stringify({ toolResults: sanitizedToolResults }, null, 2)
  ].join("\n");
}

export function summarizeNotebookAssistantToolResults(toolResults: NotebookAssistantToolResult[]): string {
  const failed = toolResults.filter((result) => !result.ok);
  const names = toolResults.map((result) => result.name).join(", ");
  if (failed.length === 0) {
    return `Notebook tools: ${names} completed.`;
  }

  return `Notebook tools: ${names}. ${failed.length} failed: ${failed.map((result) => `${result.name}: ${result.error}`).join("; ")}`;
}

export function getPatchFromNotebookAssistantToolResults(
  toolResults: NotebookAssistantToolResult[],
  toolRequests: NotebookAssistantToolRequest[] = []
): NotebookPatch | null {
  const patches: NotebookPatch[] = [];

  for (const [index, result] of toolResults.entries()) {
    if (!result.ok || !result.data || typeof result.data !== "object") {
      continue;
    }
    const patch = (result.data as { patch?: unknown }).patch;
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      const operations = (patch as { operations?: unknown }).operations;
      if (Array.isArray(operations)) {
        patches.push(patch as NotebookPatch);
        continue;
      }
    }

    if (
      (result.name === "validateNotebookPatch" || result.name === "previewNotebookPatch" || result.name === "explainNotebookPatch") &&
      (result.data as { ok?: unknown }).ok !== false
    ) {
      const requestPatch = normalizePatchArgument(toolRequests[index]);
      if (requestPatch) {
        patches.push(requestPatch);
      }
    }
  }

  if (patches.length === 0) {
    return null;
  }
  if (patches.length === 1) {
    return patches[0] as NotebookPatch;
  }

  const descriptions = patches
    .map((patch) => patch.description?.trim())
    .filter((description): description is string => Boolean(description));

  return {
    ...(descriptions.length > 0 ? { description: descriptions.join(" ") } : {}),
    operations: patches.flatMap((patch) => patch.operations)
  };
}

export function getNotebookAssistantModeContract(mode: NotebookAssistantMode): string {
  return mode === "edit"
    ? "Use read tools when needed, then prefer helper-generated validated patch proposals for notebook edits. Never apply changes directly."
    : "Answer questions and inspect notebook state with read tools only. Do not create or return notebook patch proposals in Ask mode.";
}

export function resolveNotebookAssistantMode(value: string | null): NotebookAssistantMode {
  return value === "edit" ? "edit" : "ask";
}

export function filterNotebookAssistantToolRequestsForMode(
  mode: NotebookAssistantMode,
  requests: NotebookAssistantToolRequest[]
): { blocked: NotebookAssistantToolRequest[]; allowed: NotebookAssistantToolRequest[] } {
  if (mode === "edit") {
    return { allowed: requests, blocked: [] };
  }

  return requests.reduce<{ blocked: NotebookAssistantToolRequest[]; allowed: NotebookAssistantToolRequest[] }>(
    (result, request) => {
      if (NOTEBOOK_ASSISTANT_READ_TOOL_NAMES.has(request.name)) {
        result.allowed.push(request);
      } else {
        result.blocked.push(request);
      }
      return result;
    },
    { allowed: [], blocked: [] }
  );
}

export function formatNotebookAssistantMode(mode: NotebookAssistantMode): string {
  return mode === "edit" ? "Edit" : "Ask";
}

function collectNotebookAssistantJsonCandidates(text: string): string[] {
  return [...collectFencedJsonCandidates(text), ...collectEmbeddedJsonObjectCandidates(text)].filter(
    (candidate) =>
      candidate.includes("ToolRequests") ||
      candidate.includes("toolRequests") ||
      candidate.includes("notebookPatchProposal") ||
      candidate.includes("patchKind")
  );
}

function collectEmbeddedJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  const targets = ["notebookPatchProposal", "patchKind"];

  for (const target of targets) {
    let searchIndex = text.indexOf(target);

    while (searchIndex >= 0) {
      const start = text.lastIndexOf("{", searchIndex);
      if (start < 0) {
        break;
      }

      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) {
          continue;
        }
        if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            candidates.push(text.slice(start, index + 1).trim());
            break;
          }
        }
      }

      searchIndex = text.indexOf(target, searchIndex + target.length);
    }
  }

  return candidates;
}

function normalizeNotebookPatchProposalToolRequests(value: unknown): NotebookAssistantToolRequest[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const direct = normalizeSemanticPatchToolRequest(value);
  if (direct) {
    return [direct];
  }

  const proposal = (value as { notebookPatchProposal?: unknown }).notebookPatchProposal;
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    return [];
  }

  const patches = (proposal as { patches?: unknown }).patches;
  if (!Array.isArray(patches)) {
    return [];
  }

  return patches.flatMap((patch): NotebookAssistantToolRequest[] => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return [];
    }
    const request = normalizeSemanticPatchToolRequest(patch);
    return request ? [request] : [];
  });
}

function normalizeSemanticPatchToolRequest(value: unknown): NotebookAssistantToolRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    chartId?: unknown;
    chartCellId?: unknown;
    kind?: unknown;
    modelId?: unknown;
    patchKind?: unknown;
    runId?: unknown;
    title?: unknown;
    displayUnit?: unknown;
    stockFlow?: unknown;
    unit?: unknown;
    unitMeta?: unknown;
    newValue?: unknown;
    targetValue?: unknown;
    to?: unknown;
    toValue?: unknown;
    value?: unknown;
    valueText?: unknown;
    variable?: unknown;
    variables?: unknown;
  };
  const kind = typeof record.kind === "string" ? record.kind : record.patchKind;

  const chartId = typeof record.chartId === "string" ? record.chartId : record.chartCellId;
  if ((kind === "chart-variables-update" || kind === "updateChartVariables") && typeof chartId === "string" && isStringArray(record.variables)) {
    return { name: "createUpdateChartVariablesPatch", args: { chartId, variables: record.variables } };
  }

  if ((kind === "chart-add" || kind === "addChart") && typeof record.runId === "string" && isStringArray(record.variables)) {
    return {
      name: "createAddChartPatch",
      args: {
        runId: record.runId,
        title: typeof record.title === "string" ? record.title : `Chart: ${record.variables.join(", ")}`,
        variables: record.variables
      }
    };
  }

  if ((kind === "parameter-update" || kind === "updateParameter") && typeof record.modelId === "string" && typeof record.variable === "string") {
    return {
      name: "createUpdateParameterPatch",
      args: {
        modelId: record.modelId,
        value: resolveParameterPatchValue(record),
        variable: record.variable
      }
    };
  }

  if (
    (kind === "variable-unit-meta-update" || kind === "updateVariableUnitMeta" || kind === "updateVariableUnits") &&
    typeof record.variable === "string"
  ) {
    return {
      name: "createUpdateVariableUnitMetaPatch",
      args: {
        displayUnit: typeof record.displayUnit === "string" ? record.displayUnit : typeof record.unit === "string" ? record.unit : undefined,
        modelId: typeof record.modelId === "string" ? record.modelId : undefined,
        stockFlow: typeof record.stockFlow === "string" ? record.stockFlow : undefined,
        unitMeta: record.unitMeta && typeof record.unitMeta === "object" && !Array.isArray(record.unitMeta) ? record.unitMeta as Record<string, unknown> : undefined,
        variable: record.variable
      }
    };
  }

  return null;
}

function normalizeNotebookAssistantToolRequestArgs(
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (
    name === "createUpdateChartVariablesPatch" &&
    typeof args.chartId !== "string" &&
    typeof args.chartCellId === "string"
  ) {
    return { ...args, chartId: args.chartCellId };
  }

  if (
    (name === "createUpdateEquationPatch" || name === "createRemoveEquationPatch") &&
    typeof args.variable !== "string" &&
    typeof args.equationName === "string"
  ) {
    return { ...args, variable: args.equationName };
  }

  if (name === "createUpdateParameterPatch") {
    const value = resolveParameterPatchValue(args);
    if (value !== args.value) {
      return { ...args, value };
    }
  }

  if (name === "createUpdateRunOptionsPatch") {
    const runId = resolveRunIdAlias(args);
    if (runId && runId !== args.runId) {
      return { ...args, runId };
    }
  }

  return args;
}

function resolveRunIdAlias(args: Record<string, unknown>): string | undefined {
  for (const key of ["runId", "sourceRunCellId", "runCellId", "sourceRunId", "resultRunId", "cellId", "id", "run"] as const) {
    const value = args[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function resolveParameterPatchValue(record: Record<string, unknown>): unknown {
  if (isPresentParameterPatchValue(record.value)) {
    return record.value;
  }

  for (const key of ["newValue", "targetValue", "toValue", "to", "valueText"] as const) {
    const value = record[key];
    if (isPresentParameterPatchValue(value)) {
      return value;
    }
  }

  return record.value;
}

function isPresentParameterPatchValue(value: unknown): value is string | number {
  return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim() !== "");
}

function sanitizeNotebookAssistantToolResultForFollowup(
  result: NotebookAssistantToolResult
): NotebookAssistantToolResult {
  if (!result.ok || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return result;
  }

  const data = result.data as Record<string, unknown>;
  const sanitizedData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === "patch") {
      continue;
    }
    sanitizedData[key] = value;
  }

  const patch = data.patch;
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const patchRecord = patch as Record<string, unknown>;
    const operations = Array.isArray(patchRecord.operations) ? patchRecord.operations : [];
    sanitizedData.patchSummary = {
      description: typeof patchRecord.description === "string" ? patchRecord.description : null,
      operationCount: operations.length
    };
  }

  return {
    ...result,
    data: sanitizedData
  };
}

function collectFencedJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const fencedJsonPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(fencedJsonPattern)) {
    if (match[1]) {
      candidates.push(match[1].trim());
    }
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }

  return candidates;
}

function normalizeNotebookPatchForCurrentDocument(
  document: NotebookDocument,
  patch: NotebookPatch,
  contextText: string
): NotebookPatch {
  let changed = false;
  const operations = patch.operations.map((operation) => {
    if (operation.op !== "replace" || !isStringArray(operation.value)) {
      return operation;
    }

    const match = operation.path.match(/^\/cells\/(\d+)\/variables$/);
    if (!match) {
      return operation;
    }

    const currentCell = document.cells[Number(match[1])];
    if (currentCell?.type === "chart" || currentCell?.type === "table") {
      return operation;
    }

    const currentCellId = findVariableListCellId(document, contextText);
    if (!currentCellId) {
      return operation;
    }

    changed = true;
    return {
      ...operation,
      path: `/cells/by-id/${escapeJsonPointerSegment(currentCellId)}/variables`
    };
  });

  return changed ? { ...patch, operations } : patch;
}

function findVariableListCellId(document: NotebookDocument, contextText: string): string | null {
  const normalizedContext = contextText.toLowerCase();
  const wantsChart = /\bchart\b/.test(normalizedContext);
  const wantsTable = /\btable\b/.test(normalizedContext);
  const candidates = document.cells
    .map((cell) => ({ cell }))
    .filter(({ cell }) => {
      if (wantsChart) {
        return cell.type === "chart";
      }
      if (wantsTable) {
        return cell.type === "table";
      }
      return cell.type === "chart" || cell.type === "table";
    });

  if (candidates.length === 1) {
    return candidates[0]?.cell.id ?? null;
  }

  const scoredCandidates = candidates
    .map(({ cell }) => ({ id: cell.id, score: scoreVariableListCellMatch(cell, normalizedContext) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scoredCandidates.length === 0) {
    return null;
  }

  const [best, next] = scoredCandidates;
  return best && (!next || best.score > next.score) ? best.id : null;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function scoreVariableListCellMatch(cell: NotebookCell, normalizedContext: string): number {
  if (cell.type !== "chart" && cell.type !== "table") {
    return 0;
  }

  const haystack = [cell.id, cell.title, cell.sourceRunCellId].join(" ").toLowerCase();
  let score = 0;
  if (normalizedContext.includes(cell.id.toLowerCase())) {
    score += 8;
  }
  if (normalizedContext.includes(cell.title.toLowerCase())) {
    score += 8;
  }
  if (normalizedContext.includes(cell.sourceRunCellId.toLowerCase())) {
    score += 5;
  }
  for (const token of ["baseline", "scenario", "adaptive", "interest", "sensitive", "headline"]) {
    if (normalizedContext.includes(token) && haystack.includes(token)) {
      score += 3;
    }
  }
  return score;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeNotebookPatchCandidate(value: unknown): NotebookPatch | null {
  if (Array.isArray(value)) {
    return { operations: value as NotebookPatch["operations"] };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { operations?: unknown; patch?: unknown };
  if (Array.isArray(record.operations)) {
    return value as NotebookPatch;
  }

  if (record.patch && typeof record.patch === "object" && !Array.isArray(record.patch)) {
    const patch = record.patch as { operations?: unknown };
    if (Array.isArray(patch.operations)) {
      return record.patch as NotebookPatch;
    }
  }

  return null;
}

function createToolRequestFromSupportedDirectPatch(
  document: NotebookDocument,
  patch: NotebookPatch
): NotebookAssistantToolRequest | null {
  if (patch.operations.length !== 1) {
    return null;
  }

  const operation = patch.operations[0];
  if (!operation) {
    return null;
  }

  if (operation.op === "add" && operation.path === "/cells/-") {
    const value = operation.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const chart = value as { id?: unknown; sourceRunCellId?: unknown; title?: unknown; type?: unknown; variables?: unknown };
    if (chart.type !== "chart" || typeof chart.sourceRunCellId !== "string" || !Array.isArray(chart.variables)) {
      return null;
    }
    const variables = chart.variables.filter((variable): variable is string => typeof variable === "string" && variable.trim() !== "");
    if (variables.length === 0) {
      return null;
    }
    return {
      name: "createAddChartPatch",
      args: {
        chartId: typeof chart.id === "string" ? chart.id : undefined,
        runId: chart.sourceRunCellId,
        title: typeof chart.title === "string" && chart.title.trim() !== "" ? chart.title : `Chart: ${variables.join(", ")}`,
        variables
      }
    };
  }

  if (operation.op !== "replace") {
    return null;
  }

  const chartVariableTarget = resolveCellPropertyPatchTarget(document, operation.path, "variables");
  if (chartVariableTarget?.cell.type === "chart" && isStringArray(operation.value)) {
    return {
      name: "createUpdateChartVariablesPatch",
      args: {
        chartId: chartVariableTarget.cell.id,
        variables: operation.value
      }
    };
  }

  const externalTarget = resolveExternalValuePatchTarget(document, operation.path);
  if (externalTarget && (typeof operation.value === "string" || typeof operation.value === "number")) {
    return {
      name: "createUpdateParameterPatch",
      args: {
        modelId: externalTarget.cell.modelId,
        value: operation.value,
        variable: externalTarget.variable
      }
    };
  }

  const unitMetaTarget = resolveVariableUnitMetaPatchTarget(document, operation.path);
  if (unitMetaTarget && operation.value && typeof operation.value === "object" && !Array.isArray(operation.value)) {
    const unitMeta = operation.value as { displayUnit?: unknown; stockFlow?: unknown };
    return {
      name: "createUpdateVariableUnitMetaPatch",
      args: {
        displayUnit: typeof unitMeta.displayUnit === "string" ? unitMeta.displayUnit : undefined,
        modelId: unitMetaTarget.cell.modelId,
        stockFlow: typeof unitMeta.stockFlow === "string" ? unitMeta.stockFlow : undefined,
        unitMeta: operation.value,
        variable: unitMetaTarget.variable
      }
    };
  }

  return null;
}

function resolveCellPropertyPatchTarget(
  document: NotebookDocument,
  path: string,
  property: string
): { cell: NotebookCell } | null {
  const byIdMatch = path.match(new RegExp(`^/cells/by-id/([^/]+)/${property}$`));
  if (byIdMatch?.[1]) {
    const cellId = unescapeJsonPointerSegment(byIdMatch[1]);
    const cell = document.cells.find((candidate) => candidate.id === cellId);
    return cell ? { cell } : null;
  }

  const indexMatch = path.match(new RegExp(`^/cells/(\\d+)/${property}$`));
  if (indexMatch?.[1]) {
    const cell = document.cells[Number(indexMatch[1])];
    return cell ? { cell } : null;
  }

  return null;
}

function resolveExternalValuePatchTarget(
  document: NotebookDocument,
  path: string
): { cell: ExternalsCell; variable: string } | null {
  const match = path.match(/^\/cells\/by-id\/([^/]+)\/externals\/(\d+)\/valueText$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const cellId = unescapeJsonPointerSegment(match[1]);
  const cell = document.cells.find((candidate): candidate is ExternalsCell => candidate.id === cellId && candidate.type === "externals");
  const external = cell?.externals[Number(match[2])];
  if (!cell || !external) {
    return null;
  }
  return { cell, variable: external.name };
}

function resolveVariableUnitMetaPatchTarget(
  document: NotebookDocument,
  path: string
): { cell: EquationsCell | ExternalsCell; variable: string } | null {
  const match = path.match(/^\/cells\/by-id\/([^/]+)\/(equations|externals)\/(\d+)\/unitMeta$/);
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const cellId = unescapeJsonPointerSegment(match[1]);
  const cell = document.cells.find(
    (candidate): candidate is EquationsCell | ExternalsCell =>
      candidate.id === cellId && (candidate.type === "equations" || candidate.type === "externals")
  );
  if (!cell) {
    return null;
  }

  const rowIndex = Number(match[3]);
  const row = cell.type === "equations" ? cell.equations[rowIndex] : cell.externals[rowIndex];
  if (!row) {
    return null;
  }

  return { cell, variable: row.name };
}

function unescapeJsonPointerSegment(value: string): string {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isHelperCoveredPatchOperation(operation: NotebookPatch["operations"][number]): boolean {
  if (operation.op === "add" && operation.path === "/cells/-") {
    const value = operation.value;
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type === "chart");
  }

  if (operation.op !== "replace") {
    return false;
  }

  if (/^\/cells\/by-id\/[^/]+\/variables$/.test(operation.path) || /^\/cells\/\d+\/variables$/.test(operation.path)) {
    return true;
  }

  return /^\/cells\/by-id\/[^/]+\/externals\//.test(operation.path) || /^\/cells\/by-id\/[^/]+\/(equations|externals)\/\d+\/unitMeta$/.test(operation.path);
}

function normalizePatchArgument(request: NotebookAssistantToolRequest | undefined): NotebookPatch | null {
  const patch = request?.args?.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return null;
  }
  const operations = (patch as { operations?: unknown }).operations;
  return Array.isArray(operations) ? patch as NotebookPatch : null;
}
