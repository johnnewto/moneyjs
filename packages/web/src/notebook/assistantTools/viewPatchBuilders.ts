import type { NotebookPatch, NotebookPatchOperation } from "../notebookPatch";
import type { RunCell } from "../types";
import type { NotebookAssistantSnapshot } from "./types";
import { createSetCellPropertyOperation, createUniqueCellId, escapeJsonPointerSegment, normalizeRequiredName, resolveChartCell, resolveMatrixCell, resolveMatrixRow, resolveRunCell, resolveTableCell, resolveInsertAfterLabelIndex, slugifyCellId, summarizeNotebookPatchProposal, validateMatrixRowValues, validateVariablesInRunResult } from "./shared";

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
          sharedRange: { includeZero: true },
          axisMode: "separate",
          axisSnapTolarance: 0.1,
          niceScale: true,
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

export function createUpdateChartOptionsPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    axisMode?: "shared" | "separate";
    chartId: string;
    niceScale?: boolean;
    referenceTrace?: "none" | "baseline" | "previous-run";
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
  if (args.referenceTrace != null) {
    operations.push(createSetCellPropertyOperation(chart, "referenceTrace", args.referenceTrace));
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


