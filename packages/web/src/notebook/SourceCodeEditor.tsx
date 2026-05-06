import { useEffect, useMemo, useRef } from "react";

import { CompletionContext, autocompletion, type Completion } from "@codemirror/autocomplete";
import { json } from "@codemirror/lang-json";
import { linter, type Diagnostic } from "@codemirror/lint";
import { Compartment, EditorState, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, placeholder, type DecorationSet } from "@codemirror/view";
import { basicSetup } from "codemirror";

import {
  notebookToMarkdown,
  serializeNotebookCell,
  type NotebookSourceDiagnostic,
  type NotebookSourceFormat
} from "./document";
import type { NotebookDocument } from "./types";
import { stringifyJsonWithCompactLeaves } from "../lib/jsonFormat";

export interface SourceCodeEditorDiagnostics {
  issues: NotebookSourceDiagnostic[];
  parseValid: boolean;
  schemaValid: boolean;
}

export interface SourceRange {
  from: number;
  to: number;
}

export function resolveDiagnosticRange(
  issue: NotebookSourceDiagnostic,
  documentLength: number
): { from: number; to: number } {
  const from = Math.max(0, Math.min(issue.offset ?? 0, documentLength));
  const desiredTo = issue.endOffset ?? from + 1;
  const to = Math.max(from + (documentLength > from ? 1 : 0), Math.min(desiredTo, documentLength));
  return { from, to };
}

export function SourceCodeEditor({
  diagnostics,
  document,
  format,
  onChange,
  placeholderText,
  selectedCellId,
  value
}: {
  diagnostics: SourceCodeEditorDiagnostics;
  document: NotebookDocument;
  format: NotebookSourceFormat;
  onChange(value: string): void;
  placeholderText: string;
  selectedCellId: string | null;
  value: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const highlightCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const diagnosticsRef = useRef(diagnostics);
  const completionData = useMemo(() => buildCompletionData(document, format), [document, format]);
  const selectedCellRange = useMemo(
    () => resolveSelectedCellSourceRange({ document, format, selectedCellId, source: value }),
    [document, format, selectedCellId, value]
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    diagnosticsRef.current = diagnostics;
  }, [diagnostics]);

  useEffect(() => {
    if (format === "markdown" || !hostRef.current) {
      return;
    }

    const highlightCompartment = new Compartment();
    highlightCompartmentRef.current = highlightCompartment;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          json(),
          highlightCompartment.of(
            buildSelectedCellHighlightExtension(selectedCellRange, EditorState.create({ doc: value }).doc)
          ),
          placeholder(placeholderText),
          EditorView.contentAttributes.of({
            "aria-label": "Notebook source editor",
            spellcheck: "false"
          }),
          autocompletion({
            activateOnTyping: true,
            override: [buildNotebookCompletionSource(completionData)]
          }),
          linter((view) => buildEditorDiagnostics(diagnosticsRef.current, view.state.doc.length)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          })
        ]
      })
    });

    viewRef.current = view;

    return () => {
      highlightCompartmentRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
  }, [completionData, format, placeholderText]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === view.state.doc.toString()) {
      return;
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    const highlightCompartment = highlightCompartmentRef.current;
    if (!view || !highlightCompartment || format === "markdown") {
      return;
    }

    view.dispatch({
      effects: highlightCompartment.reconfigure(
        buildSelectedCellHighlightExtension(selectedCellRange, view.state.doc)
      )
    });
  }, [format, selectedCellRange]);

  if (format === "markdown") {
    return (
      <textarea
        data-testid="notebook-source-text"
        className="json-area notebook-utility-textarea notebook-editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholderText}
        spellCheck={false}
      />
    );
  }

  return (
    <div className="notebook-code-editor-shell">
      <div ref={hostRef} className="notebook-code-editor" />
      <textarea
        aria-hidden="true"
        className="notebook-source-text-mirror"
        data-testid="notebook-source-text"
        readOnly
        tabIndex={-1}
        value={value}
      />
    </div>
  );
}

export function resolveSelectedCellSourceRange(args: {
  document: NotebookDocument;
  format: NotebookSourceFormat;
  selectedCellId: string | null;
  source: string;
}): SourceRange | null {
  if (!args.selectedCellId) {
    return null;
  }

  const cell = args.document.cells.find((candidate) => candidate.id === args.selectedCellId);
  if (!cell) {
    return null;
  }

  if (args.format === "json") {
    const serializedCell = stringifyJsonWithCompactLeaves(serializeNotebookCell(cell));
    const exactMatchIndex = args.source.indexOf(serializedCell);
    if (exactMatchIndex >= 0) {
      return {
        from: exactMatchIndex,
        to: exactMatchIndex + serializedCell.length
      };
    }

    return resolveJsonCellSourceRange(args.source, cell.id);
  }

  const markdownSource = notebookToMarkdown({
    ...args.document,
    cells: [cell]
  });
  const sectionSource = markdownSource.replace(/^#\s+.+?\n\n/, "").trim();
  const exactMatchIndex = args.source.indexOf(sectionSource);
  if (exactMatchIndex < 0) {
    return null;
  }

  return {
    from: exactMatchIndex,
    to: exactMatchIndex + sectionSource.length
  };
}

function resolveJsonCellSourceRange(source: string, cellId: string): SourceRange | null {
  const idToken = `"id": "${cellId}"`;
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const matchIndex = source.indexOf(idToken, searchIndex);
    if (matchIndex < 0) {
      return null;
    }

    const objectStart = findEnclosingJsonObjectStart(source, matchIndex);
    if (objectStart == null) {
      return null;
    }

    const objectEnd = findMatchingJsonObjectEnd(source, objectStart);
    if (objectEnd == null) {
      return null;
    }

    try {
      const parsed = JSON.parse(source.slice(objectStart, objectEnd + 1)) as { id?: unknown };
      if (parsed.id === cellId) {
        return {
          from: objectStart,
          to: objectEnd + 1
        };
      }
    } catch {
      // Continue searching in case the enclosing object was not the cell object.
    }

    searchIndex = matchIndex + idToken.length;
  }

  return null;
}

function findEnclosingJsonObjectStart(source: string, anchorIndex: number): number | null {
  const objectStack: number[] = [];
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < anchorIndex; index += 1) {
    const character = source[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      objectStack.push(index);
      continue;
    }

    if (character === "}") {
      objectStack.pop();
    }
  }

  return objectStack.at(-1) ?? null;
}

function findMatchingJsonObjectEnd(source: string, startIndex: number): number | null {
  let inString = false;
  let isEscaped = false;
  let depth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function buildSelectedCellHighlightExtension(
  range: SourceRange | null,
  doc: Text
): Extension {
  return EditorView.decorations.of(buildSelectedCellDecorations(range, doc));
}

function buildSelectedCellDecorations(range: SourceRange | null, doc: Text): DecorationSet {
  if (!range || range.to <= range.from) {
    return Decoration.none;
  }

  const decorations = [Decoration.mark({ class: "notebook-source-selected-cell-range" }).range(range.from, range.to)];
  const lineDecoration = Decoration.line({ attributes: { class: "notebook-source-selected-cell-line" } });
  const startLine = doc.lineAt(range.from).number;
  const endLine = doc.lineAt(Math.max(range.from, range.to - 1)).number;
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    const line = doc.line(lineNumber);
    decorations.push(lineDecoration.range(line.from));
  }

  return Decoration.set(decorations, true);
}

interface CompletionData {
  enumValues: Record<string, string[]>;
  format: NotebookSourceFormat;
  keySnippets: Record<string, Completion>;
  matrixIds: string[];
  modelIds: string[];
  runIds: string[];
  variableNames: string[];
}

const CELL_TYPE_PROPERTY_KEYS: Record<string, string[]> = {
  markdown: ["source"],
  equations: ["modelId", "equations"],
  solver: ["modelId", "options"],
  externals: ["modelId", "externals"],
  "initial-values": ["modelId", "initialValues"],
  run: [
    "sourceModelId",
    "sourceModelCellId",
    "baselineRunCellId",
    "baselineStartPeriod",
    "mode",
    "scenario",
    "resultKey",
    "description",
    "periods"
  ],
  chart: [
    "sourceRunCellId",
    "variables",
    "axisMode",
    "axisSnapTolarance",
    "niceScale",
    "yAxisTickCount",
    "sharedRange",
    "seriesRanges",
    "timeRangeInclusive"
  ],
  table: ["sourceRunCellId", "variables"],
  matrix: ["sourceRunCellId", "columns", "sectors", "rows", "description", "note"],
  sequence: ["source", "description", "note"]
};

const COMMON_CELL_PROPERTY_KEYS = ["id", "type", "title", "collapsed"];
const ROOT_PROPERTY_KEYS = ["id", "title", "metadata", "cells"];
const CONTEXT_PROPERTY_KEYS: Array<{ property: string; pattern: RegExp; keys: string[] }> = [
  { property: "stripMapping", pattern: /"stripMapping"\s*:\s*\{[^{}]*$/s, keys: ["transactionMatrixCellId", "balanceMatrixCellId"] },
  { property: "unitMeta", pattern: /"unitMeta"\s*:\s*\{[^{}]*$/s, keys: ["stockFlow", "signature"] },
  { property: "sharedRange", pattern: /"sharedRange"\s*:\s*\{[^{}]*$/s, keys: ["includeZero", "min", "max"] },
  { property: "seriesRanges", pattern: /"seriesRanges"\s*:\s*\{[\s\S]*\{[^{}]*$/s, keys: ["includeZero", "min", "max"] },
  { property: "variables", pattern: /"variables"\s*:\s*\{[\s\S]*"kind"\s*:\s*"(?:constant|series)"[^{}]*$/s, keys: ["kind", "value", "values"] },
  { property: "metadata", pattern: /"metadata"\s*:\s*\{[^{}]*$/s, keys: ["version", "template"] },
  { property: "options", pattern: /"options"\s*:\s*\{[^{}]*$/s, keys: ["periods", "solverMethod", "toleranceText", "maxIterations", "defaultInitialValueText", "hiddenLeftVariable", "hiddenRightVariable", "hiddenToleranceText", "relativeHiddenTolerance"] },
  { property: "scenario", pattern: /"scenario"\s*:\s*\{[^{}]*$/s, keys: ["shocks"] },
  { property: "source", pattern: /"source"\s*:\s*\{[^{}]*$/s, keys: ["kind", "source", "matrixCellId", "sourceRunCellId", "includeZeroFlows", "aliases", "modelId", "sourceModelId", "sourceModelCellId", "stripSectorSource", "showAccountingStrips", "ignoreInferredBandsForPlacement", "showExogenous", "showDebugOverlay", "stripMapping"] },
  { property: "rows", pattern: /"rows"\s*:\s*\[[\s\S]*\{[\s\S]*$/s, keys: ["band", "label", "values"] },
  { property: "equations", pattern: /"equations"\s*:\s*\[[\s\S]*\{[\s\S]*$/s, keys: ["id", "name", "desc", "expression", "role", "unitMeta"] },
  { property: "externals", pattern: /"externals"\s*:\s*\[[\s\S]*\{[\s\S]*$/s, keys: ["id", "name", "desc", "kind", "valueText", "unitMeta"] },
  { property: "initialValues", pattern: /"initialValues"\s*:\s*\[[\s\S]*\{[\s\S]*$/s, keys: ["id", "name", "valueText"] },
  {
    property: "options",
    pattern: /"options"\s*:\s*\{[^{}]*$/s,
    keys: [
      "periods",
      "solverMethod",
      "toleranceText",
      "maxIterations",
      "defaultInitialValueText",
      "hiddenLeftVariable",
      "hiddenRightVariable",
      "hiddenToleranceText",
      "relativeHiddenTolerance"
    ]
  },
  { property: "shocks", pattern: /"shocks"\s*:\s*\[[\s\S]*\{[^{}]*$/s, keys: ["rangeInclusive", "variables"] },
  { property: "shocks", pattern: /"shocks"\s*:\s*\[[\s\S]*\{[\s\S]*$/s, keys: ["rangeInclusive", "variables"] }
];

function buildNotebookCompletionSource(data: CompletionData) {
  return (context: CompletionContext) => {
    const before = context.state.sliceDoc(Math.max(0, context.pos - 160), context.pos);
    const after = context.state.sliceDoc(context.pos, Math.min(context.state.doc.length, context.pos + 40));
    const propertyName = detectPropertyNameBeforeValue(before);
    const word = context.matchBefore(/[\w^{}.-]*/);
    const from = context.pos - before.length + resolveCompletionReplacementStart(before, data.format);
    const to = context.pos + resolveCompletionReplacementEnd(after, data.format);
    const keyPrefix = resolveCompletionKeyPrefix(before, data.format);

    if (propertyName) {
      const optionValues = resolvePropertyValues(propertyName, data);
      if (optionValues.length > 0) {
        return {
          from,
          to,
          options: optionValues.map((value) => ({
            label: value,
            type: "constant",
            apply: data.format === "json" ? JSON.stringify(value) : value
          }))
        };
      }
    }

    if (!context.explicit && !shouldOfferKeyCompletion(before, data.format)) {
      return null;
    }

    return {
      from,
      filter: false,
      to,
      options: resolveKeySnippetOptions(context, data, keyPrefix)
    };
  };
}

export async function resolveCompletionLabelsForSource(args: {
  document: NotebookDocument;
  explicit?: boolean;
  format: NotebookSourceFormat;
  pos?: number;
  source: string;
}): Promise<string[] | null> {
  const source = buildNotebookCompletionSource(buildCompletionData(args.document, args.format));
  const context = new CompletionContext(
    EditorState.create({ doc: args.source }),
    args.pos ?? args.source.length,
    args.explicit ?? false
  );
  const result = await Promise.resolve(source(context));
  if (!result) {
    return null;
  }

  return result.options.map((option) => option.label);
}

export function resolveCompletionKeyPrefix(
  sourceBeforeCursor: string,
  format: NotebookSourceFormat
): string {
  return (
    sourceBeforeCursor.match(/"?([\w^{}.-]+)"?\s*:\s*$/)?.[1] ??
    sourceBeforeCursor.match(/"([\w^{}.-]*)$/)?.[1] ??
    sourceBeforeCursor.match(/([\w^{}.-]+)$/)?.[1] ??
    ""
  );
}

export function shouldOfferKeyCompletion(
  sourceBeforeCursor: string,
  format: NotebookSourceFormat
): boolean {
  const tail = sourceBeforeCursor.slice(-120);
  return (
    /"?[\w^{}.-]+"?\s*:\s*$/.test(tail) ||
    /"[\w^{}.-]*$/.test(tail) ||
    /[\w^{}.-]+$/.test(tail) ||
    /(?:^|[\{\[,] )?\s*$/.test(tail)
  );
}

export function resolveCompletionReplacementStart(
  sourceBeforeCursor: string,
  format: NotebookSourceFormat
): number {
  const partialProperty = sourceBeforeCursor.match(/"?[\w^{}.-]+"?\s*:\s*$/);
  if (partialProperty) {
    return sourceBeforeCursor.length - partialProperty[0].length;
  }

  const match = sourceBeforeCursor.match(/"?[\w^{}.-]*$/);
  return sourceBeforeCursor.length - (match?.[0].length ?? 0);
}

export function resolveCompletionReplacementEnd(
  sourceAfterCursor: string,
  format: NotebookSourceFormat
): number {
  return sourceAfterCursor.match(/^"\s*:\s*/)?.[0].length ?? 0;
}

function buildCompletionData(document: NotebookDocument, format: NotebookSourceFormat): CompletionData {
  const runIds = document.cells.filter((cell) => cell.type === "run").map((cell) => cell.id);
  const matrixIds = document.cells.filter((cell) => cell.type === "matrix").map((cell) => cell.id);
  const modelIds = Array.from(
    new Set(
      document.cells.flatMap((cell) => {
        if (cell.type === "model") {
          return [cell.id];
        }
        if (
          cell.type === "equations" ||
          cell.type === "solver" ||
          cell.type === "externals" ||
          cell.type === "initial-values"
        ) {
          return [cell.modelId];
        }
        return [];
      })
    )
  );
  const variableNames = Array.from(
    new Set(
      document.cells.flatMap((cell) => {
        if (cell.type === "equations") {
          return cell.equations.map((row) => row.name);
        }
        if (cell.type === "externals") {
          return cell.externals.map((row) => row.name);
        }
        if (cell.type === "initial-values") {
          return cell.initialValues.map((row) => row.name);
        }
        if (cell.type === "model") {
          return [
            ...cell.editor.equations.map((row) => row.name),
            ...cell.editor.externals.map((row) => row.name),
            ...cell.editor.initialValues.map((row) => row.name)
          ];
        }
        return [];
      })
    )
  ).filter(Boolean);

  return {
    enumValues: {
      axisMode: ["shared", "separate"],
      kind: ["constant", "series", "matrix", "dependency", "plantuml"],
      mode: ["baseline", "scenario"],
      solverMethod: ["GAUSS_SEIDEL", "BROYDEN", "NEWTON"],
      stripSectorSource: ["columns", "sectors"],
      type: [
        "markdown",
        "equations",
        "solver",
        "externals",
        "initial-values",
        "run",
        "chart",
        "table",
        "matrix",
        "sequence"
      ]
    },
    format,
    keySnippets: buildKeySnippets(format),
    matrixIds,
    modelIds,
    runIds,
    variableNames
  };
}

function buildKeySnippets(format: NotebookSourceFormat): Record<string, Completion> {
  const entries = [
    ["id", "id"],
    ["title", "title"],
    ["metadata", "metadata"],
    ["cells", "cells"],
    ["version", "version"],
    ["template", "template"],
    ["type", "type"],
    ["collapsed", "collapsed"],
    ["modelId", "modelId"],
    ["sourceModelCellId", "sourceModelCellId"],
    ["sourceModelId", "sourceModelId"],
    ["sourceRunCellId", "sourceRunCellId"],
    ["baselineRunCellId", "baselineRunCellId"],
    ["baselineStartPeriod", "baselineStartPeriod"],
    ["matrixCellId", "matrixCellId"],
    ["equations", "equations"],
    ["name", "name"],
    ["desc", "desc"],
    ["expression", "expression"],
    ["role", "role"],
    ["externals", "externals"],
    ["kind", "kind"],
    ["valueText", "valueText"],
    ["initialValues", "initialValues"],
    ["variables", "variables"],
    ["columns", "columns"],
    ["sectors", "sectors"],
    ["rows", "rows"],
    ["band", "band"],
    ["label", "label"],
    ["values", "values"],
    ["axisMode", "axisMode"],
    ["axisSnapTolarance", "axisSnapTolarance"],
    ["niceScale", "niceScale"],
    ["yAxisTickCount", "yAxisTickCount"],
    ["sharedRange", "sharedRange"],
    ["seriesRanges", "seriesRanges"],
    ["timeRangeInclusive", "timeRangeInclusive"],
    ["solverMethod", "solverMethod"],
    ["scenario", "scenario"],
    ["mode", "mode"],
    ["resultKey", "resultKey"],
    ["description", "description"],
    ["periods", "periods"],
    ["options", "options"],
    ["source", "source"],
    ["note", "note"],
    ["shocks", "shocks"],
    ["rangeInclusive", "rangeInclusive"],
    ["value", "value"],
    ["unitMeta", "unitMeta"],
    ["stockFlow", "stockFlow"],
    ["signature", "signature"],
    ["includeZero", "includeZero"],
    ["min", "min"],
    ["max", "max"],
    ["includeZeroFlows", "includeZeroFlows"],
    ["aliases", "aliases"],
    ["stripSectorSource", "stripSectorSource"],
    ["showAccountingStrips", "showAccountingStrips"],
    ["ignoreInferredBandsForPlacement", "ignoreInferredBandsForPlacement"],
    ["showExogenous", "showExogenous"],
    ["showDebugOverlay", "showDebugOverlay"],
    ["stripMapping", "stripMapping"],
    ["transactionMatrixCellId", "transactionMatrixCellId"],
    ["balanceMatrixCellId", "balanceMatrixCellId"]
  ];

  return Object.fromEntries(
    entries.map(([label, key]) => [
      key,
      {
        label,
        type: "property",
        apply: format === "json" ? `"${key}": ` : `${key}: `
      }
    ])
  );
}

export function resolveCompletionKeys(
  sourceBeforeCursor: string,
  format: NotebookSourceFormat = "json"
): string[] {
  const nestedKeys = findNestedContextKeys(sourceBeforeCursor, format);
  if (nestedKeys) {
    return nestedKeys;
  }

  const cellType = findCurrentCellType(sourceBeforeCursor);
  if (cellType) {
    return [...COMMON_CELL_PROPERTY_KEYS, ...(CELL_TYPE_PROPERTY_KEYS[cellType] ?? [])];
  }

  return ROOT_PROPERTY_KEYS;
}

function findNestedContextKeys(
  sourceBeforeCursor: string,
  format: NotebookSourceFormat
): string[] | null {
  let bestMatch: { index: number; keys: string[] } | null = null;
  for (const context of CONTEXT_PROPERTY_KEYS) {
    const index = sourceBeforeCursor.lastIndexOf(`"${context.property}"`);
    if (index >= 0 && (!bestMatch || index > bestMatch.index) && context.pattern.test(sourceBeforeCursor.slice(index))) {
      bestMatch = { index, keys: context.keys };
    }
  }

  return bestMatch?.keys ?? null;
}

function resolveKeySnippetOptions(
  context: CompletionContext,
  data: CompletionData,
  keyPrefix: string
): Completion[] {
  const keys = resolveCompletionKeys(context.state.sliceDoc(0, context.pos), data.format);
  const normalizedPrefix = keyPrefix.toLowerCase();
  return keys.flatMap((key) => {
    if (normalizedPrefix && !key.toLowerCase().startsWith(normalizedPrefix)) {
      return [];
    }
    const snippet = data.keySnippets[key];
    return snippet ? [snippet] : [];
  });
}

function findCurrentCellType(sourceBeforeCursor: string): string | null {
  const lastCellArrayIndex = sourceBeforeCursor.lastIndexOf("cells");
  const lastObjectStart = sourceBeforeCursor.lastIndexOf("{");
  if (lastCellArrayIndex < 0 || lastObjectStart < lastCellArrayIndex) {
    return null;
  }

  const currentObject = sourceBeforeCursor.slice(lastObjectStart);
  const typeMatch = currentObject.match(/"type"\s*:\s*"([^"]+)"|(?:^|\n)\s*type\s*:\s*([\w-]+)/);
  return typeMatch?.[1] ?? typeMatch?.[2] ?? null;
}

function resolvePropertyValues(propertyName: string, data: CompletionData): string[] {
  if (propertyName === "sourceRunCellId" || propertyName === "baselineRunCellId") {
    return data.runIds;
  }
  if (propertyName === "matrixCellId" || propertyName.endsWith("MatrixCellId")) {
    return data.matrixIds;
  }
  if (propertyName === "modelId" || propertyName === "sourceModelId") {
    return data.modelIds;
  }
  if (propertyName === "variables" || propertyName === "name") {
    return data.variableNames;
  }
  return data.enumValues[propertyName] ?? [];
}

function detectPropertyNameBeforeValue(before: string): string | null {
  const jsonMatch = before.match(/"([^"]+)"\s*:\s*(?:"[^"]*)?$/);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  return null;
}

function buildEditorDiagnostics(
  diagnostics: SourceCodeEditorDiagnostics,
  documentLength: number
): Diagnostic[] {
  if (diagnostics.parseValid && diagnostics.schemaValid && diagnostics.issues.length === 0) {
    return [];
  }

  return diagnostics.issues.slice(0, 8).map((issue) => {
    const range = resolveDiagnosticRange(issue, documentLength);
    return {
      from: range.from,
      message: formatDiagnosticMessage(issue),
      severity: "error",
      to: range.to
    };
  });
}

function formatDiagnosticMessage(issue: NotebookSourceDiagnostic): string {
  if (issue.line != null && issue.column != null) {
    return `${issue.message} (line ${issue.line}, column ${issue.column})`;
  }

  return issue.message;
}
