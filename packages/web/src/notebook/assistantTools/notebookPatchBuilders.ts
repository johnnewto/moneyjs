import type { ScenarioDefinition, SolverMethod } from "@sfcr/core";
import type { NotebookPatch, NotebookPatchOperation } from "../notebookPatch";
import type { NotebookAssistantSnapshot } from "./types";
import { createSetCellPropertyOperation, createSetNestedCellPropertyOperation, createUniqueCellId, escapeJsonPointerSegment, resolveBaselineRunForScenario, resolveCellInsertIndex, resolveMarkdownCellFromArgs, resolveRunCell, resolveRunModelSource, resolveSolverCellForRun, slugifyCellId, summarizeNotebookPatchProposal } from "./shared";

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


