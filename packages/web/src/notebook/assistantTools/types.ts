import type { NotebookDocument, NotebookRuntimeState } from "../types";

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
