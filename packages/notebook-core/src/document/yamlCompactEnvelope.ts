import type { NotebookCell, NotebookDocument } from "../types";
import {
  NOTEBOOK_YAML_FORMAT,
  NOTEBOOK_YAML_FORMAT_VERSION,
  type CompactYamlFormatOptions,
  type NotebookYamlEnvelope
} from "./documentTypes";
import { serializeNotebookCell } from "./notebookSerialize";
import {
  buildCompactChartDescriptor,
  buildCompactEquationRow,
  buildCompactExternalRow,
  buildCompactInitialValueRow,
  buildCompactSolverDescriptor,
  buildCompactTableDescriptor,
  compactCellFlags,
  generatedCompactModelId,
  isNotebookCellType,
  rewriteCompactReferences
} from "./yamlCompactHelpers";
import { stringifyCompactYamlEnvelope } from "./yamlFlowStyle";

export function buildCompactYamlEnvelope(document: NotebookDocument, options: CompactYamlFormatOptions): NotebookYamlEnvelope {
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

  const compact: NotebookYamlEnvelope = {
    format: NOTEBOOK_YAML_FORMAT,
    formatVersion: NOTEBOOK_YAML_FORMAT_VERSION,
    id: document.id,
    title: document.title,
    metadata: {
      version: 1,
      ...(document.metadata.template ? { template: document.metadata.template } : {})
    }
  };

  (compact as Record<string, unknown>).cells = document.cells.map((cell) =>
    wrapCompactYamlCell(rewriteCompactReferences(serializeCompactYamlCell(cell), idMap, modelIdMap) as Record<string, unknown>)
  );

  return compact;
}

export function wrapCompactYamlCell(cell: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const type = typeof cell.type === "string" && isNotebookCellType(cell.type) ? cell.type : "markdown";
  const { type: _type, ...body } = cell;
  return {
    [type]: body
  };
}

export function serializeCompactYamlCell(cell: NotebookCell): Record<string, unknown> {
  switch (cell.type) {
    case "markdown":
      return structuredClone(cell) as unknown as Record<string, unknown>;
    case "matrix":
      return {
        id: cell.id,
        type: "matrix",
        title: cell.title,
        ...(cell.description ? { description: cell.description } : {}),
        ...(cell.note ? { note: cell.note } : {}),
        ...(cell.collapsed == null ? {} : { collapsed: cell.collapsed }),
        ...(cell.sourceRunCellId ? { sourceRunCellId: cell.sourceRunCellId } : {}),
        columns: cell.columns,
        ...(cell.sectors ? { sectors: cell.sectors } : {}),
        rows: cell.rows.map((row) => (row.band == null ? { label: row.label, values: row.values } : [row.band, row.label, ...row.values]))
      };
    case "equations":
      return {
        id: cell.id,
        type: "equations",
        title: cell.title,
        modelId: cell.modelId,
        ...compactCellFlags(cell),
        rows: cell.equations.map(buildCompactEquationRow)
      };
    case "externals":
      return {
        id: cell.id,
        type: "externals",
        title: cell.title,
        modelId: cell.modelId,
        ...compactCellFlags(cell),
        rows: cell.externals.map(buildCompactExternalRow)
      };
    case "initial-values":
      return {
        id: cell.id,
        type: "initial-values",
        title: cell.title,
        modelId: cell.modelId,
        ...compactCellFlags(cell),
        rows: cell.initialValues.map(buildCompactInitialValueRow)
      };
    case "solver":
      return {
        id: cell.id,
        type: "solver",
        title: cell.title,
        modelId: cell.modelId,
        ...compactCellFlags(cell),
        ...buildCompactSolverDescriptor(cell.options)
      };
    case "chart":
      return {
        id: cell.id,
        type: "chart",
        ...buildCompactChartDescriptor(cell, { fallbackId: cell.id, preserveIds: true }),
        sourceRunCellId: cell.sourceRunCellId
      };
    case "table":
      return {
        id: cell.id,
        type: "table",
        ...buildCompactTableDescriptor(cell, { fallbackId: cell.id, preserveIds: true }),
        sourceRunCellId: cell.sourceRunCellId
      };
    default:
      return serializeNotebookCell(cell) as unknown as Record<string, unknown>;
  }
}

export function notebookToCompactYaml(document: NotebookDocument, options: CompactYamlFormatOptions = {}): string {
  return stringifyCompactYamlEnvelope(buildCompactYamlEnvelope(document, options));
}
