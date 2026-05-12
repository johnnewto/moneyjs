import type { NotebookDocument, NotebookRuntimeState } from "../types";

export type NotebookAssistantToolMode = "ask" | "edit";
export type NotebookAssistantToolKind = "read" | "patch";

interface NotebookAssistantToolRegistryEntry {
  args: string;
  kind: NotebookAssistantToolKind;
  name: string;
  notes?: string[];
}

const EQUATION_ROLE_SCHEMA = "'accumulation' | 'identity' | 'target' | 'definition' | 'behavioral'";
const UNIT_META_SCHEMA = "{ stockFlow?: 'stock' | 'flow' | 'aux', signature?: { money?: number, items?: number, time?: number }, displayUnit?: string }";

const NOTEBOOK_EQUATION_EXPRESSION_SYNTAX = [
  "Use RHS expressions in equation/expression fields, e.g. YD - C.",
  "Supported operators: +, -, *, /, comparisons > >= < <= == !=, logical && ||.",
  "Supported functions: lag(variable), diff(variable), I(expression), min(a, b), max(a, b), pow(base, exponent), sqrt(x), exp(x), log(x), abs(x).",
  "Conditional form: if (condition) { expression } else { expression }.",
  "Use pow(base, exponent), not ^. The ^ character is reserved for variable notation.",
  "Use lag(K), not K[-1].",
  "min(a, b) and max(a, b) are supported directly for caps and floors."
] as const;

export const NOTEBOOK_ASSISTANT_TOOL_REGISTRY = [
  { name: "getNotebookSummary", kind: "read", args: "{}" },
  { name: "getEquation", kind: "read", args: "{ variable: string }" },
  { name: "getCurrentValues", kind: "read", args: "{ runId: string, periodIndex?: integer }" },
  { name: "getSeries", kind: "read", args: "{ runId: string, variable: string }" },
  {
    name: "getSeriesWindow",
    kind: "read",
    args: "{ runId: string, variable: string, start: integer, end: integer }",
    notes: ["Use start/end, not startIndex/endIndex.", "Use one variable per request; send multiple requests to compare variables."]
  },
  { name: "getMatrix", kind: "read", args: "{ matrixId: string }" },
  { name: "getVariableMetadata", kind: "read", args: "{ variable: string }" },
  { name: "getDependencyGraph", kind: "read", args: "{ variable?: string }" },
  { name: "listRuns", kind: "read", args: "{}" },
  { name: "listVariables", kind: "read", args: "{}" },
  { name: "listCharts", kind: "read", args: "{}" },
  { name: "validateNotebookPatch", kind: "patch", args: "{ patch: NotebookPatch }" },
  { name: "previewNotebookPatch", kind: "patch", args: "{ patch: NotebookPatch }" },
  { name: "explainNotebookPatch", kind: "patch", args: "{ patch: NotebookPatch }" },
  { name: "createAddChartPatch", kind: "patch", args: "{ runId: string, variables: string[], title?: string, chartId?: string }", notes: ["Use runId for the source run."] },
  { name: "createUpdateChartVariablesPatch", kind: "patch", args: "{ chartId: string, variables: string[] }", notes: ["Use chartId for the chart cell."] },
  {
    name: "createAddEquationPatch",
    kind: "patch",
    args: `{ modelId: string, name?: string, expression?: string, equation?: string, description?: string, role?: ${EQUATION_ROLE_SCHEMA}, insertAfterVariable?: string, unitMeta?: ${UNIT_META_SCHEMA} }`,
    notes: ["Use either equation: 'name = expression' or name plus expression.", "Do not use role values like 'constraint' or 'aux'."]
  },
  {
    name: "createUpdateEquationPatch",
    kind: "patch",
    args: `{ modelId: string, variable: string, expression: string, description?: string, role?: ${EQUATION_ROLE_SCHEMA}, unitMeta?: ${UNIT_META_SCHEMA} }`,
    notes: ["Do not use role values like 'constraint' or 'aux'."]
  },
  { name: "createRemoveEquationPatch", kind: "patch", args: "{ modelId: string, variable: string, allowDependents?: boolean }" },
  { name: "createUpdateVariableDescriptionPatch", kind: "patch", args: "{ modelId: string, variable: string, description: string }" },
  {
    name: "createAddExternalPatch",
    kind: "patch",
    args: `{ modelId: string, name: string, kind: 'constant' | 'series', value: number | string, description?: string, insertAfterVariable?: string, unitMeta?: ${UNIT_META_SCHEMA} }`,
    notes: ["Use name, not variable. Use value, not valueText.", "Use kind 'constant' for scalar parameters and 'series' for time series."]
  },
  { name: "createUpdateExternalPatch", kind: "patch", args: `{ modelId: string, variable: string, value?: number | string, kind?: 'constant' | 'series', description?: string, unitMeta?: ${UNIT_META_SCHEMA} }`, notes: ["Use value, not valueText."] },
  { name: "createAddInitialValuePatch", kind: "patch", args: "{ modelId: string, variable: string, value: number | string, insertAfterVariable?: string }", notes: ["Use value, not valueText."] },
  { name: "createUpdateInitialValuePatch", kind: "patch", args: "{ modelId: string, variable: string, value: number | string }", notes: ["Use value, not valueText."] },
  { name: "createAddScenarioRunPatch", kind: "patch", args: "{ title: string, periods: integer, scenario: ScenarioDefinition, runId?: string, sourceModelId?: string, sourceModelCellId?: string, baselineRunCellId?: string, baselineStartPeriod?: integer }" },
  { name: "createUpdateRunOptionsPatch", kind: "patch", args: "{ runId: string, periods?: integer, solverMethod?: 'GAUSS_SEIDEL' | 'BROYDEN' | 'NEWTON', tolerance?: number | string, scenario?: ScenarioDefinition, baselineRunCellId?: string, baselineStartPeriod?: integer }" },
  { name: "createAddTablePatch", kind: "patch", args: "{ runId: string, title: string, variables: string[], tableId?: string }", notes: ["Use runId for the source run."] },
  { name: "createUpdateTableVariablesPatch", kind: "patch", args: "{ tableId: string, variables: string[] }", notes: ["Use tableId for the table cell."] },
  { name: "createAddMatrixRowPatch", kind: "patch", args: "{ matrixId: string, label: string, values: string[], band?: string, insertAfterLabel?: string }" },
  { name: "createUpdateMatrixRowPatch", kind: "patch", args: "{ matrixId: string, label: string, values?: string[], newLabel?: string, band?: string }" },
  { name: "createRemoveMatrixRowPatch", kind: "patch", args: "{ matrixId: string, label: string }" },
  { name: "createAddMarkdownCellPatch", kind: "patch", args: "{ title: string, source: string, cellId?: string, insertAfterCellId?: string, insertAfterCellTitle?: string }" },
  { name: "createUpdateMarkdownCellPatch", kind: "patch", args: "{ cellId?: string, cellTitle?: string, title?: string, source?: string }" },
  { name: "createUpdateChartOptionsPatch", kind: "patch", args: "{ chartId: string, axisMode?: 'shared' | 'separate', niceScale?: boolean, referenceTrace?: ReferenceTrace, seriesRanges?: object, sharedRange?: object, timeRangeInclusive?: [integer, integer], yAxisTickCount?: integer }" },
  { name: "createUpdateNotebookTitlePatch", kind: "patch", args: "{ title: string }" },
  { name: "createUpdateVariableUnitMetaPatch", kind: "patch", args: `{ variable: string, modelId?: string, displayUnit?: string, unit?: string, stockFlow?: 'stock' | 'flow' | 'aux', unitMeta?: ${UNIT_META_SCHEMA} }` },
  { name: "createUpdateParameterPatch", kind: "patch", args: "{ modelId: string, variable: string, value: number | string }", notes: ["Use value, not from, to, newValue, or prose."] }
] as const satisfies readonly NotebookAssistantToolRegistryEntry[];

export type NotebookAssistantToolName = (typeof NOTEBOOK_ASSISTANT_TOOL_REGISTRY)[number]["name"];
export const NOTEBOOK_ASSISTANT_TOOL_NAMES = NOTEBOOK_ASSISTANT_TOOL_REGISTRY.map((tool) => tool.name) as NotebookAssistantToolName[];

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

export function summarizeNotebookAssistantToolSyntax(mode: NotebookAssistantToolMode): string {
  return NOTEBOOK_ASSISTANT_TOOL_REGISTRY
    .filter((tool) => mode === "edit" || tool.kind === "read")
    .map(formatNotebookAssistantToolSyntax)
    .join("\n");
}

export function summarizeNotebookEquationExpressionSyntax(): string {
  return NOTEBOOK_EQUATION_EXPRESSION_SYNTAX.map((line) => `- ${line}`).join("\n");
}

export function getNotebookAssistantToolSyntax(name: string): string | null {
  const tool = NOTEBOOK_ASSISTANT_TOOL_REGISTRY.find((entry) => entry.name === name);
  return tool ? formatNotebookAssistantToolSyntax(tool) : null;
}

function formatNotebookAssistantToolSyntax(tool: NotebookAssistantToolRegistryEntry): string {
  const notes = tool.notes && tool.notes.length > 0 ? ` Notes: ${tool.notes.join(" ")}` : "";
  return `- ${tool.name}: ${tool.args}.${notes}`;
}
