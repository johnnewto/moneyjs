import type { NotebookCell, NotebookDocument } from "../types";
import { Document as YamlDocument, isSeq, parseDocument as parseYamlDocument } from "yaml";
import { stringifyJsonWithCompactLeaves } from "../jsonFormat";
import { normalizeUnitMetaAliases, serializeUnitMetaAliases } from "../unitMetaAliases";
import { validateNotebookSchemaObject, type NotebookValidationIssue } from "../validation";
import {
  analyzeNotebookSourceWithPipeline,
  createNotebookSourceDiagnostic,
  parseNotebookSourceWithPipeline,
  type NotebookSourceAnalysis,
  type NotebookSourceDiagnostic,
  type NotebookSourceFormat,
  type NotebookSourcePipeline
} from "./sourcePipeline";

export type { NotebookSourceAnalysis, NotebookSourceDiagnostic, NotebookSourceFormat } from "./sourcePipeline";
export { createNotebookSourceDiagnostic } from "./sourcePipeline";

type ParsedNotebookSource =
  | { kind: "json"; value: Partial<NotebookDocument> }
  | { document: NotebookDocument; kind: "markdown" }
  | { kind: "yaml"; value: Partial<NotebookDocument> };

const notebookSourcePipeline: NotebookSourcePipeline<ParsedNotebookSource, NotebookDocument> = {
  buildDocument(parsed) {
    return parsed.kind === "markdown"
      ? parsed.document
      : normalizeNotebookObject(parsed.value, parsed.kind === "yaml" ? "YAML" : "JSON");
  },
  detectFormat: detectNotebookSourceFormat,
  fallbackFormat: "json",
  formatLabel: formatLabelForSourceFormat,
  locateSchemaDiagnostic({ allIssues, format, issue, source }) {
    return locateSchemaDiagnosticInSource(
      source,
      format,
      issue as NotebookValidationIssue,
      allIssues as NotebookValidationIssue[]
    );
  },
  parseSource(source, format) {
    if (format === "json") {
      const parsed = parseJsonNotebookSource(source);
      return parsed.ok
        ? {
            ok: true,
            parsed: { kind: "json", value: parsed.value },
            schemaTarget: buildJsonSchemaTarget(parsed.value)
          }
        : parsed;
    }

    if (format === "yaml") {
      const parsed = parseYamlNotebookSource(source);
      return parsed.ok
        ? {
            ok: true,
            parsed: { kind: "yaml", value: parsed.value },
            schemaTarget: buildJsonSchemaTarget(parsed.value)
          }
        : parsed;
    }

    const parsed = parseMarkdownNotebookSource(source);
    return parsed.ok
      ? {
          ok: true,
          parsed: { document: parsed.document, kind: "markdown" },
          schemaTarget: serializeNotebookDocument(parsed.document)
        }
      : parsed;
  },
  validateSchema: validateNotebookSchemaObject
};

function buildJsonSchemaTarget(value: Partial<NotebookDocument>): unknown {
  try {
    return serializeNotebookDocument(normalizeNotebookObject(value, "JSON"));
  } catch {
    return value;
  }
}

interface NotebookYamlEnvelope extends Partial<NotebookDocument> {
  balance?: unknown;
  baselineRun?: unknown;
  cellOrder?: unknown;
  charts?: unknown;
  equationCell?: unknown;
  equations?: unknown;
  format?: unknown;
  formatVersion?: unknown;
  introCell?: unknown;
  initialValuesCell?: unknown;
  "initial-values"?: unknown;
  modelId?: unknown;
  notes?: unknown;
  parameters?: unknown;
  parametersCell?: unknown;
  sectors?: unknown;
  solver?: unknown;
  solverCell?: unknown;
  tables?: unknown;
  transactions?: unknown;
  units?: unknown;
  variables?: unknown;
}

const NOTEBOOK_YAML_FORMAT = "sfcr-notebook-yaml";
const NOTEBOOK_YAML_FORMAT_VERSION = 1;

export interface CompactYamlFormatOptions {
  preserveIds?: boolean;
}

export function notebookToJson(document: NotebookDocument): string {
  return stringifyJsonWithCompactLeaves(serializeNotebookDocument(document));
}

export function notebookToMarkdown(document: NotebookDocument): string {
  const lines: string[] = [`# ${document.title}`, ""];

  document.cells.forEach((cell, index) => {
    if (cell.type === "markdown") {
      lines.push(`## ${cell.title}`);
      lines.push("");
      lines.push(cell.source.trim());
      lines.push("");
      return;
    }

    lines.push(`## ${cell.title}`);
    lines.push("");
    lines.push(`\`\`\`sfcr-${cell.type}`);
    lines.push(stringifyJsonWithCompactLeaves(serializeNotebookCell(cell)));
    lines.push("```");
    lines.push("");

    if (index === document.cells.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n").trim();
}

export function notebookToCompactYaml(document: NotebookDocument, options: CompactYamlFormatOptions = {}): string {
  return stringifyCompactYamlEnvelope(buildCompactYamlEnvelope(document, options));
}

function stringifyCompactYamlEnvelope(envelope: NotebookYamlEnvelope): string {
  const document = new YamlDocument(envelope, { aliasDuplicateObjects: false });
  markFlowSequence(document, ["sectors"]);
  markMatrixFlowSequences(document, "balance");
  markMatrixFlowSequences(document, "transactions");

  return document.toString({
    collectionStyle: "any",
    flowCollectionPadding: false,
    lineWidth: 0
  }).trimEnd();
}

function markMatrixFlowSequences(document: YamlDocument, matrixKey: "balance" | "transactions"): void {
  markFlowSequence(document, [matrixKey, "columns"]);
  markFlowSequence(document, [matrixKey, "sectors"]);

  const rows = document.getIn([matrixKey, "rows"], true);
  if (!isSeq(rows)) {
    return;
  }

  rows.items.forEach((row) => {
    if (isSeq(row)) {
      row.flow = true;
    }
  });
}

function markFlowSequence(document: YamlDocument, path: Array<string | number>): void {
  const node = document.getIn(path, true);
  if (isSeq(node)) {
    node.flow = true;
  }
}

export function notebookFromJson(source: string): NotebookDocument {
  return parseNotebookSource(source, "json").document;
}
function normalizeNotebookObject(
  parsed: Partial<NotebookDocument>,
  formatLabel: "JSON" | "YAML"
): NotebookDocument {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Notebook ${formatLabel} must be an object.`);
  }
  if (typeof parsed.id !== "string" || typeof parsed.title !== "string") {
    throw new Error(`Notebook ${formatLabel} must contain string id and title fields.`);
  }
  if (!Array.isArray(parsed.cells)) {
    throw new Error(`Notebook ${formatLabel} must contain a cells array.`);
  }

  parsed.cells.forEach(validateCell);

  return normalizeNotebookDocument(parsed as NotebookDocument);
}

export function notebookFromMarkdown(source: string): NotebookDocument {
  return parseNotebookSource(source, "markdown").document;
}

export function notebookFromYaml(source: string): NotebookDocument {
  return parseNotebookSource(source, "yaml").document;
}

function parseMarkdownNotebook(source: string): NotebookDocument {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  const titleMatch = normalized.match(/^#\s+(.+)$/m);
  if (!titleMatch) {
    throw new Error("Notebook Markdown must start with a '# Title' heading.");
  }

  const title = titleMatch[1].trim();
  const content = normalized.slice(titleMatch.index! + titleMatch[0].length).trim();
  const sections = splitMarkdownSections(content);
  const cells: NotebookCell[] = [];
  let markdownIndex = 0;

  for (const section of sections) {
    const cellTitle = section.title;
    const body = section.body.trim();
    const fenceMatch = body.match(/^```sfcr-([a-z-]+)\n([\s\S]*?)\n```$/);

    if (fenceMatch) {
      const cell = JSON.parse(fenceMatch[2]) as NotebookCell;
      validateCell(cell);
      cells.push(normalizeNotebookCell(cell));
    } else if (body) {
      markdownIndex += 1;
      cells.push({
        id: `markdown-${markdownIndex}`,
        type: "markdown",
        title: cellTitle,
        source: body
      });
    }
  }

  if (cells.length === 0) {
    throw new Error("Notebook Markdown did not contain any cells.");
  }

  const document: NotebookDocument = {
    id: slugifyTitle(title),
    title,
    metadata: { version: 1 },
    cells
  };

  return document;
}

export function serializeNotebookCell(cell: NotebookCell): NotebookCell {
  switch (cell.type) {
    case "model":
      return {
        ...cell,
        editor: {
          ...cell.editor,
          equations: cell.editor.equations.map((equation) => ({
            ...equation,
            unitMeta: serializeUnitMetaAliases(equation.unitMeta)
          })),
          externals: cell.editor.externals.map((external) => ({
            ...external,
            unitMeta: serializeUnitMetaAliases(external.unitMeta)
          }))
        }
      };
    case "equations":
      return {
        ...cell,
        equations: cell.equations.map((equation) => ({
          ...equation,
          unitMeta: serializeUnitMetaAliases(equation.unitMeta)
        }))
      };
    case "externals":
      return {
        ...cell,
        externals: cell.externals.map((external) => ({
          ...external,
          unitMeta: serializeUnitMetaAliases(external.unitMeta)
        }))
      };
    case "run":
      if (!cell.scenario) {
        return structuredClone(cell);
      }

      return {
        ...cell,
        scenario: {
          ...cell.scenario,
          shocks: cell.scenario.shocks.map((shock) => {
            const { startPeriodInclusive, endPeriodInclusive, ...rest } = shock;
            return {
              ...rest,
              rangeInclusive: [startPeriodInclusive, endPeriodInclusive]
            };
          })
        }
      } as unknown as NotebookCell;
    default:
      return structuredClone(cell);
  }
}

function serializeNotebookDocument(document: NotebookDocument): NotebookDocument {
  return {
    ...document,
    cells: document.cells.map(serializeNotebookCell)
  };
}

function normalizeNotebookDocument(document: NotebookDocument): NotebookDocument {
  return {
    ...document,
    cells: document.cells.map(normalizeNotebookCell)
  };
}

function normalizeNotebookCell(cell: NotebookCell): NotebookCell {
  switch (cell.type) {
    case "model":
      return {
        ...cell,
        editor: {
          ...cell.editor,
          equations: cell.editor.equations.map((equation) => ({
            ...equation,
            unitMeta: normalizeUnitMetaAliases(equation.unitMeta)
          })),
          externals: cell.editor.externals.map((external) => ({
            ...external,
            unitMeta: normalizeUnitMetaAliases(external.unitMeta)
          }))
        }
      };
    case "equations":
      return {
        ...cell,
        equations: cell.equations.map((equation) => ({
          ...equation,
          unitMeta: normalizeUnitMetaAliases(equation.unitMeta)
        }))
      };
    case "externals":
      return {
        ...cell,
        externals: cell.externals.map((external) => ({
          ...external,
          unitMeta: normalizeUnitMetaAliases(external.unitMeta)
        }))
      };
    case "run":
      if (!cell.scenario) {
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
    default:
      return cell;
  }
}

function buildCompactYamlEnvelope(document: NotebookDocument, options: CompactYamlFormatOptions): NotebookYamlEnvelope {
  const preserveIds = options.preserveIds === true;
  const equationsCell = document.cells.find((cell): cell is Extract<NotebookCell, { type: "equations" }> => cell.type === "equations");
  const solverCell = equationsCell
    ? document.cells.find((cell): cell is Extract<NotebookCell, { type: "solver" }> => cell.type === "solver" && cell.modelId === equationsCell.modelId)
    : undefined;
  const parametersCell = equationsCell
    ? document.cells.find((cell): cell is Extract<NotebookCell, { type: "externals" }> => cell.type === "externals" && cell.modelId === equationsCell.modelId)
    : undefined;
  const initialValuesCell = equationsCell
    ? document.cells.find((cell): cell is Extract<NotebookCell, { type: "initial-values" }> => cell.type === "initial-values" && cell.modelId === equationsCell.modelId)
    : undefined;
  const baselineRunCell = equationsCell
    ? document.cells.find(
        (cell): cell is Extract<NotebookCell, { type: "run" }> =>
          cell.type === "run" && cell.mode === "baseline" && (cell.sourceModelId === equationsCell.modelId || cell.sourceModelCellId === equationsCell.id)
      )
    : document.cells.find((cell): cell is Extract<NotebookCell, { type: "run" }> => cell.type === "run" && cell.mode === "baseline");
  const balanceCell = document.cells.find(
    (cell): cell is Extract<NotebookCell, { type: "matrix" }> =>
      cell.type === "matrix" && (/balance/i.test(cell.id) || /balance/i.test(cell.title))
  );
  const transactionsCell = document.cells.find(
    (cell): cell is Extract<NotebookCell, { type: "matrix" }> =>
      cell.type === "matrix" && (/transaction/i.test(cell.id) || /transaction/i.test(cell.title))
  );
  const introCell = document.cells.find((cell): cell is Extract<NotebookCell, { type: "markdown" }> => cell.type === "markdown");
  const modelId = equationsCell ? (preserveIds ? equationsCell.modelId : generatedCompactModelId(document)) : undefined;
  const baselineRunCellId = baselineRunCell ? (preserveIds ? baselineRunCell.id : "baseline-run") : "baseline-run";
  const baselineCharts = baselineRunCell
    ? document.cells.filter(
        (cell): cell is Extract<NotebookCell, { type: "chart" }> => cell.type === "chart" && cell.sourceRunCellId === baselineRunCell.id
      )
    : [];
  const baselineTables = baselineRunCell
    ? document.cells.filter(
        (cell): cell is Extract<NotebookCell, { type: "table" }> => cell.type === "table" && cell.sourceRunCellId === baselineRunCell.id
      )
    : [];

  const idMap = new Map<string, string>();
  if (introCell) idMap.set(introCell.id, preserveIds ? introCell.id : "overview");
  if (balanceCell) idMap.set(balanceCell.id, preserveIds ? balanceCell.id : "balance-sheet");
  if (transactionsCell) idMap.set(transactionsCell.id, preserveIds ? transactionsCell.id : "transactions-flow");
  if (equationsCell && modelId) idMap.set(equationsCell.id, preserveIds ? equationsCell.id : `equations-${modelId}`);
  if (solverCell && modelId) idMap.set(solverCell.id, preserveIds ? solverCell.id : `solver-${modelId}`);
  if (parametersCell && modelId) idMap.set(parametersCell.id, preserveIds ? parametersCell.id : `parameters-${modelId}`);
  if (initialValuesCell && modelId) idMap.set(initialValuesCell.id, preserveIds ? initialValuesCell.id : `initial-values-${modelId}`);
  if (baselineRunCell) idMap.set(baselineRunCell.id, baselineRunCellId);
  baselineCharts.forEach((cell, index) => idMap.set(cell.id, preserveIds ? cell.id : `chart-${index + 1}`));
  baselineTables.forEach((cell, index) => idMap.set(cell.id, preserveIds ? cell.id : `table-${index + 1}`));
  const modelIdMap = new Map<string, string>();
  if (equationsCell?.modelId && modelId) modelIdMap.set(equationsCell.modelId, modelId);

  const compactVariables = equationsCell ? buildCompactVariables(equationsCell, parametersCell) : undefined;
  const compactUnits = buildCompactUnits(compactVariables);

  const compact: NotebookYamlEnvelope = {
    format: NOTEBOOK_YAML_FORMAT,
    formatVersion: NOTEBOOK_YAML_FORMAT_VERSION,
    id: document.id,
    title: document.title,
    metadata: {
      version: 1,
      ...(document.metadata.template ? { template: document.metadata.template } : {}),
      ...(introCell ? { description: introCell.source } : {})
    },
    ...(modelId ? { modelId } : {})
  };

  if (introCell && (preserveIds || introCell.title !== "Overview")) {
    compact.introCell = {
      ...(preserveIds ? { id: introCell.id } : {}),
      title: introCell.title
    };
  }

  if (balanceCell) {
    compact.sectors = balanceCell.sectors ?? balanceCell.columns;
  }
  if (compactUnits) {
    compact.units = compactUnits;
  }

  if (equationsCell) {
    compact.variables = compactVariables;
    compact.equations = equationsCell.equations
      .map((equation) => `${equation.desc ? `# ${equation.desc}\n` : ""}${equation.name} ~ ${equation.expression}`)
      .join("\n\n");
    compact.equationCell = buildCompactCellDescriptor(equationsCell, {
      fallbackId: modelId ? `equations-${modelId}` : equationsCell.id,
      fallbackTitle: "Equations",
      preserveIds
    });
  }

  if (balanceCell) {
    compact.balance = buildCompactMatrixDescriptor(balanceCell, { fallbackId: "balance-sheet", preserveIds });
  }
  if (transactionsCell) {
    compact.transactions = buildCompactMatrixDescriptor(transactionsCell, { fallbackId: "transactions-flow", preserveIds });
  }
  if (parametersCell && parametersCell.externals.length > 0) {
    compact.parameters = Object.fromEntries(parametersCell.externals.map((external) => [external.name, scalarFromValueText(external.valueText)]));
    compact.parametersCell = buildCompactCellDescriptor(parametersCell, {
      fallbackId: modelId ? `parameters-${modelId}` : parametersCell.id,
      fallbackTitle: "Parameters",
      preserveIds
    });
  }
  if (initialValuesCell) {
    compact["initial-values"] = Object.fromEntries(
      initialValuesCell.initialValues.map((initialValue) => [initialValue.name, scalarFromValueText(initialValue.valueText)])
    );
    compact.initialValuesCell = buildCompactCellDescriptor(initialValuesCell, {
      fallbackId: modelId ? `initial-values-${modelId}` : initialValuesCell.id,
      fallbackTitle: "Initial values",
      preserveIds
    });
  }
  if (solverCell) {
    compact.solver = buildCompactSolverDescriptor(solverCell.options);
    compact.solverCell = buildCompactCellDescriptor(solverCell, {
      fallbackId: modelId ? `solver-${modelId}` : solverCell.id,
      fallbackTitle: "Solver options",
      preserveIds
    });
  }
  if (baselineRunCell) {
    compact.baselineRun = {
      ...(preserveIds ? { id: baselineRunCell.id } : {}),
      title: baselineRunCell.title,
      ...(baselineRunCell.note ? { note: baselineRunCell.note } : {}),
      ...(baselineRunCell.description ? { description: baselineRunCell.description } : {}),
      resultKey: baselineRunCell.resultKey,
      periods: baselineRunCell.periods,
      ...(baselineRunCell.baselineStartPeriod == null ? {} : { baselineStartPeriod: baselineRunCell.baselineStartPeriod })
    };
  }
  if (baselineCharts.length > 0) {
    compact.charts = baselineCharts.map((cell, index) => buildCompactChartDescriptor(cell, { fallbackId: `chart-${index + 1}`, preserveIds }));
  }
  if (baselineTables.length > 0) {
    compact.tables = baselineTables.map((cell, index) => buildCompactTableDescriptor(cell, { fallbackId: `table-${index + 1}`, preserveIds }));
  }

  const compactedCellIds = new Set([
    introCell?.id,
    balanceCell?.id,
    transactionsCell?.id,
    equationsCell?.id,
    solverCell?.id,
    parametersCell?.id,
    initialValuesCell?.id,
    baselineRunCell?.id,
    ...baselineCharts.map((cell) => cell.id),
    ...baselineTables.map((cell) => cell.id)
  ].filter((id): id is string => typeof id === "string"));
  const passthroughCells = document.cells
    .filter((cell) => !compactedCellIds.has(cell.id))
    .map((cell) => rewriteCompactReferences(serializeNotebookCell(cell), idMap, modelIdMap) as NotebookCell);
  if (passthroughCells.length > 0) {
    compact.cells = passthroughCells;
  }
  compact.cellOrder = document.cells.map((cell) => idMap.get(cell.id) ?? cell.id);

  return compact;
}

function generatedCompactModelId(document: NotebookDocument): string {
  return document.metadata.template ?? slugifyIdentifier(document.id.replace(/-?notebook$/i, "")) ?? "main";
}

function buildCompactCellDescriptor(
  cell: NotebookCell,
  options: { fallbackId: string; fallbackTitle: string; preserveIds: boolean }
): Record<string, unknown> | undefined {
  const descriptor = {
    ...(options.preserveIds ? { id: cell.id } : {}),
    ...(cell.title !== options.fallbackTitle ? { title: cell.title } : {}),
    ...compactCellFlags(cell)
  };
  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
}

function buildCompactVariables(
  equationsCell: Extract<NotebookCell, { type: "equations" }>,
  parametersCell: Extract<NotebookCell, { type: "externals" }> | undefined
): Record<string, Record<string, unknown>> {
  const variables: Record<string, Record<string, unknown>> = {};
  equationsCell.equations.forEach((equation) => {
    variables[equation.name] = {
      ...(equation.desc ? { description: equation.desc } : {}),
      ...compactUnitFields(equation.unitMeta),
      ...(equation.role ? { role: equation.role } : {})
    };
  });
  parametersCell?.externals.forEach((external) => {
    variables[external.name] = {
      ...(external.desc ? { description: external.desc } : {}),
      ...compactUnitFields(external.unitMeta)
    };
  });
  return variables;
}

function compactUnitFields(unitMeta: Extract<NotebookCell, { type: "equations" }>["equations"][number]["unitMeta"]): Record<string, unknown> {
  if (!unitMeta) {
    return {};
  }
  const unit = formatCompactUnit(unitMeta);
  return {
    ...(unit ? { unit } : { unitMeta }),
    ...(unitMeta.stockFlow ? { type: unitMeta.stockFlow } : {})
  };
}

function buildCompactUnits(variables: Record<string, Record<string, unknown>> | undefined): Record<string, string> | undefined {
  if (!variables) {
    return undefined;
  }

  let hasCurrency = false;
  let hasTime = false;
  let hasLabor = false;

  Object.values(variables).forEach((meta) => {
    const unit = typeof meta.unit === "string" ? meta.unit : "";
    hasCurrency ||= unit.includes("$");
    hasTime ||= /(?:^|\/)y(?:ea)?r$|1\/y(?:ea)?r/.test(unit);
    hasLabor ||= /items?/.test(unit);

    const unitMeta = isRecord(meta.unitMeta) ? meta.unitMeta : undefined;
    const signature = unitMeta ? compactUnitSignature(unitMeta) : undefined;
    hasCurrency ||= typeof signature?.money === "number";
    hasTime ||= typeof signature?.time === "number";
    hasLabor ||= typeof signature?.items === "number";
  });

  const units: Record<string, string> = {};
  if (hasCurrency) units.currency = "$";
  if (hasTime) units.time = "year";
  if (hasLabor) units.labor = "items";
  return Object.keys(units).length > 0 ? units : undefined;
}

function buildCompactSolverDescriptor(options: Extract<NotebookCell, { type: "solver" }>["options"]): Record<string, unknown> {
  return {
    ...(options.periods == null ? {} : { periods: options.periods }),
    method: options.solverMethod.toLowerCase().replace(/_/g, "-"),
    tolerance: options.toleranceText,
    maxIterations: options.maxIterations,
    defaultInitialValue: options.defaultInitialValueText,
    hiddenLeftVariable: options.hiddenLeftVariable,
    hiddenRightVariable: options.hiddenRightVariable,
    hiddenTolerance: options.hiddenToleranceText,
    relativeHiddenTolerance: options.relativeHiddenTolerance
  };
}

function buildCompactMatrixDescriptor(
  cell: Extract<NotebookCell, { type: "matrix" }>,
  options: { fallbackId: string; preserveIds: boolean }
): Record<string, unknown> {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.description ? { description: cell.description } : {}),
    ...(cell.note ? { note: cell.note } : {}),
    columns: cell.columns,
    ...(cell.sectors ? { sectors: cell.sectors } : {}),
    rows: cell.rows.map((row) => (row.band == null ? { label: row.label, values: row.values } : [row.band, row.label, ...row.values]))
  };
}

function buildCompactChartDescriptor(
  cell: Extract<NotebookCell, { type: "chart" }>,
  options: { fallbackId: string; preserveIds: boolean }
): Record<string, unknown> {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.description ? { description: cell.description } : {}),
    ...(cell.note ? { note: cell.note } : {}),
    variables: cell.variables,
    ...(cell.axisMode ? { axisMode: cell.axisMode } : {}),
    ...(cell.axisSnapTolarance == null ? {} : { axisSnapTolarance: cell.axisSnapTolarance }),
    ...(cell.niceScale == null ? {} : { niceScale: cell.niceScale }),
    ...(cell.referenceTrace ? { referenceTrace: cell.referenceTrace } : {}),
    ...(cell.yAxisTickCount == null ? {} : { yAxisTickCount: cell.yAxisTickCount }),
    ...(cell.sharedRange ? { sharedRange: cell.sharedRange } : {}),
    ...(cell.seriesRanges ? { seriesRanges: cell.seriesRanges } : {}),
    ...(cell.timeRangeInclusive ? { timeRangeInclusive: cell.timeRangeInclusive } : {})
  };
}

function buildCompactTableDescriptor(
  cell: Extract<NotebookCell, { type: "table" }>,
  options: { fallbackId: string; preserveIds: boolean }
): Record<string, unknown> {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.note ? { note: cell.note } : {}),
    ...(cell.description ? { description: cell.description } : {}),
    variables: cell.variables
  };
}

function rewriteCompactReferences(value: unknown, idMap: Map<string, string>, modelIdMap: Map<string, string>, key?: string): unknown {
  if (typeof value === "string") {
    if ((key === "modelId" || key === "sourceModelId") && modelIdMap.has(value)) {
      return modelIdMap.get(value);
    }
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteCompactReferences(entry, idMap, modelIdMap));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, rewriteCompactReferences(entry, idMap, modelIdMap, entryKey)]));
}

function scalarFromValueText(valueText: string): string | number | boolean {
  if (valueText === "true") {
    return true;
  }
  if (valueText === "false") {
    return false;
  }
  const number = Number(valueText);
  return Number.isFinite(number) && String(number) === valueText.trim() ? number : valueText;
}

function formatCompactUnit(unitMeta: Extract<NotebookCell, { type: "equations" }>["equations"][number]["unitMeta"]): string | undefined {
  const signature = compactUnitSignature(unitMeta);
  if (!signature) {
    return undefined;
  }
  const money = signature.money;
  const time = signature.time;
  const items = signature.items;
  if (Object.keys(signature).length === 0) return "1";
  if (money === 1 && time === -1 && items == null) return "$/year";
  if (money === 1 && time == null && items == null) return "$";
  if (time === -1 && money == null && items == null) return "1/year";
  if (items === 1 && time === -1 && money == null) return "items/year";
  if (money === 1 && items === -1 && time == null) return "$/item";
  if (time === 1 && money == null && items == null) return "year";
  return undefined;
}

function compactUnitSignature(unitMeta: unknown): Record<string, number> | undefined {
  if (!isRecord(unitMeta)) {
    return undefined;
  }
  if (isRecord(unitMeta.signature)) {
    return Object.fromEntries(Object.entries(unitMeta.signature).filter(([, value]) => typeof value === "number")) as Record<string, number>;
  }
  const units = isRecord(unitMeta.units) ? unitMeta.units : undefined;
  if (!units) {
    return undefined;
  }
  return {
    ...(typeof units.$ === "number" ? { money: units.$ } : {}),
    ...(typeof units.money === "number" ? { money: units.money } : {}),
    ...(typeof units.yr === "number" ? { time: units.yr } : {}),
    ...(typeof units.time === "number" ? { time: units.time } : {}),
    ...(typeof units.items === "number" ? { items: units.items } : {})
  };
}

export function detectNotebookSourceFormat(source: string): NotebookSourceFormat {
  const normalized = source.trimStart();
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return "json";
  }
  if (normalized.startsWith("#")) {
    return "markdown";
  }
  if (looksLikeYamlNotebookSource(normalized)) {
    return "yaml";
  }
  throw new Error("Unable to detect notebook format. Expected JSON, Markdown, or YAML.");
}

export function parseNotebookSource(
  source: string,
  preferredFormat?: NotebookSourceFormat
): { document: NotebookDocument; format: NotebookSourceFormat } {
  return parseNotebookSourceWithPipeline(source, preferredFormat, notebookSourcePipeline);
}

export function analyzeNotebookSource(
  source: string,
  preferredFormat?: NotebookSourceFormat
): NotebookSourceAnalysis<NotebookDocument> {
  return analyzeNotebookSourceWithPipeline(source, preferredFormat, notebookSourcePipeline);
}

function parseJsonNotebookSource(
  source: string
):
  | { ok: true; value: Partial<NotebookDocument> }
  | { diagnostics: NotebookSourceDiagnostic[]; ok: false } {
  try {
    const parsed = JSON.parse(source) as Partial<NotebookDocument>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        diagnostics: [
          {
            ...createNotebookSourceDiagnostic({
              message: "Notebook JSON must be an object.",
              phase: "parse"
            })
          }
        ],
        ok: false
      };
    }

    return { ok: true, value: parsed };
  } catch (error) {
    return {
      diagnostics: [buildJsonParseDiagnostic(source, error)],
      ok: false
    };
  }
}

function parseMarkdownNotebookSource(
  source: string
):
  | { document: NotebookDocument; ok: true }
  | { diagnostics: NotebookSourceDiagnostic[]; ok: false } {
  try {
    return {
      document: parseMarkdownNotebook(source),
      ok: true
    };
  } catch (error) {
    return {
      diagnostics: [
        {
          ...createNotebookSourceDiagnostic({
            message: error instanceof Error ? error.message : "Unable to parse Markdown notebook source.",
            phase: "parse"
          })
        }
      ],
      ok: false
    };
  }
}

function parseYamlNotebookSource(
  source: string
):
  | { ok: true; value: Partial<NotebookDocument> }
  | { diagnostics: NotebookSourceDiagnostic[]; ok: false } {
  const dialectDiagnostic = validateYamlDialectSource(source);
  if (dialectDiagnostic) {
    return { diagnostics: [dialectDiagnostic], ok: false };
  }

  const document = parseYamlDocument(source, {
    prettyErrors: false,
    uniqueKeys: true
  });
  if (document.errors.length > 0) {
    return {
      diagnostics: document.errors.map((error) => buildYamlParseDiagnostic(source, error)),
      ok: false
    };
  }

  const parsed = document.toJSON() as NotebookYamlEnvelope;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      diagnostics: [
        createNotebookSourceDiagnostic({
          message: "Notebook YAML must be an object.",
          phase: "parse"
        })
      ],
      ok: false
    };
  }
  if (parsed.format !== NOTEBOOK_YAML_FORMAT || parsed.formatVersion !== NOTEBOOK_YAML_FORMAT_VERSION) {
    return {
      diagnostics: [
        createNotebookSourceDiagnostic({
          message: `Notebook YAML must start with format: ${NOTEBOOK_YAML_FORMAT} and formatVersion: ${NOTEBOOK_YAML_FORMAT_VERSION}.`,
          phase: "parse"
        })
      ],
      ok: false
    };
  }

  const { format: _format, formatVersion: _formatVersion, ...notebook } = parsed;
  return { ok: true, value: compileYamlNotebookSource(notebook) };
}

function compileYamlNotebookSource(source: NotebookYamlEnvelope): Partial<NotebookDocument> {
  if (Array.isArray(source.cells) && typeof source.equations !== "string") {
    return source;
  }

  if (typeof source.equations !== "string") {
    return source;
  }

  const id = stringValue(source.id, "notebook");
  const title = stringValue(source.title, id);
  const metadataInput: Record<string, unknown> = isRecord(source.metadata) ? source.metadata : {};
  const template = typeof metadataInput.template === "string" ? metadataInput.template : undefined;
  const modelId = typeof source.modelId === "string" ? source.modelId : template ? `${template}-model` : "main";
  const baselineRunInput = isRecord(source.baselineRun) ? source.baselineRun : {};
  const baselineRunCellId = stringValue(baselineRunInput.id, "baseline-run");
  const cells: NotebookCell[] = [];
  const description = typeof metadataInput.description === "string" ? metadataInput.description.trim() : "";

  if (description) {
    const introCell = isRecord(source.introCell) ? source.introCell : {};
    cells.push({
      id: compactCellId(introCell, "overview"),
      type: "markdown",
      title: compactCellTitle(introCell, "Overview"),
      source: description
    });
  }

  const balanceCell = buildCompactMatrixCell(source.balance, {
    fallbackColumns: source.sectors,
    id: "balance-sheet",
    sourceRunCellId: baselineRunCellId,
    title: "Balance sheet"
  });
  if (balanceCell) {
    cells.push(balanceCell);
  }

  const transactionsCell = buildCompactMatrixCell(source.transactions, {
    fallbackColumns: source.sectors,
    id: "transactions-flow",
    sourceRunCellId: baselineRunCellId,
    title: "Transactions-flow matrix"
  });
  if (transactionsCell) {
    cells.push(transactionsCell);
  }

  cells.push({
    id: compactCellId(source.equationCell, `equations-${modelId}`),
    type: "equations",
    title: compactCellTitle(source.equationCell, "Equations"),
    modelId,
    equations: parseCompactEquations(source.equations, source.variables),
    ...compactCellFlags(source.equationCell)
  });

  const parameters = buildCompactParameters(source.parameters, source.variables);
  if (parameters.length > 0 || isRecord(source.parametersCell)) {
    cells.push({
      id: compactCellId(source.parametersCell, `parameters-${modelId}`),
      type: "externals",
      title: compactCellTitle(source.parametersCell, "Parameters"),
      modelId,
      externals: parameters,
      ...compactCellFlags(source.parametersCell)
    });
  }

  const initialValues = buildCompactInitialValues(source["initial-values"]);
  if (initialValues.length > 0 || isRecord(source.initialValuesCell)) {
    cells.push({
      id: compactCellId(source.initialValuesCell, `initial-values-${modelId}`),
      type: "initial-values",
      title: compactCellTitle(source.initialValuesCell, "Initial values"),
      modelId,
      initialValues,
      ...compactCellFlags(source.initialValuesCell)
    });
  }

  const solverOptions = buildCompactSolverOptions(source.solver);
  cells.push({
    id: compactCellId(source.solverCell, `solver-${modelId}`),
    type: "solver",
    title: compactCellTitle(source.solverCell, "Solver options"),
    modelId,
    options: solverOptions,
    ...compactCellFlags(source.solverCell)
  });
  cells.push({
    id: baselineRunCellId,
    type: "run",
    title: stringValue(baselineRunInput.title, "Baseline run"),
    ...(typeof baselineRunInput.note === "string" ? { note: baselineRunInput.note } : {}),
    ...(typeof baselineRunInput.description === "string" ? { description: baselineRunInput.description } : {}),
    mode: "baseline",
    periods: numberValue(baselineRunInput.periods, numberValue((source.solver as Record<string, unknown> | undefined)?.periods, 50)),
    resultKey: stringValue(baselineRunInput.resultKey, "baseline"),
    sourceModelId: modelId,
    ...(typeof baselineRunInput.baselineStartPeriod === "number" ? { baselineStartPeriod: baselineRunInput.baselineStartPeriod } : {})
  });

  cells.push(...buildCompactChartCells(source.charts, baselineRunCellId));
  cells.push(...buildCompactTableCells(source.tables, baselineRunCellId));

  if (typeof source.notes === "string" && source.notes.trim()) {
    cells.push({
      id: "notes",
      type: "markdown",
      title: "Notes",
      source: source.notes.trim()
    });
  }

  if (Array.isArray(source.cells)) {
    cells.push(...(source.cells as NotebookCell[]));
  }

  return {
    id,
    title,
    metadata: {
      version: 1,
      ...(template ? { template } : {})
    },
    cells: orderCompactCells(cells, source.cellOrder)
  };
}

function compactCellId(input: unknown, fallback: string): string {
  return isRecord(input) && typeof input.id === "string" ? input.id : fallback;
}

function compactCellTitle(input: unknown, fallback: string): string {
  return isRecord(input) && typeof input.title === "string" ? input.title : fallback;
}

function compactCellFlags(input: unknown): Pick<NotebookCell, "collapsed" | "description" | "note"> {
  if (!isRecord(input)) {
    return {};
  }
  return {
    ...(typeof input.collapsed === "boolean" ? { collapsed: input.collapsed } : {}),
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.note === "string" ? { note: input.note } : {})
  };
}

function orderCompactCells(cells: NotebookCell[], cellOrder: unknown): NotebookCell[] {
  if (!Array.isArray(cellOrder)) {
    return cells;
  }
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  const orderedIds = new Set<string>();
  const orderedCells = cellOrder.flatMap((entry) => {
    const id = String(entry);
    const cell = cellsById.get(id);
    if (!cell) {
      return [];
    }
    orderedIds.add(id);
    return [cell];
  });
  return [...orderedCells, ...cells.filter((cell) => !orderedIds.has(cell.id))];
}

function parseCompactEquations(source: string, variables: unknown): Extract<NotebookCell, { type: "equations" }>["equations"] {
  const variableMeta = isRecord(variables) ? variables : {};
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z_][\w^{}.]*)\s*(?:~|=)\s*(.+)$/);
      if (!match) {
        throw new Error(`Invalid compact equation line: ${line}`);
      }

      const name = match[1];
      const meta = isRecord(variableMeta[name]) ? variableMeta[name] : {};
      return {
        id: `eq-${index}-${slugifyIdentifier(name)}`,
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        expression: match[2].trim(),
        ...(resolveEquationRole(meta) ? { role: resolveEquationRole(meta) } : {}),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    });
}

function buildCompactParameters(parameters: unknown, variables: unknown): Extract<NotebookCell, { type: "externals" }>["externals"] {
  if (!isRecord(parameters)) {
    return [];
  }

  const variableMeta = isRecord(variables) ? variables : {};
  return Object.entries(parameters).map(([name, value], index) => {
    const meta = isRecord(variableMeta[name]) ? variableMeta[name] : {};
    return {
      id: `ext-${index}-${slugifyIdentifier(name)}`,
      name,
      ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
      kind: "constant",
      valueText: String(value),
      ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
    };
  });
}

function buildCompactInitialValues(initialValues: unknown): Extract<NotebookCell, { type: "initial-values" }>["initialValues"] {
  if (!isRecord(initialValues)) {
    return [];
  }

  return Object.entries(initialValues).map(([name, value], index) => ({
    id: `init-${index}-${slugifyIdentifier(name)}`,
    name,
    valueText: String(value)
  }));
}

function buildCompactMatrixCell(
  input: unknown,
  options: { fallbackColumns: unknown; id: string; sourceRunCellId: string; title: string }
): Extract<NotebookCell, { type: "matrix" }> | null {
  if (!isRecord(input)) {
    return null;
  }

  const columns = stringArray(input.columns) ?? stringArray(options.fallbackColumns) ?? [];
  const sectors = stringArray(input.sectors);
  const rows = Array.isArray(input.rows)
    ? input.rows.map((row) => {
        if (Array.isArray(row)) {
          const [band, label, ...values] = row;
          return {
            band: String(band),
            label: String(label),
            values: values.map((value) => String(value))
          };
        }
        if (isRecord(row)) {
          return {
            ...(typeof row.band === "string" ? { band: row.band } : {}),
            label: stringValue(row.label, ""),
            values: stringArray(row.values) ?? []
          };
        }
        throw new Error("Compact matrix rows must be arrays or row objects.");
      })
    : [];

  return {
    id: typeof input.id === "string" ? input.id : options.id,
    type: "matrix",
    title: typeof input.title === "string" ? input.title : options.title,
    sourceRunCellId: options.sourceRunCellId,
    columns,
    ...(sectors ? { sectors } : {}),
    rows,
    ...compactCellFlags(input)
  };
}

function buildCompactSolverOptions(input: unknown): Extract<NotebookCell, { type: "solver" }>["options"] {
  const solver = isRecord(input) ? input : {};
  return {
    ...(solver.periods == null ? {} : { periods: numberValue(solver.periods, 50) }),
    solverMethod: normalizeSolverMethod(solver.method ?? solver.solverMethod),
    toleranceText: stringValue(solver.tolerance ?? solver.toleranceText, "1e-6"),
    maxIterations: numberValue(solver.maxIterations, 200),
    defaultInitialValueText: stringValue(solver.defaultInitialValue ?? solver.defaultInitialValueText, "1e-15"),
    hiddenLeftVariable: stringValue(solver.hiddenLeftVariable, ""),
    hiddenRightVariable: stringValue(solver.hiddenRightVariable, ""),
    hiddenToleranceText: stringValue(solver.hiddenTolerance ?? solver.hiddenToleranceText, "0.00001"),
    relativeHiddenTolerance: Boolean(solver.relativeHiddenTolerance)
  } as Extract<NotebookCell, { type: "solver" }>["options"];
}

function buildCompactChartCells(charts: unknown, sourceRunCellId: string): Array<Extract<NotebookCell, { type: "chart" }>> {
  if (!Array.isArray(charts)) {
    return [];
  }

  return charts.filter(isRecord).map((chart, index) => ({
    id: typeof chart.id === "string" ? chart.id : `chart-${index + 1}`,
    type: "chart",
    title: typeof chart.title === "string" ? chart.title : `Chart ${index + 1}`,
    ...compactCellFlags(chart),
    sourceRunCellId,
    variables: stringArray(chart.variables) ?? [],
    ...(chart.axisMode === "shared" || chart.axisMode === "separate" ? { axisMode: chart.axisMode } : {}),
    ...(typeof chart.axisSnapTolarance === "number" ? { axisSnapTolarance: chart.axisSnapTolarance } : {}),
    ...(typeof chart.niceScale === "boolean" ? { niceScale: chart.niceScale } : {}),
    ...(chart.referenceTrace === "none" || chart.referenceTrace === "baseline" || chart.referenceTrace === "previous-run" ? { referenceTrace: chart.referenceTrace } : {}),
    ...(typeof chart.yAxisTickCount === "number" ? { yAxisTickCount: chart.yAxisTickCount } : {}),
    ...(isRecord(chart.sharedRange) ? { sharedRange: chart.sharedRange as Extract<NotebookCell, { type: "chart" }>["sharedRange"] } : {}),
    ...(isRecord(chart.seriesRanges) ? { seriesRanges: chart.seriesRanges as Extract<NotebookCell, { type: "chart" }>["seriesRanges"] } : {}),
    ...(Array.isArray(chart.timeRangeInclusive) ? { timeRangeInclusive: chart.timeRangeInclusive as [number, number] } : {})
  }));
}

function buildCompactTableCells(tables: unknown, sourceRunCellId: string): Array<Extract<NotebookCell, { type: "table" }>> {
  if (!Array.isArray(tables)) {
    return [];
  }

  return tables.filter(isRecord).map((table, index) => ({
    id: typeof table.id === "string" ? table.id : `table-${index + 1}`,
    type: "table",
    title: typeof table.title === "string" ? table.title : `Table ${index + 1}`,
    ...(typeof table.note === "string" ? { note: table.note } : {}),
    ...(typeof table.description === "string" ? { description: table.description } : {}),
    ...(typeof table.collapsed === "boolean" ? { collapsed: table.collapsed } : {}),
    sourceRunCellId,
    variables: stringArray(table.variables) ?? []
  }));
}

function resolveEquationRole(meta: Record<string, unknown>): Extract<NotebookCell, { type: "equations" }>["equations"][number]["role"] | undefined {
  if (typeof meta.role === "string") {
    return meta.role as Extract<NotebookCell, { type: "equations" }>["equations"][number]["role"];
  }
  if (meta.type === "stock") {
    return "accumulation";
  }
  if (meta.type === "flow") {
    return "identity";
  }
  return undefined;
}

function buildUnitMeta(meta: Record<string, unknown>): Extract<NotebookCell, { type: "equations" }>["equations"][number]["unitMeta"] | undefined {
  const unit = typeof meta.unit === "string" ? meta.unit : undefined;
  const unitMeta = isRecord(meta.unitMeta) ? meta.unitMeta : undefined;
  if (unitMeta) {
    return unitMeta;
  }
  const stockFlow = meta.type === "stock" || meta.type === "flow" || meta.type === "aux" ? meta.type : undefined;
  const signature = unit ? parseCompactUnit(unit) : undefined;
  if (!stockFlow && !signature) {
    return undefined;
  }
  return {
    ...(stockFlow ? { stockFlow } : {}),
    ...(signature ? { signature } : {})
  };
}

function parseCompactUnit(unit: string): Record<string, number> | undefined {
  const normalized = unit.trim();
  if (!normalized || normalized === "1") {
    return undefined;
  }
  if (normalized === "$") {
    return { money: 1 };
  }
  if (normalized === "$/year" || normalized === "$/yr") {
    return { money: 1, time: -1 };
  }
  if (normalized === "1/year" || normalized === "1/yr") {
    return { time: -1 };
  }
  if (normalized === "items/year" || normalized === "items/yr") {
    return { items: 1, time: -1 };
  }
  if (normalized === "$/item" || normalized === "$/items") {
    return { money: 1, items: -1 };
  }
  if (normalized === "year" || normalized === "yr") {
    return { time: 1 };
  }
  return undefined;
}

function normalizeSolverMethod(value: unknown): "GAUSS_SEIDEL" | "BROYDEN" | "NEWTON" {
  const normalized = typeof value === "string" ? value.toUpperCase().replace(/-/g, "_") : "NEWTON";
  if (normalized === "GAUSS_SEIDEL" || normalized === "BROYDEN" || normalized === "NEWTON") {
    return normalized;
  }
  return "NEWTON";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : null;
}

function stringValue(value: unknown, fallback: string): string {
  return value == null ? fallback : String(value);
}

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function slugifyIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "value";
}

function validateYamlDialectSource(source: string): NotebookSourceDiagnostic | null {
  let lineOffset = 0;
  for (const line of source.split(/\n/)) {
    const lineWithoutQuotedText = stripYamlQuotedText(line);
    const forbiddenMatch = lineWithoutQuotedText.match(/^(\s*)(?:<<\s*:|[^#]*\s[&*][A-Za-z0-9_-]+(?:\s|$))/);
    if (forbiddenMatch?.index != null) {
      const offset = lineOffset + forbiddenMatch[1].length;
      const position = offsetToLineColumn(source, offset);
      return createNotebookSourceDiagnostic({
        column: position.column,
        line: position.line,
        message: "Notebook YAML does not allow anchors, aliases, or merge keys.",
        offset,
        phase: "parse"
      });
    }
    lineOffset += line.length + 1;
  }

  return null;
}

function stripYamlQuotedText(line: string): string {
  let result = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of line) {
    if (quote) {
      if (quote === '"' && char === "\\" && !escaped) {
        escaped = true;
        result += " ";
        continue;
      }
      if (char === quote && !escaped) {
        quote = null;
      }
      escaped = false;
      result += " ";
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += " ";
      continue;
    }

    result += char;
  }

  return result;
}

function buildYamlParseDiagnostic(source: string, error: unknown): NotebookSourceDiagnostic {
  const yamlError = error as { linePos?: Array<{ col: number; line: number }>; message?: string; pos?: [number, number] };
  const offset = typeof yamlError.pos?.[0] === "number" ? yamlError.pos[0] : undefined;
  const linePosition = yamlError.linePos?.[0];
  const offsetPosition = offset == null ? null : offsetToLineColumn(source, offset);
  const position = linePosition
    ? { column: linePosition.col, line: linePosition.line }
    : offsetPosition;
  return createNotebookSourceDiagnostic({
    column: position?.column,
    endOffset: typeof yamlError.pos?.[1] === "number" ? yamlError.pos[1] : undefined,
    line: position?.line,
    message: `Notebook YAML parse failed: ${yamlError.message ?? "Unable to parse YAML notebook source."}`,
    offset,
    phase: "parse"
  });
}

function buildJsonParseDiagnostic(source: string, error: unknown): NotebookSourceDiagnostic {
  const message = error instanceof Error ? error.message : "Unable to parse JSON notebook source.";
  const offsetMatch = message.match(/position\s+(\d+)/i);
  const offset = offsetMatch ? Number.parseInt(offsetMatch[1], 10) : undefined;
  const position = offset == null ? null : offsetToLineColumn(source, offset);
  return {
    ...createNotebookSourceDiagnostic({
      column: position?.column,
      line: position?.line,
      message: `Notebook JSON parse failed: ${message}`,
      offset,
      phase: "parse"
    }),
    column: position?.column,
    line: position?.line,
    message: `Notebook JSON parse failed: ${message}`,
    offset,
    phase: "parse"
  };
}

function offsetToLineColumn(source: string, offset: number): { column: number; line: number } {
  let line = 1;
  let column = 1;

  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { column, line };
}

function formatLabelForSourceFormat(format: NotebookSourceFormat): "JSON" | "Markdown" | "YAML" {
  if (format === "json") {
    return "JSON";
  }
  if (format === "yaml") {
    return "YAML";
  }
  return "Markdown";
}

function locateSchemaDiagnosticInSource(
  source: string,
  format: NotebookSourceFormat,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  if (format === "json") {
    return locateJsonSchemaDiagnostic(source, issue, allIssues);
  }
  if (format === "yaml") {
    return locateYamlSchemaDiagnostic(source, issue, allIssues);
  }

  return {};
}

function locateYamlSchemaDiagnostic(
  source: string,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  const targetPath = buildSchemaTargetPath(issue, allIssues);
  const targetKey =
    (targetPath.length > 0 && typeof targetPath[targetPath.length - 1] === "string"
      ? (targetPath[targetPath.length - 1] as string)
      : undefined) ?? issue.relatedProperty;
  if (!targetKey) {
    return {};
  }

  const keyPattern = new RegExp(`(^|\\n)\\s*(?:${escapeRegExp(targetKey)}|["']${escapeRegExp(targetKey)}["'])\\s*:`, "m");
  const match = source.match(keyPattern);
  if (!match || match.index == null) {
    return {};
  }

  const offset = match.index + match[1].length + match[0].slice(match[1].length).search(/\S/);
  const keyLength = targetKey.length;
  const position = offsetToLineColumn(source, offset);
  return {
    column: position.column,
    endOffset: offset + keyLength,
    line: position.line,
    offset
  };
}

function looksLikeYamlNotebookSource(source: string): boolean {
  return /^(?:---\s*\n)?\s*(?:format|id|title|metadata|cells)\s*:/m.test(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locateJsonSchemaDiagnostic(
  source: string,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  const targetPath = buildSchemaTargetPath(issue, allIssues);
  const targetKey =
    (targetPath.length > 0 && typeof targetPath[targetPath.length - 1] === "string"
      ? (targetPath[targetPath.length - 1] as string)
      : undefined) ?? issue.relatedProperty;
  if (!targetKey) {
    return {};
  }

  const keyToken = `"${targetKey}"`;
  const offset = source.indexOf(keyToken);
  if (offset < 0) {
    return {};
  }

  const position = offsetToLineColumn(source, offset);
  return {
    column: position.column,
    endOffset: offset + keyToken.length,
    line: position.line,
    offset
  };
}

function buildSchemaTargetPath(issue: NotebookValidationIssue, allIssues: NotebookValidationIssue[]): unknown[] {
  const path = parseNotebookIssuePath(issue.path);
  const relatedProperty = resolveSchemaRelatedProperty(issue, allIssues);
  if (issue.keyword === "required" && !relatedProperty) {
    return path;
  }
  if (relatedProperty) {
    return [...path, relatedProperty];
  }
  return path;
}

function resolveSchemaRelatedProperty(
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): string | undefined {
  if (issue.keyword !== "required") {
    return issue.relatedProperty;
  }

  const expectedProperty = issue.relatedProperty;
  if (!expectedProperty) {
    return undefined;
  }

  const siblingAdditionalProperty = allIssues.find(
    (candidate) =>
      candidate !== issue &&
      candidate.keyword === "additionalProperties" &&
      candidate.path === issue.path &&
      isLikelyMisspelledProperty(expectedProperty, candidate.relatedProperty)
  );

  return siblingAdditionalProperty?.relatedProperty ?? expectedProperty;
}

function isLikelyMisspelledProperty(expected: string, candidate: string | undefined): boolean {
  if (!candidate) {
    return false;
  }

  if (candidate === expected) {
    return true;
  }

  if (candidate.includes(expected) || expected.includes(candidate)) {
    return true;
  }

  return levenshteinDistance(expected, candidate) <= 2;
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][columns - 1];
}

function parseNotebookIssuePath(path: string | undefined): unknown[] {
  if (!path || path === "/") {
    return [];
  }

  return path
    .split("/")
    .slice(1)
    .map((segment) => decodeJsonPointerSegment(segment))
    .map((segment) => (/^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment));
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function validateCell(cell: NotebookCell | Partial<NotebookCell>): void {
  if (!cell || typeof cell !== "object") {
    throw new Error("Notebook cell must be an object.");
  }
  if (typeof cell.id !== "string" || typeof cell.title !== "string" || typeof cell.type !== "string") {
    throw new Error("Notebook cell must contain id, title, and type.");
  }
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "notebook";
}

function splitMarkdownSections(content: string): Array<{ title: string; body: string }> {
  const lines = content.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = line.slice(3).trim();
      currentBody = [];
      continue;
    }

    if (currentTitle) {
      currentBody.push(line);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }

  return sections;
}
