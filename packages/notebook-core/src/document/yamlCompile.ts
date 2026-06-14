import type { NotebookCell, NotebookDocument } from "../types";
import type { NotebookYamlEnvelope } from "./documentTypes";
import { isRecord, numberValue, stringValue } from "./documentUtils";
import {
  buildCompactChartCells,
  buildCompactInitialValues,
  buildCompactMatrixCell,
  buildCompactParameters,
  buildCompactSolverOptions,
  buildCompactTableCells,
  compactCellFlags,
  compactCellId,
  compactCellTitle,
  orderCompactCells,
  parseCompactEquations
} from "./yamlCompactHelpers";
import { normalizeYamlCellEntries, normalizeYamlNotebookCells } from "./yamlCellWrappers";

export function compileYamlNotebookSource(source: NotebookYamlEnvelope): Partial<NotebookDocument> {
  if (Array.isArray(source.cells) && typeof source.equations !== "string") {
    return normalizeYamlNotebookCells(source);
  }

  if (typeof source.equations !== "string") {
    return source;
  }

  // Legacy compact envelope: top-level `equations:` string plus optional envelope fields.
  // Prefer `cells:` with wrapper-style typed cells (`- equations:`, `- run:`, etc.).
  const id = stringValue(source.id, "notebook");
  const title = stringValue(source.title, id);
  const metadataInput: Record<string, unknown> = isRecord(source.metadata) ? source.metadata : {};
  const template = typeof metadataInput.template === "string" ? metadataInput.template : undefined;
  const sourceFileName =
    typeof metadataInput.sourceFileName === "string" ? metadataInput.sourceFileName.trim() : "";
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
    cells.push({
      ...balanceCell,
      accountingKind: balanceCell.accountingKind ?? "balance-sheet"
    });
  }

  const transactionsCell = buildCompactMatrixCell(source.transactions, {
    fallbackColumns: source.sectors,
    id: "transactions-flow",
    sourceRunCellId: baselineRunCellId,
    title: "Transactions-flow matrix"
  });
  if (transactionsCell) {
    cells.push({
      ...transactionsCell,
      accountingKind: transactionsCell.accountingKind ?? "transaction-flow"
    });
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
    cells.push(...normalizeYamlCellEntries(source.cells));
  }

  return {
    id,
    title,
    metadata: {
      version: 1,
      ...(template ? { template } : {}),
      ...(sourceFileName ? { sourceFileName } : {})
    },
    cells: orderCompactCells(cells, source.cellOrder)
  };
}
