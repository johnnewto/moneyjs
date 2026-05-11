import { previewNotebookPatch as previewPatch, validateNotebookPatch as validatePatch, type NotebookPatch } from "../notebookPatch";
import { requireAddEquationArgs, requireInteger, requirePatch, requireRunId, requireScenarioDefinition, requireString, requireStringArray, requireStringArrayAllowEmpty, requireStringOrNumber, requireUpdateEquationArgs, optionalBoolean, optionalChartAxisMode, optionalEquationRole, optionalExternalKind, optionalInteger, optionalIntegerPair, optionalPlainObject, optionalScenarioDefinition, optionalSolverMethod, optionalStockFlow, optionalString, optionalStringArrayAllowEmpty, optionalStringOrNumber, optionalUnitMeta } from "./args";
import { createAddChartPatch, createAddMatrixRowPatch, createAddTablePatch, createRemoveMatrixRowPatch, createUpdateChartOptionsPatch, createUpdateChartVariablesPatch, createUpdateMatrixRowPatch, createUpdateTableVariablesPatch } from "./viewPatchBuilders";
import { createAddEquationPatch, createAddExternalPatch, createAddInitialValuePatch, createRemoveEquationPatch, createUpdateEquationPatch, createUpdateExternalPatch, createUpdateInitialValuePatch, createUpdateParameterPatch, createUpdateVariableDescriptionPatch, createUpdateVariableUnitMetaPatch } from "./modelPatchBuilders";
import { createAddMarkdownCellPatch, createAddScenarioRunPatch, createUpdateMarkdownCellPatch, createUpdateNotebookTitlePatch, createUpdateRunOptionsPatch } from "./notebookPatchBuilders";
import { explainNotebookPatch } from "./patchTools";
import { getCurrentValues, getDependencyGraph, getEquation, getMatrix, getNotebookSummary, getSeries, getSeriesWindow, getVariableMetadata, listCharts, listRuns, listVariables } from "./readTools";
import { summarizeNotebookPatchResult } from "./shared";
import { NOTEBOOK_ASSISTANT_TOOL_NAMES, type NotebookAssistantSnapshot, type NotebookAssistantToolName, type NotebookAssistantToolRequest, type NotebookAssistantToolResult } from "./types";

export interface NotebookAssistantToolBatchResult {
  proposedPatch: NotebookPatch | null;
  toolResults: NotebookAssistantToolResult[];
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

export function dispatchNotebookAssistantToolRequests(
  snapshot: NotebookAssistantSnapshot,
  requests: NotebookAssistantToolRequest[]
): NotebookAssistantToolBatchResult {
  let draftSnapshot = snapshot;
  const toolResults: NotebookAssistantToolResult[] = [];
  const proposedPatches: NotebookPatch[] = [];

  for (const request of requests) {
    const result = dispatchNotebookAssistantTool(draftSnapshot, request);
    toolResults.push(result);

    const patch = extractNotebookAssistantToolPatch(result, request);
    if (!patch) {
      continue;
    }

    proposedPatches.push(patch);

    const preview = previewPatch(draftSnapshot.document, patch);
    if (preview.ok) {
      draftSnapshot = {
        ...draftSnapshot,
        document: preview.document
      };
    }
  }

  return {
    proposedPatch: combineNotebookPatches(proposedPatches),
    toolResults
  };
}


function isNotebookAssistantToolName(name: string): name is NotebookAssistantToolName {
  return NOTEBOOK_ASSISTANT_TOOL_NAMES.includes(name as NotebookAssistantToolName);
}

function extractNotebookAssistantToolPatch(
  result: NotebookAssistantToolResult,
  request?: NotebookAssistantToolRequest
): NotebookPatch | null {
  if (!result.ok || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return null;
  }

  const patch = (result.data as { patch?: unknown }).patch;
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const operations = (patch as { operations?: unknown }).operations;
    if (Array.isArray(operations)) {
      return patch as NotebookPatch;
    }
  }

  if (
    request &&
    (result.name === "validateNotebookPatch" || result.name === "previewNotebookPatch" || result.name === "explainNotebookPatch") &&
    (result.data as { ok?: unknown }).ok !== false
  ) {
    const requestPatch = request.args?.patch;
    if (requestPatch && typeof requestPatch === "object" && !Array.isArray(requestPatch)) {
      const operations = (requestPatch as { operations?: unknown }).operations;
      if (Array.isArray(operations)) {
        return requestPatch as NotebookPatch;
      }
    }
  }

  return null;
}

function combineNotebookPatches(patches: NotebookPatch[]): NotebookPatch | null {
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

function success(name: NotebookAssistantToolName, data: unknown): NotebookAssistantToolResult {
  return { ok: true, name, data };
}
