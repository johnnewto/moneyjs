import type { ReactNode } from "react";

import { stringifyJsonWithCompactLeaves } from "../lib/jsonFormat";
import { serializeNotebookCell } from "./document";
import type {
  ChartCell,
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  MatrixCell,
  ModelCell,
  NotebookCell,
  RunCell,
  SequenceCell,
  SolverCell,
  TableCell
} from "./types";

export function isSourceEditable(cell: NotebookCell): boolean {
  return !["model", "equations", "solver", "externals", "initial-values"].includes(cell.type);
}

export function serializeCellBody(cell: NotebookCell): string {
  if (cell.type === "markdown") {
    return cell.source;
  }
  return formatCellBody(serializeNotebookCell(cell), "compact");
}

export function formatCellBody(
  cellBody: object,
  mode: "pretty" | "compact"
): string {
  return mode === "pretty"
    ? JSON.stringify(cellBody, null, 2)
    : stringifyJsonWithCompactLeaves(cellBody, 0);
}

export function highlightSourceDraft(
  source: string,
  cellType: NotebookCell["type"]
): ReactNode[] {
  if (cellType === "markdown") {
    return highlightMarkdownSource(source);
  }

  return highlightJsonSource(source);
}

export function parseCellSource(cell: NotebookCell, source: string, title?: string): NotebookCell {
  if (cell.type === "markdown") {
    const nextTitle = title?.trim() ?? "";
    if (!nextTitle) {
      throw new Error("Cell title is required.");
    }

    return {
      ...cell,
      title: nextTitle,
      source
    };
  }

  const parsed = JSON.parse(source) as NotebookCell;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Cell source must parse to an object.");
  }
  if (parsed.type !== cell.type) {
    throw new Error(`Cell source must remain type '${cell.type}'.`);
  }
  if (typeof parsed.title !== "string" || !parsed.title.trim()) {
    throw new Error("Cell source must include title.");
  }
  if (typeof parsed.id !== "string") {
    throw new Error("Cell source must include id.");
  }
  validateCellSourceShape(cell.type, parsed);
  return normalizeCellSource(parsed);
}

export function buildSourceHelperActions(
  cell: NotebookCell
): Array<{ label: string; insert: string }> {
  switch (cell.type) {
    case "chart":
      return [
        { label: "Add axisMode", insert: '"axisMode": "shared"' },
        { label: "Collapsed true", insert: '"collapsed": true' },
        { label: "Shared range", insert: '"sharedRange": {\n  "min": 0,\n  "max": 200\n}' },
        { label: "Nice scale", insert: '"niceScale": true' },
        { label: "Y-axis ticks", insert: '"yAxisTickCount": 7' },
        { label: "Time range", insert: '"timeRangeInclusive": [5, 20]' },
        {
          label: "Series ranges",
          insert: '"seriesRanges": {\n  "y": {\n    "includeZero": true\n  }\n}'
        },
        { label: "Axis snap", insert: '"axisSnapTolarance": 0.1' },
        { label: "Include zero", insert: '"sharedRange": {\n  "includeZero": true\n}' },
        { label: "Use shared", insert: '"axisMode": "shared"' },
        { label: "Use separate", insert: '"axisMode": "separate"' },
        { label: "Variables array", insert: '"variables": ["y", "c"]' }
      ];
    case "run":
      return [
        { label: "Collapsed true", insert: '"collapsed": true' },
        {
          label: "Scenario skeleton",
          insert:
            '"scenario": {\n  "shocks": [\n    {\n      "rangeInclusive": [1, 4],\n      "variables": {\n        "Gd": {\n          "kind": "constant",\n          "value": 25\n        }\n      }\n    }\n  ]\n}'
        },
        { label: "Baseline run id", insert: '"baselineRunCellId": "baseline-run"' },
        { label: "Baseline start", insert: '"baselineStartPeriod": 55' },
        { label: "Periods", insert: '"periods": 60' },
        { label: "Add shock", insert: '"shocks": []' },
        { label: "Result key", insert: '"resultKey": "scenario_result"' }
      ];
    case "table":
      return [
        { label: "Variables array", insert: '"variables": ["y", "c"]' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "matrix":
      return [
        { label: "Columns array", insert: '"columns": ["Households", "Firms"]' },
        { label: "Rows array", insert: '"rows": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "sequence":
      return [
        {
          label: "Matrix source",
          insert: '"source": {\n  "kind": "matrix",\n  "matrixCellId": "matrix-1"\n}'
        },
        {
          label: "Dependency source",
          insert: '"source": {\n  "kind": "dependency",\n  "modelId": "main"\n}'
        },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "equations":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Equations array", insert: '"equations": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "solver":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        {
          label: "Options object",
          insert:
            '"options": {\n  "periods": 100,\n  "solverMethod": "GAUSS_SEIDEL",\n  "toleranceText": "1e-15",\n  "maxIterations": 200,\n  "defaultInitialValueText": "1e-15",\n  "hiddenLeftVariable": "",\n  "hiddenRightVariable": "",\n  "hiddenToleranceText": "0.00001",\n  "relativeHiddenTolerance": false\n}'
        },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "externals":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Externals array", insert: '"externals": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "initial-values":
      return [
        { label: "Model id", insert: '"modelId": "main"' },
        { label: "Initial values array", insert: '"initialValues": []' },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "markdown":
      return [
        { label: "Code span", insert: "`variable`" },
        { label: "Bullet list", insert: "- item one\n- item two" },
        { label: "Collapsed true", insert: '"collapsed": true' }
      ];
    case "model":
      return [{ label: "Collapsed true", insert: '"collapsed": true' }];
  }
}

export function buildSourceHelpText(cell: NotebookCell): string {
  switch (cell.type) {
    case "markdown":
      return "Markdown cell source is plain text.\n\nExample:\nUpdated notebook overview with `inline code` and a short bullet list.";
    case "run":
      return `Required fields:
- title
- id
- type: "run"
- sourceModelId or sourceModelCellId
- mode: "baseline" | "scenario"
- resultKey

Optional:
- baselineRunCellId
- baselineStartPeriod
- periods

Scenario example:
${formatCellBody(
  {
    title: cell.title,
    id: cell.id,
    type: "run",
    sourceModelId: "main",
    baselineRunCellId: "baseline-run",
    baselineStartPeriod: 55,
    mode: "scenario",
    periods: 60,
    resultKey: "example_result",
    scenario: {
      shocks: [
        {
          rangeInclusive: [5, 12],
          variables: {
            phi: { kind: "constant", value: 0.35 }
          }
        }
      ]
    }
  },
  "compact"
)}`;
    case "equations":
      return `Required fields:
- id
- type: "equations"
- modelId
- equations: []

Optional:
- collapsed: boolean

Behavior:
This cell owns the model equation list for one notebook model.`;
    case "chart":
      return `Required fields:
- title
- id
- type: "chart"
- sourceRunCellId
- variables: string[]

Optional:
- axisMode: "shared" | "separate"
- axisSnapTolarance: number
- niceScale: boolean
- yAxisTickCount: integer >= 2 (preferred density, actual count may vary slightly to keep nice spacing)
- timeRangeInclusive: [startPeriodInclusive, endPeriodInclusive]
- sharedRange: { "includeZero"?: boolean, "min"?: number, "max"?: number }
- seriesRanges: { [variableName]: range }

Example:
${formatCellBody(
  {
    title: cell.title,
    id: cell.id,
    type: "chart",
    sourceRunCellId: "baseline-run",
    variables: ["ydhs", "c", "p"],
    axisMode: "separate",
    axisSnapTolarance: 0.1,
    niceScale: true,
    yAxisTickCount: 7,
    timeRangeInclusive: [5, 20],
    sharedRange: {
      includeZero: true
    },
    seriesRanges: {
      p: {
        min: 0,
        max: 2
      }
    }
  },
  "compact"
) }

Notes:
- Horizontal grid lines and Y-axis labels are generated from the same tick list.
- niceScale expands auto-scaled bounds outward to nicer 0/5-style values.
- In shared-axis mode, yAxisTickCount is treated as a target density, so the final tick count may shift slightly when the chart snaps to nicer 0/5 spacing.
- In separate-axis mode, the chart keeps the same tick count on each axis so the grid rows and axis tick rows stay aligned.`;
    case "externals":
      return `Required fields:
- id
- type: "externals"
- modelId
- externals: []

Optional:
- collapsed: boolean

Behavior:
This cell owns the external parameter list for one notebook model. Hide/show only affects visibility in the notebook UI.`;
    case "solver":
      return `Required fields:
- id
- type: "solver"
- modelId
- options

Optional:
- collapsed: boolean

Behavior:
This cell owns the solver/options section for one notebook model. Hide/show only affects visibility in the notebook UI.`;
    case "initial-values":
      return `Required fields:
- id
- type: "initial-values"
- modelId
- initialValues: []

Optional:
- collapsed: boolean

Behavior:
This cell owns the initial-values section for one notebook model. Hide/show only affects visibility in the notebook UI.`;
    case "table":
      return `Required fields:
- title
- id
- type: "table"
- sourceRunCellId
- variables: string[]`;
    case "matrix":
      return `Required fields:
    - title
    - id
    - type: "matrix"
    - columns: string[]
    - rows: [{ "label": string, "values": string[] }]

    Behavior:
    Use Grid mode in the source editor to edit columns, row labels, and values directly.
    Switch to JSON only for bulk copy, paste, or advanced edits.`;
    case "sequence":
      return `Required fields:
- title
- id
- type: "sequence"
- source

Source can be:
- { "kind": "plantuml", "source": "..." }
- { "kind": "matrix", "matrixCellId": "matrix-1" }
- { "kind": "dependency", "modelId": "main" }`;
    case "model":
      return "";
  }
}

export function buildNotebookCellHelpText(cell: NotebookCell): string {
  switch (cell.type) {
    case "markdown":
      return "Markdown cell for narrative text, notes, and section explanations.";
    case "model":
      return [
        "Combined model cell with equations, externals, initial values, and solver settings.",
        "Use Edit to switch between the compact model view and the editor.",
        "Hover previews inputs. Click shows both, Shift+click pins outputs, Ctrl/Cmd+click pins inputs."
      ].join("\n");
    case "equations":
      return [
        "Equation ledger for the linked model.",
        "Use Edit to switch between the compact read-only view and the equation editor.",
        "Hover previews inputs. Click shows both, Shift+click pins outputs, Ctrl/Cmd+click pins inputs."
      ].join("\n");
    case "solver":
      return [
        "Solver settings for the linked model.",
        "Use Edit to switch between the compact read-only view and the solver editor."
      ].join("\n");
    case "externals":
      return [
        "External parameters and exogenous series for the linked model.",
        "Use Edit to switch between the compact read-only view and the externals editor."
      ].join("\n");
    case "initial-values":
      return [
        "Initial conditions for the linked model.",
        "Use Edit to switch between the compact read-only view and the initial values editor."
      ].join("\n");
    case "run":
      return "Run cell for baseline or scenario simulation. Use it to execute the linked model and populate downstream result cells.";
    case "chart":
      return "Chart cell that plots variables from a run cell result.";
    case "table":
      return "Summary table cell that shows selected, start, and end values for chosen variables.";
    case "matrix":
      return "Matrix cell that evaluates transaction or balance-sheet style formulas against the selected run result.";
    case "sequence":
      return "Sequence viewer cell for either matrix-derived transaction flows or a sector-strip equation dependency graph.";
    default:
      return "Notebook cell help is not available for this cell type.";
  }
}

export function applySourceHelper(currentSource: string, insert: string): string {
  const trimmed = currentSource.trimEnd();
  if (!trimmed) {
    return insert;
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return insertIntoJsonObject(trimmed, insert);
  }

  return `${trimmed}\n${insert}`;
}

function highlightJsonSource(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;

  source.replace(
    /"(?:\\.|[^"\\])*"(?=\s*:)?|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]/g,
    (match, offset) => {
      if (offset > cursor) {
        parts.push(source.slice(cursor, offset));
      }

      parts.push(
        <span key={`${offset}-${match}`} className={tokenClassForJson(source, match, offset)}>
          {match}
        </span>
      );
      cursor = offset + match.length;
      return match;
    }
  );

  if (cursor < source.length) {
    parts.push(source.slice(cursor));
  }

  return parts;
}

function tokenClassForJson(source: string, token: string, offset: number): string {
  if (token === "true" || token === "false") {
    return "token-boolean";
  }
  if (token === "null") {
    return "token-null";
  }
  if (/^-?\d/.test(token)) {
    return "token-number";
  }
  if (/^"/.test(token)) {
    const trailing = source.slice(offset + token.length);
    return /^\s*:/.test(trailing) ? "token-key" : "token-string";
  }
  return "token-punctuation";
}

function highlightMarkdownSource(source: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    if (index > 0) {
      parts.push("\n");
    }

    const headingMatch = line.match(/^(#+\s.*)$/);
    if (headingMatch) {
      parts.push(
        <span key={`md-heading-${index}`} className="token-heading">
          {line}
        </span>
      );
      return;
    }

    let cursor = 0;
    line.replace(/`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/g, (match, offset) => {
      if (offset > cursor) {
        parts.push(line.slice(cursor, offset));
      }
      parts.push(
        <span key={`md-${index}-${offset}`} className="token-markdown">
          {match}
        </span>
      );
      cursor = offset + match.length;
      return match;
    });

    if (cursor < line.length) {
      parts.push(line.slice(cursor));
    }
  });

  return parts;
}

function normalizeCellSource(cell: NotebookCell): NotebookCell {
  if (cell.type !== "run" || !cell.scenario) {
    return cell;
  }

  return {
    ...cell,
    scenario: {
      ...cell.scenario,
      shocks: cell.scenario.shocks.map((shock) => {
        const candidate = shock as typeof shock & { rangeInclusive?: [number, number] };
        const start = candidate.rangeInclusive?.[0] ?? shock.startPeriodInclusive;
        const end = candidate.rangeInclusive?.[1] ?? shock.endPeriodInclusive;
        return {
          ...shock,
          startPeriodInclusive: start,
          endPeriodInclusive: end
        };
      })
    }
  };
}

function validateCellSourceShape(
  cellType: NotebookCell["type"],
  parsed: Omit<NotebookCell, "title">
): void {
  if (
    (parsed as NotebookCell).collapsed != null &&
    typeof (parsed as NotebookCell).collapsed !== "boolean"
  ) {
    throw new Error(`${cellType} cells require collapsed to be a boolean when provided.`);
  }
  switch (cellType) {
    case "run":
      if (
        typeof (parsed as RunCell).sourceModelId !== "string" &&
        typeof (parsed as RunCell).sourceModelCellId !== "string"
      ) {
        throw new Error("Run cells require sourceModelId or sourceModelCellId.");
      }
      if (
        (parsed as RunCell).baselineRunCellId != null &&
        typeof (parsed as RunCell).baselineRunCellId !== "string"
      ) {
        throw new Error("Run cells require baselineRunCellId to be a string when provided.");
      }
      if (
        (parsed as RunCell).baselineStartPeriod != null &&
        typeof (parsed as RunCell).baselineStartPeriod !== "number"
      ) {
        throw new Error("Run cells require baselineStartPeriod to be a number when provided.");
      }
      if (!["baseline", "scenario"].includes(String((parsed as RunCell).mode))) {
        throw new Error("Run cells require mode to be 'baseline' or 'scenario'.");
      }
      if (typeof (parsed as RunCell).resultKey !== "string") {
        throw new Error("Run cells require resultKey.");
      }
      if (
        (parsed as RunCell).periods != null &&
        typeof (parsed as RunCell).periods !== "number"
      ) {
        throw new Error("Run cells require periods to be a number when provided.");
      }
      ((parsed as RunCell).scenario?.shocks ?? []).forEach((shock, index) => {
        const candidate = shock as typeof shock & { rangeInclusive?: [number, number] };
        if (
          candidate.rangeInclusive != null &&
          (!Array.isArray(candidate.rangeInclusive) ||
            candidate.rangeInclusive.length !== 2 ||
            candidate.rangeInclusive.some((value) => typeof value !== "number"))
        ) {
          throw new Error(
            `scenario.shocks.${index}.rangeInclusive must be a [start, end] number pair.`
          );
        }
      });
      return;
    case "chart":
      if (typeof (parsed as ChartCell).sourceRunCellId !== "string") {
        throw new Error("Chart cells require sourceRunCellId.");
      }
      if (!Array.isArray((parsed as ChartCell).variables)) {
        throw new Error("Chart cells require variables to be an array.");
      }
      if (
        (parsed as ChartCell).axisMode != null &&
        !["shared", "separate"].includes(String((parsed as ChartCell).axisMode))
      ) {
        throw new Error("Chart axisMode must be 'shared' or 'separate'.");
      }
      if (
        (parsed as ChartCell).axisSnapTolarance != null &&
        typeof (parsed as ChartCell).axisSnapTolarance !== "number"
      ) {
        throw new Error("Chart axisSnapTolarance must be a number.");
      }
      if (
        (parsed as ChartCell).niceScale != null &&
        typeof (parsed as ChartCell).niceScale !== "boolean"
      ) {
        throw new Error("Chart niceScale must be a boolean.");
      }
      if (
        (parsed as ChartCell).yAxisTickCount != null &&
        (!Number.isInteger((parsed as ChartCell).yAxisTickCount) ||
          Number((parsed as ChartCell).yAxisTickCount) < 2)
      ) {
        throw new Error("Chart yAxisTickCount must be an integer greater than or equal to 2.");
      }
      validateChartAxisRange((parsed as ChartCell).sharedRange, "sharedRange");
      validateChartTimeRangeInclusive(
        (parsed as ChartCell).timeRangeInclusive,
        "timeRangeInclusive"
      );
      if (
        (parsed as ChartCell).seriesRanges != null &&
        (typeof (parsed as ChartCell).seriesRanges !== "object" ||
          Array.isArray((parsed as ChartCell).seriesRanges))
      ) {
        throw new Error("Chart seriesRanges must be an object keyed by variable name.");
      }
      Object.entries((parsed as ChartCell).seriesRanges ?? {}).forEach(([name, range]) => {
        validateChartAxisRange(range, `seriesRanges.${name}`);
      });
      return;
    case "table":
      if (typeof (parsed as TableCell).sourceRunCellId !== "string") {
        throw new Error("Table cells require sourceRunCellId.");
      }
      if (!Array.isArray((parsed as TableCell).variables)) {
        throw new Error("Table cells require variables to be an array.");
      }
      return;
    case "solver":
      if (typeof (parsed as SolverCell).modelId !== "string") {
        throw new Error("solver cells require modelId.");
      }
      if (!(parsed as SolverCell).options || typeof (parsed as SolverCell).options !== "object") {
        throw new Error("solver cells require options.");
      }
      return;
    case "externals":
    case "initial-values":
      if (typeof (parsed as ExternalsCell | InitialValuesCell).modelId !== "string") {
        throw new Error(`${cellType} cells require modelId.`);
      }
      if (cellType === "externals" && !Array.isArray((parsed as ExternalsCell).externals)) {
        throw new Error("externals cells require externals.");
      }
      if (
        cellType === "initial-values" &&
        !Array.isArray((parsed as InitialValuesCell).initialValues)
      ) {
        throw new Error("initial-values cells require initialValues.");
      }
      return;
    case "equations":
      if (typeof (parsed as EquationsCell).modelId !== "string") {
        throw new Error("equations cells require modelId.");
      }
      if (!Array.isArray((parsed as EquationsCell).equations)) {
        throw new Error("equations cells require equations.");
      }
      return;
    case "matrix":
      if (!Array.isArray((parsed as MatrixCell).columns)) {
        throw new Error("Matrix cells require columns to be an array.");
      }
      if (
        (parsed as MatrixCell).sectors != null &&
        !Array.isArray((parsed as MatrixCell).sectors)
      ) {
        throw new Error("Matrix cells require sectors to be an array when provided.");
      }
      if (!Array.isArray((parsed as MatrixCell).rows)) {
        throw new Error("Matrix cells require rows to be an array.");
      }
      return;
    case "sequence":
      if (!(parsed as SequenceCell).source || typeof (parsed as SequenceCell).source !== "object") {
        throw new Error("Sequence cells require a source object.");
      }
      const source = (parsed as SequenceCell).source;
      if (
        source.kind === "dependency" &&
        typeof source.modelId !== "string" &&
        typeof source.sourceModelId !== "string" &&
        typeof source.sourceModelCellId !== "string"
      ) {
        throw new Error(
          "Dependency sequence sources require modelId, sourceModelId, or sourceModelCellId."
        );
      }
      return;
    case "markdown":
    case "model":
      return;
  }
}

function insertIntoJsonObject(source: string, insert: string): string {
  const closingIndex = source.lastIndexOf("}");
  if (closingIndex <= 0) {
    return `${source}\n${insert}`;
  }

  const beforeClosing = source.slice(0, closingIndex).trimEnd();
  const needsComma = !beforeClosing.endsWith("{");
  const indentation = "  ";
  const formattedInsert = insert
    .split("\n")
    .map((line) => `${indentation}${line}`)
    .join("\n");

  return `${beforeClosing}${needsComma ? "," : ""}\n${formattedInsert}\n}`;
}

function validateChartAxisRange(range: unknown, label: string): void {
  if (range == null) {
    return;
  }
  if (typeof range !== "object" || Array.isArray(range)) {
    throw new Error(`${label} must be an object.`);
  }

  const candidate = range as Record<string, unknown>;
  if (candidate.includeZero != null && typeof candidate.includeZero !== "boolean") {
    throw new Error(`${label}.includeZero must be a boolean.`);
  }
  if (candidate.min != null && typeof candidate.min !== "number") {
    throw new Error(`${label}.min must be a number.`);
  }
  if (candidate.max != null && typeof candidate.max !== "number") {
    throw new Error(`${label}.max must be a number.`);
  }
  if (
    typeof candidate.min === "number" &&
    typeof candidate.max === "number" &&
    !(candidate.min < candidate.max)
  ) {
    throw new Error(`${label}.min must be less than ${label}.max.`);
  }
}

function validateChartTimeRangeInclusive(range: unknown, label: string): void {
  if (range == null) {
    return;
  }
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    range.some((value) => !Number.isInteger(value) || Number(value) < 1)
  ) {
    throw new Error(`${label} must be a [start, end] pair of integers >= 1.`);
  }
  if (range[0] > range[1]) {
    throw new Error(`${label}[0] must be <= ${label}[1].`);
  }
}
