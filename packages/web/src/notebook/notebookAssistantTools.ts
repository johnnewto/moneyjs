import type { UnitMeta } from "../lib/unitMeta";
import { getVariableUnitText, buildVariableUnitMetadata } from "../lib/units";
import { buildVariableDescriptions } from "../lib/variableDescriptions";
import { buildDependencyGraph } from "./dependencyGraph";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "./modelSections";
import type { ChartCell, MatrixCell, NotebookDocument, NotebookRuntimeState, RunCell } from "./types";

export const NOTEBOOK_ASSISTANT_TOOL_NAMES = [
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
] as const;

export type NotebookAssistantToolName = (typeof NOTEBOOK_ASSISTANT_TOOL_NAMES)[number];

export interface NotebookAssistantSnapshot {
  document: NotebookDocument;
  runtime: Pick<NotebookRuntimeState, "outputs" | "status" | "errors">;
  selectedPeriodIndex: number;
  selectedCellId?: string | null;
  selectedVariable?: string | null;
}

export interface NotebookAssistantToolRequest {
  name: NotebookAssistantToolName;
  args?: Record<string, unknown>;
}

export type NotebookAssistantToolResult =
  | {
      ok: true;
      name: NotebookAssistantToolName;
      data: unknown;
    }
  | {
      ok: false;
      name: NotebookAssistantToolName | string;
      error: string;
    };

export function summarizeNotebookAssistantTools(): string {
  return NOTEBOOK_ASSISTANT_TOOL_NAMES.join(", ");
}

export function dispatchNotebookAssistantTool(
  snapshot: NotebookAssistantSnapshot,
  request: NotebookAssistantToolRequest
): NotebookAssistantToolResult {
  if (!isNotebookAssistantToolName(request.name)) {
    return { ok: false, name: request.name, error: `Unknown notebook assistant tool: ${request.name}` };
  }

  try {
    switch (request.name) {
      case "getNotebookSummary":
        return success(request.name, getNotebookSummary(snapshot));
      case "getEquation":
        return success(request.name, getEquation(snapshot, requireString(request.args, "variable")));
      case "getCurrentValues":
        return success(
          request.name,
          getCurrentValues(snapshot, {
            periodIndex: optionalInteger(request.args, "periodIndex") ?? snapshot.selectedPeriodIndex,
            runId: requireString(request.args, "runId")
          })
        );
      case "getSeries":
        return success(
          request.name,
          getSeries(snapshot, requireString(request.args, "runId"), requireString(request.args, "variable"))
        );
      case "getSeriesWindow":
        return success(
          request.name,
          getSeriesWindow(snapshot, {
            end: requireInteger(request.args, "end"),
            runId: requireString(request.args, "runId"),
            start: requireInteger(request.args, "start"),
            variable: requireString(request.args, "variable")
          })
        );
      case "getMatrix":
        return success(request.name, getMatrix(snapshot, requireString(request.args, "matrixId")));
      case "getVariableMetadata":
        return success(
          request.name,
          getVariableMetadata(snapshot, requireString(request.args, "variable"))
        );
      case "getDependencyGraph":
        return success(
          request.name,
          getDependencyGraph(snapshot, optionalString(request.args, "variable") ?? snapshot.selectedVariable ?? undefined)
        );
      case "listRuns":
        return success(request.name, listRuns(snapshot));
      case "listVariables":
        return success(request.name, listVariables(snapshot));
      case "listCharts":
        return success(request.name, listCharts(snapshot));
    }
  } catch (error) {
    return {
      ok: false,
      name: request.name,
      error: error instanceof Error ? error.message : "Notebook assistant tool failed."
    };
  }
}

export function getNotebookSummary(snapshot: NotebookAssistantSnapshot) {
  const runs = listRuns(snapshot);
  const charts = listCharts(snapshot);
  const matrices = snapshot.document.cells.filter((cell): cell is MatrixCell => cell.type === "matrix");

  return {
    id: snapshot.document.id,
    title: snapshot.document.title,
    cellCount: snapshot.document.cells.length,
    cellTypes: summarizeCellTypes(snapshot.document),
    selectedCellId: snapshot.selectedCellId ?? null,
    selectedPeriodIndex: snapshot.selectedPeriodIndex,
    selectedVariable: snapshot.selectedVariable ?? null,
    completedRunCount: runs.filter((run) => run.status === "success" && run.hasResult).length,
    runCount: runs.length,
    chartCount: charts.length,
    matrixCount: matrices.length,
    tools: [...NOTEBOOK_ASSISTANT_TOOL_NAMES]
  };
}

export function getEquation(snapshot: NotebookAssistantSnapshot, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");

  for (const model of listModelContexts(snapshot)) {
    const equation = model.editor.equations.find((row) => row.name.trim() === normalizedVariable);
    if (!equation) {
      continue;
    }

    const graph = buildDependencyGraph(model.editor);
    const node = graph.nodes.find((candidate) => candidate.name === normalizedVariable);

    return {
      variable: normalizedVariable,
      modelId: model.modelId,
      modelTitle: model.title,
      expression: equation.expression,
      description: equation.desc?.trim() || undefined,
      role: equation.role ?? node?.equationRole ?? null,
      currentDependencies: node?.currentDependencyNames ?? [],
      lagDependencies: node?.lagDependencyNames ?? []
    };
  }

  throw new Error(`Unknown equation variable: ${normalizedVariable}`);
}

export function getCurrentValues(
  snapshot: NotebookAssistantSnapshot,
  args: { runId: string; periodIndex: number }
) {
  const { result, run } = requireRunResult(snapshot, args.runId);
  const periodIndex = clampPeriodIndex(args.periodIndex, result.options.periods);

  return {
    runId: run.id,
    runTitle: run.title,
    periodIndex,
    values: Object.fromEntries(
      Object.entries(result.series).map(([name, values]) => [name, finiteValue(values[periodIndex])])
    )
  };
}

export function getSeries(snapshot: NotebookAssistantSnapshot, runId: string, variable: string) {
  const { result, run } = requireRunResult(snapshot, runId);
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  const values = result.series[normalizedVariable];
  if (!values) {
    throw new Error(`Unknown series variable '${normalizedVariable}' for run '${run.id}'.`);
  }

  return {
    runId: run.id,
    runTitle: run.title,
    variable: normalizedVariable,
    periodCount: values.length,
    values: Array.from(values, finiteValue)
  };
}

export function getSeriesWindow(
  snapshot: NotebookAssistantSnapshot,
  args: { runId: string; variable: string; start: number; end: number }
) {
  const series = getSeries(snapshot, args.runId, args.variable);
  const start = clampPeriodIndex(args.start, series.periodCount);
  const end = clampPeriodIndex(args.end, series.periodCount);
  if (end < start) {
    throw new Error("Series window end must be greater than or equal to start.");
  }

  return {
    ...series,
    start,
    end,
    values: series.values.slice(start, end + 1)
  };
}

export function getMatrix(snapshot: NotebookAssistantSnapshot, matrixId: string) {
  const normalizedMatrixId = normalizeRequiredName(matrixId, "matrixId");
  const matrix = snapshot.document.cells.find(
    (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === normalizedMatrixId
  );
  if (!matrix) {
    throw new Error(`Unknown matrix: ${normalizedMatrixId}`);
  }

  return {
    id: matrix.id,
    title: matrix.title,
    sourceRunCellId: matrix.sourceRunCellId ?? null,
    columns: matrix.columns,
    sectors: matrix.sectors ?? [],
    description: matrix.description ?? null,
    note: matrix.note ?? null,
    rows: matrix.rows.map((row) => ({
      band: row.band ?? null,
      label: row.label,
      values: row.values
    }))
  };
}

export function getVariableMetadata(snapshot: NotebookAssistantSnapshot, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");

  for (const model of listModelContexts(snapshot)) {
    const descriptions = buildVariableDescriptions({
      equations: model.editor.equations,
      externals: model.editor.externals
    });
    const unitMetadata = buildVariableUnitMetadata({
      equations: model.editor.equations,
      externals: model.editor.externals
    });
    const graph = buildDependencyGraph(model.editor);
    const node = graph.nodes.find((candidate) => candidate.name === normalizedVariable);
    const equation = model.editor.equations.find((row) => row.name.trim() === normalizedVariable);
    const external = model.editor.externals.find((row) => row.name.trim() === normalizedVariable);
    const unitMeta = unitMetadata.get(normalizedVariable);

    if (!node && !equation && !external && !descriptions.has(normalizedVariable) && !unitMeta) {
      continue;
    }

    return {
      variable: normalizedVariable,
      modelId: model.modelId,
      modelTitle: model.title,
      description: descriptions.get(normalizedVariable) ?? null,
      unitText: getVariableUnitText(unitMetadata, normalizedVariable),
      unitMeta: serializeUnitMeta(unitMeta),
      variableType: node?.variableType ?? (external ? "exogenous" : null),
      equationRole: node?.equationRole ?? equation?.role ?? null,
      currentDependencies: node?.currentDependencyNames ?? [],
      lagDependencies: node?.lagDependencyNames ?? [],
      initialValue: node?.initialValue ?? null,
      externalKind: external?.kind ?? null,
      externalValueText: external?.valueText ?? null
    };
  }

  throw new Error(`Unknown variable: ${normalizedVariable}`);
}

export function getDependencyGraph(snapshot: NotebookAssistantSnapshot, variable?: string) {
  const normalizedVariable = variable ? normalizeRequiredName(variable, "variable") : null;
  const model = normalizedVariable
    ? listModelContexts(snapshot).find((candidate) =>
        candidate.editor.equations.some((row) => row.name.trim() === normalizedVariable) ||
        candidate.editor.externals.some((row) => row.name.trim() === normalizedVariable)
      )
    : listModelContexts(snapshot)[0];

  if (!model) {
    throw new Error(normalizedVariable ? `Unknown variable: ${normalizedVariable}` : "No model found.");
  }

  const graph = buildDependencyGraph(model.editor);
  const nodeNames = normalizedVariable
    ? new Set([
        normalizedVariable,
        ...(graph.nodes.find((node) => node.name === normalizedVariable)?.currentDependencyNames ?? []),
        ...(graph.nodes.find((node) => node.name === normalizedVariable)?.lagDependencyNames ?? [])
      ])
    : null;
  const nodes = nodeNames ? graph.nodes.filter((node) => nodeNames.has(node.name)) : graph.nodes;
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    modelId: model.modelId,
    modelTitle: model.title,
    variable: normalizedVariable,
    errors: graph.errors,
    layerCount: graph.layerCount,
    nodes,
    edges: graph.edges.filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
  };
}

export function listRuns(snapshot: NotebookAssistantSnapshot) {
  return snapshot.document.cells.filter((cell): cell is RunCell => cell.type === "run").map((run) => {
    const output = snapshot.runtime.outputs[run.id];
    const result = output?.type === "result" ? output.result : null;
    return {
      id: run.id,
      title: run.title,
      mode: run.mode,
      resultKey: run.resultKey,
      sourceModelId: run.sourceModelId ?? null,
      sourceModelCellId: run.sourceModelCellId ?? null,
      baselineRunCellId: run.baselineRunCellId ?? null,
      periods: run.periods ?? result?.options.periods ?? null,
      status: snapshot.runtime.status[run.id] ?? "idle",
      error: snapshot.runtime.errors[run.id] ?? null,
      hasResult: result != null,
      variableCount: result ? Object.keys(result.series).length : 0
    };
  });
}

export function listVariables(snapshot: NotebookAssistantSnapshot) {
  const variables = new Map<string, ReturnType<typeof getVariableMetadata>>();
  for (const model of listModelContexts(snapshot)) {
    const graph = buildDependencyGraph(model.editor);
    for (const node of graph.nodes) {
      if (!variables.has(node.name)) {
        variables.set(node.name, getVariableMetadata(snapshot, node.name));
      }
    }
  }

  return Array.from(variables.values()).sort((left, right) => left.variable.localeCompare(right.variable));
}

export function listCharts(snapshot: NotebookAssistantSnapshot) {
  return snapshot.document.cells.filter((cell): cell is ChartCell => cell.type === "chart").map((chart) => ({
    id: chart.id,
    title: chart.title,
    sourceRunCellId: chart.sourceRunCellId,
    variables: chart.variables,
    axisMode: chart.axisMode ?? null,
    timeRangeInclusive: chart.timeRangeInclusive ?? null
  }));
}

function listModelContexts(snapshot: NotebookAssistantSnapshot) {
  const contexts: Array<{
    editor: NonNullable<ReturnType<typeof buildEditorStateForNotebookModel>>;
    modelId: string;
    title: string;
  }> = [];
  const seen = new Set<string>();

  for (const run of snapshot.document.cells.filter((cell): cell is RunCell => cell.type === "run")) {
    const modelKey = resolveRunCellModelKey(snapshot.document.cells, run);
    if (!modelKey || seen.has(modelKey)) {
      continue;
    }
    const editor = buildEditorStateForNotebookModel(snapshot.document, run);
    if (!editor) {
      continue;
    }
    seen.add(modelKey);
    contexts.push({
      editor,
      modelId: modelKey.replace(/^model:/, "").replace(/^cell:/, ""),
      title: resolveModelTitle(snapshot.document, run) ?? run.title
    });
  }

  return contexts;
}

function resolveModelTitle(document: NotebookDocument, source: RunCell): string | null {
  const modelKey = resolveRunCellModelKey(document.cells, source);
  if (!modelKey) {
    return null;
  }

  if (modelKey.startsWith("cell:")) {
    const cellId = modelKey.slice("cell:".length);
    return document.cells.find((cell) => cell.id === cellId)?.title ?? null;
  }

  const modelId = modelKey.slice("model:".length);
  return (
    document.cells.find(
      (cell) =>
        (cell.type === "equations" ||
          cell.type === "solver" ||
          cell.type === "externals" ||
          cell.type === "initial-values") &&
        cell.modelId === modelId
    )?.title ?? null
  );
}

function requireRunResult(snapshot: NotebookAssistantSnapshot, runId: string) {
  const normalizedRunId = normalizeRequiredName(runId, "runId");
  const run = snapshot.document.cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.id === normalizedRunId
  );
  if (!run) {
    throw new Error(`Unknown run: ${normalizedRunId}`);
  }

  const output = snapshot.runtime.outputs[run.id];
  if (output?.type !== "result") {
    throw new Error(`Run '${run.id}' does not have result data.`);
  }

  return { result: output.result, run };
}

function summarizeCellTypes(document: NotebookDocument): Record<string, number> {
  return document.cells.reduce<Record<string, number>>((counts, cell) => {
    counts[cell.type] = (counts[cell.type] ?? 0) + 1;
    return counts;
  }, {});
}

function isNotebookAssistantToolName(name: string): name is NotebookAssistantToolName {
  return NOTEBOOK_ASSISTANT_TOOL_NAMES.includes(name as NotebookAssistantToolName);
}

function success(name: NotebookAssistantToolName, data: unknown): NotebookAssistantToolResult {
  return { ok: true, name, data };
}

function requireString(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Tool argument '${key}' must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Tool argument '${key}' must be a string.`);
  }
  return value.trim() || undefined;
}

function requireInteger(args: Record<string, unknown> | undefined, key: string): number {
  const value = optionalInteger(args, key);
  if (value == null) {
    throw new Error(`Tool argument '${key}' must be an integer.`);
  }
  return value;
}

function optionalInteger(args: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Tool argument '${key}' must be an integer.`);
  }
  return value;
}

function normalizeRequiredName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function clampPeriodIndex(periodIndex: number, periodCount: number): number {
  if (!Number.isInteger(periodIndex)) {
    throw new Error("Period index must be an integer.");
  }
  if (periodCount <= 0) {
    throw new Error("Result has no periods.");
  }
  if (periodIndex < 0 || periodIndex >= periodCount) {
    throw new Error(`Period index ${periodIndex} is outside result range 0-${periodCount - 1}.`);
  }
  return periodIndex;
}

function finiteValue(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function serializeUnitMeta(unitMeta: UnitMeta | undefined): UnitMeta | null {
  return unitMeta ?? null;
}
