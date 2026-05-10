import type { ExternalDef, EquationRole, ScenarioDefinition, SolverMethod } from "@sfcr/core";

import type { UnitMeta } from "../lib/unitMeta";
import { getVariableUnitText, buildVariableUnitMetadata } from "../lib/units";
import { buildVariableDescriptions } from "../lib/variableDescriptions";
import { buildDependencyGraph } from "./dependencyGraph";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "./modelSections";
import {
  previewNotebookPatch as previewPatch,
  validateNotebookPatch as validatePatch,
  type NotebookPatch,
  type NotebookPatchOperation,
  type NotebookPatchResult
} from "./notebookPatch";
import type {
  ChartCell,
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  MarkdownCell,
  MatrixCell,
  NotebookCell,
  NotebookDocument,
  NotebookRuntimeState,
  RunCell,
  SolverCell,
  TableCell
} from "./types";

type VariableUnitMetaTarget =
  | {
      cell: EquationsCell;
      property: "equations";
      row: EquationsCell["equations"][number];
      rowIndex: number;
    }
  | {
      cell: ExternalsCell;
      property: "externals";
      row: ExternalsCell["externals"][number];
      rowIndex: number;
    };

type VariableDescriptionTarget =
  | {
      cell: EquationsCell;
      property: "equations";
      row: EquationsCell["equations"][number];
      rowIndex: number;
    }
  | {
      cell: ExternalsCell;
      property: "externals";
      row: ExternalsCell["externals"][number];
      rowIndex: number;
    };

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
  "listCharts",
  "validateNotebookPatch",
  "previewNotebookPatch",
  "explainNotebookPatch",
  "createAddChartPatch",
  "createUpdateChartVariablesPatch",
  "createAddEquationPatch",
  "createUpdateEquationPatch",
  "createRemoveEquationPatch",
  "createUpdateVariableDescriptionPatch",
  "createAddExternalPatch",
  "createUpdateExternalPatch",
  "createAddInitialValuePatch",
  "createUpdateInitialValuePatch",
  "createAddScenarioRunPatch",
  "createUpdateRunOptionsPatch",
  "createAddTablePatch",
  "createUpdateTableVariablesPatch",
  "createAddMatrixRowPatch",
  "createUpdateMatrixRowPatch",
  "createRemoveMatrixRowPatch",
  "createAddMarkdownCellPatch",
  "createUpdateMarkdownCellPatch",
  "createUpdateChartOptionsPatch",
  "createUpdateNotebookTitlePatch",
  "createUpdateVariableUnitMetaPatch",
  "createUpdateParameterPatch"
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
  name: NotebookAssistantToolName | string;
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
      case "validateNotebookPatch":
        return success(request.name, summarizeNotebookPatchResult(validatePatch(snapshot.document, requirePatch(request.args))));
      case "previewNotebookPatch":
        return success(request.name, summarizeNotebookPatchResult(previewPatch(snapshot.document, requirePatch(request.args))));
      case "explainNotebookPatch":
        return success(request.name, explainNotebookPatch(snapshot, requirePatch(request.args)));
      case "createAddChartPatch": {
        const chartVariables = requireStringArray(request.args, "variables");
        return success(
          request.name,
          createAddChartPatch(snapshot, {
            chartId: optionalString(request.args, "chartId"),
            runId: requireRunId(request.args),
            title: optionalString(request.args, "title") ?? `Chart: ${chartVariables.join(", ")}`,
            variables: chartVariables
          })
        );
      }
      case "createUpdateChartVariablesPatch":
        return success(
          request.name,
          createUpdateChartVariablesPatch(snapshot, {
            chartId: requireString(request.args, "chartId"),
            variables: requireStringArray(request.args, "variables")
          })
        );
      case "createAddEquationPatch":
        const addEquationArgs = requireAddEquationArgs(request.args);
        return success(
          request.name,
          createAddEquationPatch(snapshot, {
            description: optionalString(request.args, "description"),
            expression: addEquationArgs.expression,
            insertAfterVariable: optionalString(request.args, "insertAfterVariable"),
            modelId: requireString(request.args, "modelId"),
            name: addEquationArgs.name,
            role: optionalEquationRole(request.args, "role"),
            unitMeta: optionalUnitMeta(request.args, "unitMeta")
          })
        );
      case "createUpdateEquationPatch":
        const updateEquationArgs = requireUpdateEquationArgs(request.args);
        return success(
          request.name,
          createUpdateEquationPatch(snapshot, {
            description: optionalString(request.args, "description"),
            expression: updateEquationArgs.expression,
            modelId: requireString(request.args, "modelId"),
            role: optionalEquationRole(request.args, "role"),
            unitMeta: optionalUnitMeta(request.args, "unitMeta"),
            variable: updateEquationArgs.variable
          })
        );
      case "createRemoveEquationPatch":
        return success(
          request.name,
          createRemoveEquationPatch(snapshot, {
            allowDependents: optionalBoolean(request.args, "allowDependents") ?? false,
            modelId: requireString(request.args, "modelId"),
            variable: requireString(request.args, "variable")
          })
        );
      case "createUpdateVariableDescriptionPatch":
        return success(
          request.name,
          createUpdateVariableDescriptionPatch(snapshot, {
            description: requireString(request.args, "description"),
            modelId: requireString(request.args, "modelId"),
            variable: requireString(request.args, "variable")
          })
        );
      case "createAddExternalPatch":
        return success(
          request.name,
          createAddExternalPatch(snapshot, {
            description: optionalString(request.args, "description"),
            insertAfterVariable: optionalString(request.args, "insertAfterVariable"),
            kind: optionalExternalKind(request.args, "kind") ?? "constant",
            modelId: requireString(request.args, "modelId"),
            name: requireString(request.args, "name"),
            unitMeta: optionalUnitMeta(request.args, "unitMeta"),
            value: requireStringOrNumber(request.args, "value")
          })
        );
      case "createUpdateExternalPatch":
        return success(
          request.name,
          createUpdateExternalPatch(snapshot, {
            description: optionalString(request.args, "description"),
            kind: optionalExternalKind(request.args, "kind"),
            modelId: requireString(request.args, "modelId"),
            unitMeta: optionalUnitMeta(request.args, "unitMeta"),
            value: optionalStringOrNumber(request.args, "value"),
            variable: requireString(request.args, "variable")
          })
        );
      case "createAddInitialValuePatch":
        return success(
          request.name,
          createAddInitialValuePatch(snapshot, {
            insertAfterVariable: optionalString(request.args, "insertAfterVariable"),
            modelId: requireString(request.args, "modelId"),
            value: requireStringOrNumber(request.args, "value"),
            variable: requireString(request.args, "variable")
          })
        );
      case "createUpdateInitialValuePatch":
        return success(
          request.name,
          createUpdateInitialValuePatch(snapshot, {
            modelId: requireString(request.args, "modelId"),
            value: requireStringOrNumber(request.args, "value"),
            variable: requireString(request.args, "variable")
          })
        );
      case "createAddScenarioRunPatch":
        return success(
          request.name,
          createAddScenarioRunPatch(snapshot, {
            baselineRunCellId: optionalString(request.args, "baselineRunCellId"),
            baselineStartPeriod: optionalInteger(request.args, "baselineStartPeriod"),
            periods: requireInteger(request.args, "periods"),
            runId: optionalString(request.args, "runId"),
            scenario: requireScenarioDefinition(request.args),
            sourceModelCellId: optionalString(request.args, "sourceModelCellId"),
            sourceModelId: optionalString(request.args, "sourceModelId"),
            title: requireString(request.args, "title")
          })
        );
      case "createUpdateRunOptionsPatch":
        return success(
          request.name,
          createUpdateRunOptionsPatch(snapshot, {
            baselineRunCellId: optionalString(request.args, "baselineRunCellId"),
            baselineStartPeriod: optionalInteger(request.args, "baselineStartPeriod"),
            periods: optionalInteger(request.args, "periods"),
            runId: requireString(request.args, "runId"),
            scenario: optionalScenarioDefinition(request.args),
            solverMethod: optionalSolverMethod(request.args, "solverMethod"),
            tolerance: optionalStringOrNumber(request.args, "tolerance")
          })
        );
      case "createAddTablePatch":
        return success(
          request.name,
          createAddTablePatch(snapshot, {
            runId: requireString(request.args, "runId"),
            tableId: optionalString(request.args, "tableId"),
            title: requireString(request.args, "title"),
            variables: requireStringArray(request.args, "variables")
          })
        );
      case "createUpdateTableVariablesPatch":
        return success(
          request.name,
          createUpdateTableVariablesPatch(snapshot, {
            tableId: requireString(request.args, "tableId"),
            variables: requireStringArray(request.args, "variables")
          })
        );
      case "createAddMatrixRowPatch":
        return success(
          request.name,
          createAddMatrixRowPatch(snapshot, {
            band: optionalString(request.args, "band"),
            insertAfterLabel: optionalString(request.args, "insertAfterLabel"),
            label: requireString(request.args, "label"),
            matrixId: requireString(request.args, "matrixId"),
            values: requireStringArrayAllowEmpty(request.args, "values")
          })
        );
      case "createUpdateMatrixRowPatch":
        return success(
          request.name,
          createUpdateMatrixRowPatch(snapshot, {
            band: optionalString(request.args, "band"),
            label: requireString(request.args, "label"),
            matrixId: requireString(request.args, "matrixId"),
            newLabel: optionalString(request.args, "newLabel"),
            values: optionalStringArrayAllowEmpty(request.args, "values")
          })
        );
      case "createRemoveMatrixRowPatch":
        return success(
          request.name,
          createRemoveMatrixRowPatch(snapshot, {
            label: requireString(request.args, "label"),
            matrixId: requireString(request.args, "matrixId")
          })
        );
      case "createAddMarkdownCellPatch":
        return success(
          request.name,
          createAddMarkdownCellPatch(snapshot, {
            cellId: optionalString(request.args, "cellId"),
            insertAfterCellId: optionalString(request.args, "insertAfterCellId"),
            insertAfterCellTitle: optionalString(request.args, "insertAfterCellTitle"),
            source: requireString(request.args, "source"),
            title: requireString(request.args, "title")
          })
        );
      case "createUpdateMarkdownCellPatch":
        return success(
          request.name,
          createUpdateMarkdownCellPatch(snapshot, {
            cellId: optionalString(request.args, "cellId"),
            cellTitle: optionalString(request.args, "cellTitle"),
            source: optionalString(request.args, "source"),
            title: optionalString(request.args, "title")
          })
        );
      case "createUpdateChartOptionsPatch":
        return success(
          request.name,
          createUpdateChartOptionsPatch(snapshot, {
            axisMode: optionalChartAxisMode(request.args, "axisMode"),
            chartId: requireString(request.args, "chartId"),
            niceScale: optionalBoolean(request.args, "niceScale"),
            seriesRanges: optionalPlainObject(request.args, "seriesRanges"),
            sharedRange: optionalPlainObject(request.args, "sharedRange"),
            timeRangeInclusive: optionalIntegerPair(request.args, "timeRangeInclusive"),
            yAxisTickCount: optionalInteger(request.args, "yAxisTickCount")
          })
        );
      case "createUpdateNotebookTitlePatch":
        return success(request.name, createUpdateNotebookTitlePatch(snapshot, { title: requireString(request.args, "title") }));
      case "createUpdateVariableUnitMetaPatch":
        return success(
          request.name,
          createUpdateVariableUnitMetaPatch(snapshot, {
            displayUnit: optionalString(request.args, "displayUnit") ?? optionalString(request.args, "unit"),
            modelId: optionalString(request.args, "modelId"),
            stockFlow: optionalStockFlow(request.args, "stockFlow"),
            unitMeta: optionalUnitMeta(request.args, "unitMeta"),
            variable: requireString(request.args, "variable")
          })
        );
      case "createUpdateParameterPatch":
        return success(
          request.name,
          createUpdateParameterPatch(snapshot, {
            modelId: requireString(request.args, "modelId"),
            value: requireStringOrNumber(request.args, "value"),
            variable: requireString(request.args, "variable")
          })
        );
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

export function explainNotebookPatch(snapshot: NotebookAssistantSnapshot, patch: NotebookPatch) {
  const result = previewPatch(snapshot.document, patch);
  const summary = summarizeNotebookPatchResult(result);
  const actionParts = [];

  if (summary.summary.addedCells > 0) {
    actionParts.push(`adds ${summary.summary.addedCells} cell${summary.summary.addedCells === 1 ? "" : "s"}`);
  }
  if (summary.summary.changedCells > 0) {
    actionParts.push(`changes ${summary.summary.changedCells} cell${summary.summary.changedCells === 1 ? "" : "s"}`);
  }
  if (summary.summary.removedCells > 0) {
    actionParts.push(`removes ${summary.summary.removedCells} cell${summary.summary.removedCells === 1 ? "" : "s"}`);
  }

  const actionText = actionParts.length > 0 ? actionParts.join(", ") : "does not change notebook cells";
  const validationText = summary.ok
    ? "The patch is valid against the notebook schema and reference checks."
    : `The patch is not valid: ${summary.issues.map((issue) => issue.message).join("; ")}`;

  return {
    ...summary,
    explanation: `This patch ${actionText}. ${validationText}`
  };
}

export function createAddChartPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { chartId?: string; runId: string; title: string; variables: string[] }
) {
  const run = snapshot.document.cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.id === args.runId
  );
  if (!run) {
    throw new Error(`Unknown run: ${args.runId}`);
  }

  validateVariablesInRunResult(snapshot, run.id, args.variables);

  const chartId = args.chartId ?? createUniqueCellId(snapshot.document, slugifyCellId(args.title, "chart"));
  const patch: NotebookPatch = {
    description: `Add chart '${args.title}'.`,
    operations: [
      {
        op: "add",
        path: "/cells/-",
        value: {
          id: chartId,
          type: "chart",
          title: args.title,
          sourceRunCellId: run.id,
          variables: args.variables
        }
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateChartVariablesPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { chartId: string; variables: string[] }
) {
  const chart = resolveChartCell(snapshot, args.chartId, "chartId");

  validateVariablesInRunResult(snapshot, chart.sourceRunCellId, args.variables);

  const patch: NotebookPatch = {
    description: `Update chart '${chart.title}' variables.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(chart.id)}/variables`,
        value: args.variables
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddEquationPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    expression: string;
    insertAfterVariable?: string;
    modelId: string;
    name: string;
    role?: EquationRole;
    unitMeta?: UnitMeta;
  }
) {
  const equationsCell = resolveEquationsCell(snapshot, args.modelId);
  ensureModelVariableNameAvailable(snapshot, args.modelId, args.name);
  const insertIndex = resolveInsertAfterVariableIndex(equationsCell.equations, args.insertAfterVariable);
  const row = {
    id: createUniqueRowId(equationsCell.equations.map((equation) => equation.id), "eq", args.name),
    name: normalizeRequiredName(args.name, "name"),
    expression: normalizeRequiredName(args.expression, "expression"),
    ...(args.description ? { desc: args.description } : {}),
    ...(args.role ? { role: args.role } : {}),
    ...(args.unitMeta ? { unitMeta: args.unitMeta } : {})
  };

  validateEquationCandidate(snapshot, args.modelId, [...equationsCell.equations, row], row.name);

  const patch: NotebookPatch = {
    description: `Add equation '${row.name}' to model '${args.modelId}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(equationsCell.id)}/equations/${insertIndex}`,
        value: row
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateEquationPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    expression?: string;
    modelId: string;
    role?: EquationRole;
    unitMeta?: UnitMeta;
    variable: string;
  }
) {
  const equationsCell = resolveEquationsCell(snapshot, args.modelId);
  const { row, rowIndex } = resolveEquationRow(equationsCell, args.variable);
  if (args.description == null && args.expression == null && args.role == null && args.unitMeta == null) {
    throw new Error("Provide at least one equation field to update.");
  }

  const updatedRow = {
    ...row,
    ...(args.description != null ? { desc: args.description } : {}),
    ...(args.expression != null ? { expression: normalizeRequiredName(args.expression, "expression") } : {}),
    ...(args.role != null ? { role: args.role } : {}),
    ...(args.unitMeta != null ? { unitMeta: args.unitMeta } : {})
  };

  const nextEquations = equationsCell.equations.map((equation, index) => (index === rowIndex ? updatedRow : equation));
  validateEquationCandidate(snapshot, args.modelId, nextEquations, updatedRow.name);

  const patch: NotebookPatch = {
    description: `Update equation '${updatedRow.name}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(equationsCell.id)}/equations/${rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createRemoveEquationPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { allowDependents: boolean; modelId: string; variable: string }
) {
  const equationsCell = resolveEquationsCell(snapshot, args.modelId);
  const { row, rowIndex } = resolveEquationRow(equationsCell, args.variable);
  if (!args.allowDependents) {
    const dependents = listEquationDependents(snapshot, args.modelId, row.name);
    if (dependents.length > 0) {
      throw new Error(`Equation '${row.name}' is used by: ${dependents.join(", ")}. Set allowDependents to true to remove it anyway.`);
    }
  }

  const patch: NotebookPatch = {
    description: `Remove equation '${row.name}'.`,
    operations: [
      {
        op: "remove",
        path: `/cells/by-id/${escapeJsonPointerSegment(equationsCell.id)}/equations/${rowIndex}`
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateVariableDescriptionPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { description: string; modelId: string; variable: string }
) {
  const target = resolveVariableDescriptionTarget(snapshot, args.modelId, args.variable);
  const updatedRow = {
    ...target.row,
    desc: args.description
  };

  const patch: NotebookPatch = {
    description: `Update description for '${updatedRow.name}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(target.cell.id)}/${target.property}/${target.rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddExternalPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    insertAfterVariable?: string;
    kind: ExternalDef["kind"];
    modelId: string;
    name: string;
    unitMeta?: UnitMeta;
    value: string | number;
  }
) {
  const externalsCell = resolveExternalsCell(snapshot, args.modelId);
  ensureModelVariableNameAvailable(snapshot, args.modelId, args.name);
  const insertIndex = resolveInsertAfterVariableIndex(externalsCell.externals, args.insertAfterVariable);
  const row = {
    id: createUniqueRowId(externalsCell.externals.map((external) => external.id), "ext", args.name),
    name: normalizeRequiredName(args.name, "name"),
    kind: args.kind,
    valueText: String(args.value),
    ...(args.description ? { desc: args.description } : {}),
    ...(args.unitMeta ? { unitMeta: args.unitMeta } : {})
  };

  const patch: NotebookPatch = {
    description: `Add external '${row.name}' to model '${args.modelId}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(externalsCell.id)}/externals/${insertIndex}`,
        value: row
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateExternalPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    kind?: ExternalDef["kind"];
    modelId: string;
    unitMeta?: UnitMeta;
    value?: string | number;
    variable: string;
  }
) {
  const externalsCell = resolveExternalsCell(snapshot, args.modelId);
  const { row, rowIndex } = resolveExternalRow(externalsCell, args.variable);
  if (args.description == null && args.kind == null && args.unitMeta == null && args.value == null) {
    throw new Error("Provide at least one external field to update.");
  }

  const updatedRow = {
    ...row,
    ...(args.description != null ? { desc: args.description } : {}),
    ...(args.kind != null ? { kind: args.kind } : {}),
    ...(args.unitMeta != null ? { unitMeta: args.unitMeta } : {}),
    ...(args.value != null ? { valueText: String(args.value) } : {})
  };

  const patch: NotebookPatch = {
    description: `Update external '${updatedRow.name}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(externalsCell.id)}/externals/${rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddInitialValuePatch(
  snapshot: NotebookAssistantSnapshot,
  args: { insertAfterVariable?: string; modelId: string; value: string | number; variable: string }
) {
  const initialValuesCell = resolveInitialValuesCell(snapshot, args.modelId);
  ensureInitialValueNameAvailable(initialValuesCell, args.variable);
  const insertIndex = resolveInsertAfterVariableIndex(initialValuesCell.initialValues, args.insertAfterVariable);
  const row = {
    id: createUniqueRowId(initialValuesCell.initialValues.map((initialValue) => initialValue.id), "init", args.variable),
    name: normalizeRequiredName(args.variable, "variable"),
    valueText: String(args.value)
  };

  const patch: NotebookPatch = {
    description: `Add initial value '${row.name}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(initialValuesCell.id)}/initialValues/${insertIndex}`,
        value: row
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateInitialValuePatch(
  snapshot: NotebookAssistantSnapshot,
  args: { modelId: string; value: string | number; variable: string }
) {
  const initialValuesCell = resolveInitialValuesCell(snapshot, args.modelId);
  const { rowIndex } = resolveInitialValueRow(initialValuesCell, args.variable);

  const patch: NotebookPatch = {
    description: `Update initial value '${args.variable}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(initialValuesCell.id)}/initialValues/${rowIndex}/valueText`,
        value: String(args.value)
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddScenarioRunPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    baselineRunCellId?: string;
    baselineStartPeriod?: number;
    periods: number;
    runId?: string;
    scenario: ScenarioDefinition;
    sourceModelCellId?: string;
    sourceModelId?: string;
    title: string;
  }
) {
  const modelSource = resolveRunModelSource(snapshot, {
    sourceModelCellId: args.sourceModelCellId,
    sourceModelId: args.sourceModelId
  });
  const baselineRun = resolveBaselineRunForScenario(snapshot, {
    baselineRunCellId: args.baselineRunCellId,
    sourceModelCellId: modelSource.sourceModelCellId,
    sourceModelId: modelSource.sourceModelId
  });
  const runId = args.runId ?? createUniqueCellId(snapshot.document, slugifyCellId(args.title, "scenario-run"));

  const patch: NotebookPatch = {
    description: `Add scenario run '${args.title}'.`,
    operations: [
      {
        op: "add",
        path: "/cells/-",
        value: {
          id: runId,
          type: "run",
          title: args.title,
          mode: "scenario",
          baselineRunCellId: baselineRun.id,
          periods: args.periods,
          resultKey: runId,
          scenario: args.scenario,
          ...(args.baselineStartPeriod != null ? { baselineStartPeriod: args.baselineStartPeriod } : {}),
          ...(modelSource.sourceModelId ? { sourceModelId: modelSource.sourceModelId } : {}),
          ...(modelSource.sourceModelCellId ? { sourceModelCellId: modelSource.sourceModelCellId } : {})
        }
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateRunOptionsPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    baselineRunCellId?: string;
    baselineStartPeriod?: number;
    periods?: number;
    runId: string;
    scenario?: ScenarioDefinition;
    solverMethod?: SolverMethod;
    tolerance?: string | number;
  }
) {
  const run = resolveRunCell(snapshot, args.runId, "runId");
  const operations: NotebookPatchOperation[] = [];

  if (args.periods != null) {
    operations.push(createSetCellPropertyOperation(run, "periods", args.periods));
  }
  if (args.baselineStartPeriod != null) {
    operations.push(createSetCellPropertyOperation(run, "baselineStartPeriod", args.baselineStartPeriod));
  }
  if (args.baselineRunCellId != null) {
    const baselineRun = resolveRunCell(snapshot, args.baselineRunCellId, "baselineRunCellId");
    if (baselineRun.mode !== "baseline") {
      throw new Error(`Run '${baselineRun.id}' is not a baseline run.`);
    }
    operations.push(createSetCellPropertyOperation(run, "baselineRunCellId", baselineRun.id));
  }
  if (args.scenario != null) {
    operations.push(createSetCellPropertyOperation(run, "scenario", args.scenario));
  }
  if (args.solverMethod != null || args.tolerance != null) {
    const solverCell = resolveSolverCellForRun(snapshot, run);
    if (args.solverMethod != null) {
      operations.push(createSetNestedCellPropertyOperation(solverCell.id, "options", "solverMethod", solverCell.options.solverMethod, args.solverMethod));
    }
    if (args.tolerance != null) {
      operations.push(createSetNestedCellPropertyOperation(solverCell.id, "options", "toleranceText", solverCell.options.toleranceText, String(args.tolerance)));
    }
  }
  if (operations.length === 0) {
    throw new Error("Provide at least one run option to update.");
  }

  const patch: NotebookPatch = {
    description: `Update run '${run.title}' options.`,
    operations
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddTablePatch(
  snapshot: NotebookAssistantSnapshot,
  args: { runId: string; tableId?: string; title: string; variables: string[] }
) {
  const run = resolveRunCell(snapshot, args.runId, "runId");
  validateVariablesInRunResult(snapshot, run.id, args.variables);
  const tableId = args.tableId ?? createUniqueCellId(snapshot.document, slugifyCellId(args.title, "table"));

  const patch: NotebookPatch = {
    description: `Add table '${args.title}'.`,
    operations: [
      {
        op: "add",
        path: "/cells/-",
        value: {
          id: tableId,
          type: "table",
          title: args.title,
          sourceRunCellId: run.id,
          variables: args.variables
        }
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateTableVariablesPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { tableId: string; variables: string[] }
) {
  const table = resolveTableCell(snapshot, args.tableId, "tableId");
  validateVariablesInRunResult(snapshot, table.sourceRunCellId, args.variables);

  const patch: NotebookPatch = {
    description: `Update table '${table.title}' variables.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(table.id)}/variables`,
        value: args.variables
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddMatrixRowPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { band?: string; insertAfterLabel?: string; label: string; matrixId: string; values: string[] }
) {
  const matrix = resolveMatrixCell(snapshot, args.matrixId, "matrixId");
  if (matrix.rows.some((row) => row.label.trim() === args.label.trim())) {
    throw new Error(`Matrix '${matrix.id}' already has a row labeled '${args.label}'.`);
  }
  validateMatrixRowValues(matrix, args.values);
  const insertIndex = resolveInsertAfterLabelIndex(matrix.rows, args.insertAfterLabel);

  const patch: NotebookPatch = {
    description: `Add matrix row '${args.label}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(matrix.id)}/rows/${insertIndex}`,
        value: {
          label: args.label,
          values: args.values,
          ...(args.band ? { band: args.band } : {})
        }
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateMatrixRowPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { band?: string; label: string; matrixId: string; newLabel?: string; values?: string[] }
) {
  const matrix = resolveMatrixCell(snapshot, args.matrixId, "matrixId");
  const { row, rowIndex } = resolveMatrixRow(matrix, args.label);
  if (args.band == null && args.newLabel == null && args.values == null) {
    throw new Error("Provide at least one matrix row field to update.");
  }
  if (args.values) {
    validateMatrixRowValues(matrix, args.values);
  }
  if (args.newLabel && args.newLabel.trim() !== row.label.trim() && matrix.rows.some((candidate, index) => index !== rowIndex && candidate.label.trim() === args.newLabel?.trim())) {
    throw new Error(`Matrix '${matrix.id}' already has a row labeled '${args.newLabel}'.`);
  }

  const updatedRow = {
    ...row,
    ...(args.band != null ? { band: args.band } : {}),
    ...(args.newLabel != null ? { label: args.newLabel } : {}),
    ...(args.values != null ? { values: args.values } : {})
  };

  const patch: NotebookPatch = {
    description: `Update matrix row '${row.label}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(matrix.id)}/rows/${rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createRemoveMatrixRowPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { label: string; matrixId: string }
) {
  const matrix = resolveMatrixCell(snapshot, args.matrixId, "matrixId");
  const { rowIndex } = resolveMatrixRow(matrix, args.label);

  const patch: NotebookPatch = {
    description: `Remove matrix row '${args.label}'.`,
    operations: [
      {
        op: "remove",
        path: `/cells/by-id/${escapeJsonPointerSegment(matrix.id)}/rows/${rowIndex}`
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddMarkdownCellPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    cellId?: string;
    insertAfterCellId?: string;
    insertAfterCellTitle?: string;
    source: string;
    title: string;
  }
) {
  const insertIndex = resolveCellInsertIndex(snapshot, {
    insertAfterCellId: args.insertAfterCellId,
    insertAfterCellTitle: args.insertAfterCellTitle
  });
  const cellId = args.cellId ?? createUniqueCellId(snapshot.document, slugifyCellId(args.title, "markdown"));

  const patch: NotebookPatch = {
    description: `Add markdown cell '${args.title}'.`,
    operations: [
      {
        op: "add",
        path: insertIndex == null ? "/cells/-" : `/cells/${insertIndex}`,
        value: {
          id: cellId,
          type: "markdown",
          title: args.title,
          source: args.source
        }
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateMarkdownCellPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { cellId?: string; cellTitle?: string; source?: string; title?: string }
) {
  if (args.title == null && args.source == null) {
    throw new Error("Provide title or source to update the markdown cell.");
  }

  const markdownCell = resolveMarkdownCellFromArgs(snapshot, args);
  const operations: NotebookPatchOperation[] = [];
  if (args.title != null) {
    operations.push(createSetCellPropertyOperation(markdownCell, "title", args.title));
  }
  if (args.source != null) {
    operations.push(createSetCellPropertyOperation(markdownCell, "source", args.source));
  }

  const patch: NotebookPatch = {
    description: `Update markdown cell '${markdownCell.title}'.`,
    operations
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateChartOptionsPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    axisMode?: "shared" | "separate";
    chartId: string;
    niceScale?: boolean;
    seriesRanges?: Record<string, unknown>;
    sharedRange?: Record<string, unknown>;
    timeRangeInclusive?: [number, number];
    yAxisTickCount?: number;
  }
) {
  const chart = resolveChartCell(snapshot, args.chartId, "chartId");
  const operations: NotebookPatchOperation[] = [];
  if (args.axisMode != null) {
    operations.push(createSetCellPropertyOperation(chart, "axisMode", args.axisMode));
  }
  if (args.timeRangeInclusive != null) {
    operations.push(createSetCellPropertyOperation(chart, "timeRangeInclusive", args.timeRangeInclusive));
  }
  if (args.niceScale != null) {
    operations.push(createSetCellPropertyOperation(chart, "niceScale", args.niceScale));
  }
  if (args.yAxisTickCount != null) {
    operations.push(createSetCellPropertyOperation(chart, "yAxisTickCount", args.yAxisTickCount));
  }
  if (args.sharedRange != null) {
    operations.push(createSetCellPropertyOperation(chart, "sharedRange", args.sharedRange));
  }
  if (args.seriesRanges != null) {
    operations.push(createSetCellPropertyOperation(chart, "seriesRanges", args.seriesRanges));
  }
  if (operations.length === 0) {
    throw new Error("Provide at least one chart option to update.");
  }

  const patch: NotebookPatch = {
    description: `Update chart '${chart.title}' options.`,
    operations
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateNotebookTitlePatch(
  snapshot: NotebookAssistantSnapshot,
  args: { title: string }
) {
  const patch: NotebookPatch = {
    description: `Update notebook title to '${args.title}'.`,
    operations: [
      {
        op: "replace",
        path: "/title",
        value: args.title
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateParameterPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { modelId: string; variable: string; value: string | number }
) {
  const cellIndex = snapshot.document.cells.findIndex(
    (cell) => cell.type === "externals" && cell.modelId === args.modelId
  );
  const externalsCell = snapshot.document.cells[cellIndex];
  if (!externalsCell || externalsCell.type !== "externals") {
    throw new Error(`Unknown externals model id: ${args.modelId}`);
  }

  const rowIndex = externalsCell.externals.findIndex((external) => external.name.trim() === args.variable);
  if (rowIndex < 0) {
    throw new Error(`Unknown parameter '${args.variable}' for model '${args.modelId}'.`);
  }

  const patch: NotebookPatch = {
    description: `Update parameter '${args.variable}' to ${String(args.value)}.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(externalsCell.id)}/externals/${rowIndex}/valueText`,
        value: String(args.value)
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateVariableUnitMetaPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { displayUnit?: string; modelId?: string; stockFlow?: UnitMeta["stockFlow"]; unitMeta?: UnitMeta; variable: string }
) {
  const target = resolveVariableUnitMetaTarget(snapshot, args.variable, args.modelId);
  const existingUnitMeta = target.row.unitMeta;
  const unitMeta = normalizeVariableUnitMetaPatchValue({
    displayUnit: args.displayUnit,
    existingUnitMeta,
    stockFlow: args.stockFlow,
    unitMeta: args.unitMeta
  });

  const patch: NotebookPatch = {
    description: `Update '${target.variable}' unit metadata.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(target.cell.id)}/${target.property}/${target.rowIndex}/unitMeta`,
        value: unitMeta
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

function resolveVariableUnitMetaTarget(
  snapshot: NotebookAssistantSnapshot,
  variable: string,
  modelId?: string
) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  const targets: VariableUnitMetaTarget[] = [];

  for (const cell of snapshot.document.cells) {
    if (cell.type === "equations" && (!modelId || cell.modelId === modelId)) {
      const rowIndex = cell.equations.findIndex((equation) => equation.name.trim() === normalizedVariable);
      if (rowIndex >= 0) {
        const row = cell.equations[rowIndex];
        if (row) {
          targets.push({ cell, property: "equations", row, rowIndex });
        }
      }
    }
    if (cell.type === "externals" && (!modelId || cell.modelId === modelId)) {
      const rowIndex = cell.externals.findIndex((external) => external.name.trim() === normalizedVariable);
      if (rowIndex >= 0) {
        const row = cell.externals[rowIndex];
        if (row) {
          targets.push({ cell, property: "externals", row, rowIndex });
        }
      }
    }
  }

  if (targets.length === 0) {
    throw new Error(modelId ? `Unknown variable '${normalizedVariable}' for model '${modelId}'.` : `Unknown variable: ${normalizedVariable}`);
  }
  if (!modelId && new Set(targets.map((target) => target.cell.modelId)).size > 1) {
    throw new Error(`Variable '${normalizedVariable}' appears in multiple models; provide modelId.`);
  }

  return {
    ...(targets[0] as VariableUnitMetaTarget),
    variable: normalizedVariable
  };
}

function resolveVariableDescriptionTarget(
  snapshot: NotebookAssistantSnapshot,
  modelId: string,
  variable: string
) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  const targets: VariableDescriptionTarget[] = [];
  const equationsCell = resolveOptionalModelCell(snapshot, modelId, "equations");
  const externalsCell = resolveOptionalModelCell(snapshot, modelId, "externals");

  if (equationsCell) {
    const rowIndex = equationsCell.equations.findIndex((equation) => equation.name.trim() === normalizedVariable);
    if (rowIndex >= 0) {
      const row = equationsCell.equations[rowIndex];
      if (row) {
        targets.push({ cell: equationsCell, property: "equations", row, rowIndex });
      }
    }
  }
  if (externalsCell) {
    const rowIndex = externalsCell.externals.findIndex((external) => external.name.trim() === normalizedVariable);
    if (rowIndex >= 0) {
      const row = externalsCell.externals[rowIndex];
      if (row) {
        targets.push({ cell: externalsCell, property: "externals", row, rowIndex });
      }
    }
  }

  if (targets.length === 0) {
    throw new Error(`Unknown variable '${normalizedVariable}' for model '${modelId}'.`);
  }
  if (targets.length > 1) {
    throw new Error(`Variable '${normalizedVariable}' is ambiguous in model '${modelId}'.`);
  }

  return targets[0] as VariableDescriptionTarget;
}

function normalizeVariableUnitMetaPatchValue(args: {
  displayUnit?: string;
  existingUnitMeta?: UnitMeta;
  stockFlow?: UnitMeta["stockFlow"];
  unitMeta?: UnitMeta;
}): UnitMeta {
  const base = args.unitMeta ?? args.existingUnitMeta ?? {};
  const displayUnit = args.displayUnit ?? base.displayUnit;
  return {
    ...base,
    ...(displayUnit ? { displayUnit } : {}),
    signature: base.signature ?? {},
    stockFlow: args.stockFlow ?? base.stockFlow ?? "aux"
  };
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

function resolveOptionalModelCell<T extends NotebookCell["type"]>(
  snapshot: NotebookAssistantSnapshot,
  modelId: string,
  type: T
): Extract<NotebookCell, { type: T; modelId: string }> | null {
  const normalizedModelId = normalizeRequiredName(modelId, "modelId");
  const matches = snapshot.document.cells.filter(
    (cell): cell is Extract<NotebookCell, { type: T; modelId: string }> =>
      cell.type === type && "modelId" in cell && cell.modelId === normalizedModelId
  );
  if (matches.length > 1) {
    throw new Error(`Model '${normalizedModelId}' has multiple '${type}' cells; use a more specific helper.`);
  }
  return matches[0] ?? null;
}

function resolveEquationsCell(snapshot: NotebookAssistantSnapshot, modelId: string): EquationsCell {
  const cell = resolveOptionalModelCell(snapshot, modelId, "equations");
  if (!cell) {
    throw new Error(`Unknown equations model id: ${modelId}`);
  }
  return cell;
}

function resolveExternalsCell(snapshot: NotebookAssistantSnapshot, modelId: string): ExternalsCell {
  const cell = resolveOptionalModelCell(snapshot, modelId, "externals");
  if (!cell) {
    throw new Error(`Unknown externals model id: ${modelId}`);
  }
  return cell;
}

function resolveInitialValuesCell(snapshot: NotebookAssistantSnapshot, modelId: string): InitialValuesCell {
  const cell = resolveOptionalModelCell(snapshot, modelId, "initial-values");
  if (!cell) {
    throw new Error(`Unknown initial-values model id: ${modelId}`);
  }
  return cell;
}

function resolveSolverCell(snapshot: NotebookAssistantSnapshot, modelId: string): SolverCell {
  const cell = resolveOptionalModelCell(snapshot, modelId, "solver");
  if (!cell) {
    throw new Error(`Unknown solver model id: ${modelId}`);
  }
  return cell;
}

function resolveSolverCellForRun(snapshot: NotebookAssistantSnapshot, run: RunCell): SolverCell {
  if (run.sourceModelId) {
    return resolveSolverCell(snapshot, run.sourceModelId);
  }
  if (run.sourceModelCellId) {
    const matchingRun = snapshot.document.cells.find(
      (cell): cell is RunCell =>
        cell.type === "run" && cell.sourceModelCellId === run.sourceModelCellId && Boolean(cell.sourceModelId)
    );
    if (matchingRun?.sourceModelId) {
      return resolveSolverCell(snapshot, matchingRun.sourceModelId);
    }
  }
  throw new Error(`Run '${run.id}' does not resolve to a solver cell.`);
}

function resolveRunModelSource(
  snapshot: NotebookAssistantSnapshot,
  args: { sourceModelCellId?: string; sourceModelId?: string }
) {
  const sourceModelId = args.sourceModelId?.trim();
  const sourceModelCellId = args.sourceModelCellId?.trim();
  if (!sourceModelId && !sourceModelCellId) {
    throw new Error("Provide sourceModelId or sourceModelCellId.");
  }
  if (sourceModelId) {
    const hasModel = snapshot.document.cells.some(
      (cell) => "modelId" in cell && typeof cell.modelId === "string" && cell.modelId === sourceModelId
    );
    if (!hasModel) {
      throw new Error(`Unknown model id: ${sourceModelId}`);
    }
  }
  if (sourceModelCellId) {
    const modelCell = snapshot.document.cells.find((cell) => cell.type === "model" && cell.id === sourceModelCellId);
    if (!modelCell) {
      throw new Error(`Unknown model cell: ${sourceModelCellId}`);
    }
  }

  return {
    ...(sourceModelId ? { sourceModelId } : {}),
    ...(sourceModelCellId ? { sourceModelCellId } : {})
  };
}

function resolveBaselineRunForScenario(
  snapshot: NotebookAssistantSnapshot,
  args: { baselineRunCellId?: string; sourceModelCellId?: string; sourceModelId?: string }
) {
  if (args.baselineRunCellId) {
    const run = resolveRunCell(snapshot, args.baselineRunCellId, "baselineRunCellId");
    if (run.mode !== "baseline") {
      throw new Error(`Run '${run.id}' is not a baseline run.`);
    }
    return run;
  }

  const candidates = snapshot.document.cells.filter((cell): cell is RunCell => {
    if (cell.type !== "run" || cell.mode !== "baseline") {
      return false;
    }
    if (args.sourceModelId && cell.sourceModelId === args.sourceModelId) {
      return true;
    }
    if (args.sourceModelCellId && cell.sourceModelCellId === args.sourceModelCellId) {
      return true;
    }
    return false;
  });
  if (candidates.length === 0) {
    throw new Error("No baseline run found for the requested model.");
  }
  if (candidates.length > 1) {
    throw new Error("Multiple baseline runs match the requested model; provide baselineRunCellId.");
  }
  return candidates[0] as RunCell;
}

function resolveEquationRow(cell: EquationsCell, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  const rowIndex = cell.equations.findIndex((equation) => equation.name.trim() === normalizedVariable);
  if (rowIndex < 0) {
    throw new Error(`Unknown equation '${normalizedVariable}' for model '${cell.modelId}'.`);
  }
  return { row: cell.equations[rowIndex] as EquationsCell["equations"][number], rowIndex };
}

function resolveExternalRow(cell: ExternalsCell, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  const rowIndex = cell.externals.findIndex((external) => external.name.trim() === normalizedVariable);
  if (rowIndex < 0) {
    throw new Error(`Unknown parameter '${normalizedVariable}' for model '${cell.modelId}'.`);
  }
  return { row: cell.externals[rowIndex] as ExternalsCell["externals"][number], rowIndex };
}

function resolveInitialValueRow(cell: InitialValuesCell, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  const rowIndex = cell.initialValues.findIndex((initialValue) => initialValue.name.trim() === normalizedVariable);
  if (rowIndex < 0) {
    throw new Error(`Unknown initial value '${normalizedVariable}' for model '${cell.modelId}'.`);
  }
  return { row: cell.initialValues[rowIndex] as InitialValuesCell["initialValues"][number], rowIndex };
}

function resolveRunCell(snapshot: NotebookAssistantSnapshot, reference: string, label: string): RunCell {
  return resolveCellByIdOrTitle(snapshot, reference, label, "run", (cell): cell is RunCell => cell.type === "run");
}

function resolveChartCell(snapshot: NotebookAssistantSnapshot, reference: string, label: string): ChartCell {
  return resolveCellByIdOrTitle(snapshot, reference, label, "chart", (cell): cell is ChartCell => cell.type === "chart");
}

function resolveTableCell(snapshot: NotebookAssistantSnapshot, reference: string, label: string): TableCell {
  return resolveCellByIdOrTitle(snapshot, reference, label, "table", (cell): cell is TableCell => cell.type === "table");
}

function resolveMatrixCell(snapshot: NotebookAssistantSnapshot, reference: string, label: string): MatrixCell {
  return resolveCellByIdOrTitle(snapshot, reference, label, "matrix", (cell): cell is MatrixCell => cell.type === "matrix");
}

function resolveMarkdownCell(snapshot: NotebookAssistantSnapshot, reference: string, label: string): MarkdownCell {
  return resolveCellByIdOrTitle(snapshot, reference, label, "markdown cell", (cell): cell is MarkdownCell => cell.type === "markdown");
}

function resolveMarkdownCellFromArgs(
  snapshot: NotebookAssistantSnapshot,
  args: { cellId?: string; cellTitle?: string }
) {
  if (args.cellId) {
    return resolveMarkdownCell(snapshot, args.cellId, "cellId");
  }
  if (args.cellTitle) {
    return resolveMarkdownCell(snapshot, args.cellTitle, "cellTitle");
  }
  throw new Error("Provide cellId or cellTitle.");
}

function resolveCellByIdOrTitle<T extends NotebookCell>(
  snapshot: NotebookAssistantSnapshot,
  reference: string,
  label: string,
  typeLabel: string,
  predicate: (cell: NotebookCell) => cell is T
): T {
  const normalizedReference = normalizeRequiredName(reference, label);
  const byId = snapshot.document.cells.find((cell): cell is T => predicate(cell) && cell.id === normalizedReference);
  if (byId) {
    return byId;
  }

  const byTitle = snapshot.document.cells.filter(
    (cell): cell is T => predicate(cell) && cell.title.trim() === normalizedReference
  );
  if (byTitle.length === 1) {
    return byTitle[0] as T;
  }
  if (byTitle.length > 1) {
    throw new Error(`Ambiguous ${typeLabel} '${normalizedReference}'; provide the cell id.`);
  }
  throw new Error(`Unknown ${typeLabel}: ${normalizedReference}`);
}

function resolveMatrixRow(matrix: MatrixCell, label: string) {
  const normalizedLabel = normalizeRequiredName(label, "label");
  const matches = matrix.rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => row.label.trim() === normalizedLabel);
  if (matches.length === 0) {
    throw new Error(`Unknown matrix row '${normalizedLabel}' for matrix '${matrix.id}'.`);
  }
  if (matches.length > 1) {
    throw new Error(`Matrix '${matrix.id}' has multiple rows labeled '${normalizedLabel}'.`);
  }
  return matches[0] as { row: MatrixCell["rows"][number]; rowIndex: number };
}

function resolveCellInsertIndex(
  snapshot: NotebookAssistantSnapshot,
  args: { insertAfterCellId?: string; insertAfterCellTitle?: string }
) {
  if (args.insertAfterCellId && args.insertAfterCellTitle) {
    throw new Error("Provide only one of insertAfterCellId or insertAfterCellTitle.");
  }
  if (args.insertAfterCellId) {
    const cell = snapshot.document.cells.find((candidate) => candidate.id === args.insertAfterCellId);
    if (!cell) {
      throw new Error(`Unknown cell id: ${args.insertAfterCellId}`);
    }
    return snapshot.document.cells.findIndex((candidate) => candidate.id === cell.id) + 1;
  }
  if (args.insertAfterCellTitle) {
    const matches = snapshot.document.cells.filter((candidate) => candidate.title.trim() === args.insertAfterCellTitle?.trim());
    if (matches.length === 0) {
      throw new Error(`Unknown cell title: ${args.insertAfterCellTitle}`);
    }
    if (matches.length > 1) {
      throw new Error(`Ambiguous cell title '${args.insertAfterCellTitle}'; provide insertAfterCellId.`);
    }
    return snapshot.document.cells.findIndex((candidate) => candidate.id === matches[0]?.id) + 1;
  }
  return null;
}

function createSetCellPropertyOperation(
  cell: NotebookCell,
  property: string,
  value: unknown
): NotebookPatchOperation {
  return {
    op: Object.prototype.hasOwnProperty.call(cell, property) ? "replace" : "add",
    path: `/cells/by-id/${escapeJsonPointerSegment(cell.id)}/${property}`,
    value
  };
}

function createSetNestedCellPropertyOperation(
  cellId: string,
  property: string,
  nestedProperty: string,
  currentValue: unknown,
  value: unknown
): NotebookPatchOperation {
  return {
    op: currentValue === undefined ? "add" : "replace",
    path: `/cells/by-id/${escapeJsonPointerSegment(cellId)}/${property}/${nestedProperty}`,
    value
  };
}

function resolveInsertAfterVariableIndex(
  rows: Array<{ name: string }>,
  insertAfterVariable?: string
) {
  if (!insertAfterVariable) {
    return rows.length;
  }
  const normalizedVariable = normalizeRequiredName(insertAfterVariable, "insertAfterVariable");
  const rowIndex = rows.findIndex((row) => row.name.trim() === normalizedVariable);
  if (rowIndex < 0) {
    throw new Error(`Unknown variable '${normalizedVariable}' for insertion point.`);
  }
  return rowIndex + 1;
}

function resolveInsertAfterLabelIndex(
  rows: Array<{ label: string }>,
  insertAfterLabel?: string
) {
  if (!insertAfterLabel) {
    return rows.length;
  }
  const normalizedLabel = normalizeRequiredName(insertAfterLabel, "insertAfterLabel");
  const rowIndex = rows.findIndex((row) => row.label.trim() === normalizedLabel);
  if (rowIndex < 0) {
    throw new Error(`Unknown row label '${normalizedLabel}' for insertion point.`);
  }
  return rowIndex + 1;
}

function ensureModelVariableNameAvailable(snapshot: NotebookAssistantSnapshot, modelId: string, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "name");
  const equationsCell = resolveOptionalModelCell(snapshot, modelId, "equations");
  const externalsCell = resolveOptionalModelCell(snapshot, modelId, "externals");
  if (equationsCell?.equations.some((equation) => equation.name.trim() === normalizedVariable)) {
    throw new Error(`Model '${modelId}' already defines equation '${normalizedVariable}'.`);
  }
  if (externalsCell?.externals.some((external) => external.name.trim() === normalizedVariable)) {
    throw new Error(`Model '${modelId}' already defines external '${normalizedVariable}'.`);
  }
}

function ensureInitialValueNameAvailable(cell: InitialValuesCell, variable: string) {
  const normalizedVariable = normalizeRequiredName(variable, "variable");
  if (cell.initialValues.some((row) => row.name.trim() === normalizedVariable)) {
    throw new Error(`Model '${cell.modelId}' already has an initial value for '${normalizedVariable}'.`);
  }
}

function validateEquationCandidate(
  snapshot: NotebookAssistantSnapshot,
  modelId: string,
  equations: EquationsCell["equations"],
  variable: string
) {
  const graph = buildDependencyGraph({
    equations,
    externals: resolveOptionalModelCell(snapshot, modelId, "externals")?.externals ?? [],
    initialValues: resolveOptionalModelCell(snapshot, modelId, "initial-values")?.initialValues ?? []
  });
  if (graph.errors.length > 0) {
    const relevantError = graph.errors.find((error) => error.includes(`(${variable})`)) ?? graph.errors[0];
    throw new Error(relevantError ?? "Unable to validate equation.");
  }
}

function listEquationDependents(
  snapshot: NotebookAssistantSnapshot,
  modelId: string,
  variable: string
) {
  const graph = buildDependencyGraph({
    equations: resolveEquationsCell(snapshot, modelId).equations,
    externals: resolveOptionalModelCell(snapshot, modelId, "externals")?.externals ?? [],
    initialValues: resolveOptionalModelCell(snapshot, modelId, "initial-values")?.initialValues ?? []
  });
  return Array.from(
    new Set(
      graph.edges
        .filter((edge) => edge.sourceId === variable)
        .map((edge) => edge.targetId)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function validateMatrixRowValues(matrix: MatrixCell, values: string[]) {
  if (values.length !== matrix.columns.length) {
    throw new Error(`Matrix '${matrix.id}' expects ${matrix.columns.length} values, received ${values.length}.`);
  }
}

function createUniqueRowId(existingIds: string[], prefix: string, variable: string): string {
  return createUniqueId(new Set(existingIds), `${prefix}-${slugifyCellId(variable, prefix)}`);
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

function requireRunId(args: Record<string, unknown> | undefined): string {
  for (const key of ["runId", "sourceRunCellId", "runCellId", "sourceRunId", "resultRunId"]) {
    const value = optionalString(args, key);
    if (value) {
      return value;
    }
  }

  throw new Error("Tool argument 'runId' must be a non-empty string.");
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

function firstOptionalString(
  args: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = optionalString(args, key);
    if (value != null) {
      return value;
    }
  }
  return undefined;
}

function requireAddEquationArgs(
  args: Record<string, unknown> | undefined
): { expression: string; name: string } {
  const parsedEquation = parseEquationArgument(args);
  const name = firstOptionalString(args, ["name", "variable", "lhs"]) ?? parsedEquation?.name;
  const expression =
    firstOptionalString(args, ["expression", "rhs", "formula", "valueText"]) ?? parsedEquation?.expression;

  if (!name) {
    throw new Error("Tool argument 'name' must be a non-empty string.");
  }
  if (!expression) {
    throw new Error("Tool argument 'expression' must be a non-empty string.");
  }

  return { expression, name };
}

function requireUpdateEquationArgs(
  args: Record<string, unknown> | undefined
): { expression?: string; variable: string } {
  const parsedEquation = parseEquationArgument(args);
  const variable = firstOptionalString(args, ["variable", "name", "lhs"]) ?? parsedEquation?.name;
  const expression =
    firstOptionalString(args, ["expression", "rhs", "formula", "valueText"]) ?? parsedEquation?.expression;

  if (!variable) {
    throw new Error("Tool argument 'variable' must be a non-empty string.");
  }

  return { expression, variable };
}

function parseEquationArgument(
  args: Record<string, unknown> | undefined
): { expression: string; name: string } | null {
  const equationText = firstOptionalString(args, ["equation", "equationText"]);
  if (!equationText) {
    return null;
  }
  const separatorIndex = equationText.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex >= equationText.length - 1) {
    throw new Error("Tool argument 'equation' must use the form 'name = expression'.");
  }
  const name = equationText.slice(0, separatorIndex).trim();
  const expression = equationText.slice(separatorIndex + 1).trim();
  if (!name || !expression) {
    throw new Error("Tool argument 'equation' must use the form 'name = expression'.");
  }
  return { expression, name };
}

function requireInteger(args: Record<string, unknown> | undefined, key: string): number {
  const value = optionalInteger(args, key);
  if (value == null) {
    throw new Error(`Tool argument '${key}' must be an integer.`);
  }
  return value;
}

function requireStringArray(args: Record<string, unknown> | undefined, key: string): string[] {
  const value = args?.[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Tool argument '${key}' must be a non-empty string array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a non-empty string.`);
    }
    return entry.trim();
  });
}

function optionalStringArray(args: Record<string, unknown> | undefined, key: string): string[] | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be a string array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a non-empty string.`);
    }
    return entry.trim();
  });
}

function requireStringArrayAllowEmpty(args: Record<string, unknown> | undefined, key: string): string[] {
  const value = args?.[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Tool argument '${key}' must be a non-empty string array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a string.`);
    }
    return entry;
  });
}

function optionalStringArrayAllowEmpty(
  args: Record<string, unknown> | undefined,
  key: string
): string[] | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be a string array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a string.`);
    }
    return entry;
  });
}

function requireStringOrNumber(
  args: Record<string, unknown> | undefined,
  key: string
): string | number {
  const value = args?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  throw new Error(`Tool argument '${key}' must be a finite number or non-empty string.`);
}

function optionalStringOrNumber(
  args: Record<string, unknown> | undefined,
  key: string
): string | number | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  return requireStringOrNumber(args, key);
}

function optionalBoolean(args: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Tool argument '${key}' must be a boolean.`);
  }
  return value;
}

function optionalEquationRole(args: Record<string, unknown> | undefined, key: string): EquationRole | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (!(["accumulation", "identity", "target", "definition", "behavioral"] as const).includes(value as EquationRole)) {
    throw new Error(`Tool argument '${key}' must be a valid equation role.`);
  }
  return value as EquationRole;
}

function optionalExternalKind(args: Record<string, unknown> | undefined, key: string): ExternalDef["kind"] | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "constant" && value !== "series") {
    throw new Error(`Tool argument '${key}' must be constant or series.`);
  }
  return value;
}

function optionalSolverMethod(args: Record<string, unknown> | undefined, key: string): SolverMethod | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "GAUSS_SEIDEL" && value !== "BROYDEN" && value !== "NEWTON") {
    throw new Error(`Tool argument '${key}' must be GAUSS_SEIDEL, BROYDEN, or NEWTON.`);
  }
  return value;
}

function optionalIntegerPair(
  args: Record<string, unknown> | undefined,
  key: string
): [number, number] | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== 2 || !value.every((entry) => typeof entry === "number" && Number.isInteger(entry))) {
    throw new Error(`Tool argument '${key}' must be a two-item integer array.`);
  }
  const start = value[0] as number;
  const end = value[1] as number;
  if (end < start) {
    throw new Error(`Tool argument '${key}' must have end greater than or equal to start.`);
  }
  return [start, end];
}

function optionalChartAxisMode(
  args: Record<string, unknown> | undefined,
  key: string
): "shared" | "separate" | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "shared" && value !== "separate") {
    throw new Error(`Tool argument '${key}' must be shared or separate.`);
  }
  return value;
}

function optionalPlainObject(
  args: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalScenarioDefinition(args: Record<string, unknown> | undefined): ScenarioDefinition | undefined {
  const scenario = args?.scenario;
  const shocks = args?.shocks;
  if (scenario == null && shocks == null) {
    return undefined;
  }
  return requireScenarioDefinition(args);
}

function requireScenarioDefinition(args: Record<string, unknown> | undefined): ScenarioDefinition {
  const scenarioValue = args?.scenario;
  const scenarioObject = scenarioValue && typeof scenarioValue === "object" && !Array.isArray(scenarioValue)
    ? (scenarioValue as Record<string, unknown>)
    : undefined;
  const shocksValue = args?.shocks ?? scenarioObject?.shocks;
  if (!Array.isArray(shocksValue) || shocksValue.length === 0) {
    throw new Error("Tool arguments must include non-empty scenario shocks.");
  }

  return {
    shocks: shocksValue.map((shock, shockIndex) => normalizeShockDefinition(shock, shockIndex))
  };
}

function normalizeShockDefinition(shock: unknown, shockIndex: number): ScenarioDefinition["shocks"][number] {
  if (!shock || typeof shock !== "object" || Array.isArray(shock)) {
    throw new Error(`Scenario shock ${shockIndex + 1} must be an object.`);
  }
  const record = shock as Record<string, unknown>;
  const rangeInclusive = record.rangeInclusive;
  const start = Array.isArray(rangeInclusive) ? rangeInclusive[0] : record.startPeriodInclusive;
  const end = Array.isArray(rangeInclusive) ? rangeInclusive[1] : record.endPeriodInclusive;
  if (typeof start !== "number" || !Number.isInteger(start) || typeof end !== "number" || !Number.isInteger(end)) {
    throw new Error(`Scenario shock ${shockIndex + 1} must define integer start and end periods.`);
  }
  if (end < start) {
    throw new Error(`Scenario shock ${shockIndex + 1} has an invalid range.`);
  }
  const variables = record.variables;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new Error(`Scenario shock ${shockIndex + 1} must define variables.`);
  }

  return {
    startPeriodInclusive: start,
    endPeriodInclusive: end,
    variables: Object.fromEntries(
      Object.entries(variables).map(([name, variableDef]) => [name, normalizeShockVariableDefinition(variableDef, name, shockIndex)])
    )
  };
}

function normalizeShockVariableDefinition(
  variableDef: unknown,
  name: string,
  shockIndex: number
): ScenarioDefinition["shocks"][number]["variables"][string] {
  if (!variableDef || typeof variableDef !== "object" || Array.isArray(variableDef)) {
    throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must be an object.`);
  }
  const record = variableDef as Record<string, unknown>;
  const inferredKind = record.kind ?? (Array.isArray(record.values) ? "series" : record.value != null ? "constant" : undefined);
  if (inferredKind !== "constant" && inferredKind !== "series") {
    throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must use kind constant or series.`);
  }
  if (inferredKind === "constant") {
    const value = typeof record.value === "number" ? record.value : typeof record.value === "string" ? Number(record.value) : NaN;
    if (!Number.isFinite(value)) {
      throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must have a finite constant value.`);
    }
    return { kind: "constant", value };
  }

  if (!Array.isArray(record.values) || record.values.length === 0 || !record.values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must have a finite numeric values array.`);
  }
  return { kind: "series", values: record.values as number[] };
}

function optionalStockFlow(args: Record<string, unknown> | undefined, key: string): UnitMeta["stockFlow"] | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "stock" && value !== "flow" && value !== "aux") {
    throw new Error(`Tool argument '${key}' must be stock, flow, or aux.`);
  }
  return value;
}

function optionalUnitMeta(args: Record<string, unknown> | undefined, key: string): UnitMeta | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be an object.`);
  }
  return value as UnitMeta;
}

function requirePatch(args: Record<string, unknown> | undefined): NotebookPatch {
  const value = args?.patch;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool argument 'patch' must be a notebook patch object.");
  }

  const operations = (value as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) {
    throw new Error("Tool argument 'patch.operations' must be an array.");
  }

  return value as NotebookPatch;
}

function summarizeNotebookPatchResult(result: NotebookPatchResult) {
  return {
    ok: result.ok,
    issues: result.issues,
    summary: result.summary
  };
}

function summarizeNotebookPatchProposal(snapshot: NotebookAssistantSnapshot, patch: NotebookPatch) {
  return {
    patch,
    preview: summarizeNotebookPatchResult(previewPatch(snapshot.document, patch))
  };
}

function slugifyCellId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function createUniqueCellId(document: NotebookDocument, baseId: string): string {
  return createUniqueId(new Set(document.cells.map((cell) => cell.id)), baseId);
}

function createUniqueId(existingIds: Set<string>, baseId: string): string {
  let candidate = baseId;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function validateVariablesInRunResult(
  snapshot: NotebookAssistantSnapshot,
  runId: string,
  variables: string[]
): void {
  const output = snapshot.runtime.outputs[runId];
  if (output?.type !== "result") {
    return;
  }

  const seriesNames = new Set(Object.keys(output.result.series));
  const missingVariables = variables.filter((variable) => !seriesNames.has(variable));
  if (missingVariables.length > 0) {
    throw new Error(`Run '${runId}' does not include series: ${missingVariables.join(", ")}`);
  }
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
