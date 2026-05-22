import { getVariableUnitText, buildVariableUnitMetadata } from "../../lib/units";
import { buildVariableDescriptions } from "../../lib/variableDescriptions";
import { buildDependencyGraph } from "../dependencyGraph";
import type { ChartCell, MatrixCell, RunCell } from "../types";
import { NOTEBOOK_ASSISTANT_TOOL_NAMES, type NotebookAssistantSnapshot } from "./types";
import { clampPeriodIndex, finiteValue, listModelContexts, normalizeRequiredName, requireRunResult, serializeUnitMeta, summarizeCellTypes } from "./shared";

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

export function getMatrix(snapshot: NotebookAssistantSnapshot, matrixId?: string) {
  const matrices = snapshot.document.cells.filter((cell): cell is MatrixCell => cell.type === "matrix");
  const serializeMatrix = (matrix: MatrixCell) => ({
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
  });

  if (typeof matrixId !== "string" || !matrixId.trim()) {
    return {
      matrices: matrices.map(serializeMatrix)
    };
  }

  const normalizedMatrixId = normalizeRequiredName(matrixId, "matrixId");
  const matrix = matrices.find((cell) => cell.id === normalizedMatrixId);
  if (!matrix) {
    throw new Error(`Unknown matrix: ${normalizedMatrixId}`);
  }

  return serializeMatrix(matrix);
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
    referenceTrace: chart.referenceTrace ?? null,
    timeRangeInclusive: chart.timeRangeInclusive ?? null
  }));
}


