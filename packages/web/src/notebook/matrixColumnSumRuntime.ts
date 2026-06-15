import {
  extractMatrixColumnSumRefsFromSource,
  parseEquation,
  type MatrixColumnCellLocation,
  type MatrixColumnSumBindings,
  type MatrixColumnSumLocations
} from "@sfcr/core";
import {
  parseMatrixSectorDisplay,
  parseVariableFromColumnLabel,
  resolveMatrixColumnInspectVariable,
  resolveMatrixColumnSumReference
} from "@sfcr/notebook-core";

import { evaluateMatrixEntryNumber, isSumLabel } from "./matrixAccountSumRow";
import { isSkippableMatrixCellSource } from "@sfcr/core";
import { resolveAccountingMatrixKind } from "./validation";
import type { MatrixCell, NotebookCell, RunCell } from "./types";
import type { SimulationResult } from "@sfcr/core";

export function formatMatrixColumnSumReference(columnLabel: string): string {
  return columnLabel.trim().replace(/\s*\([^)]+\)\s*$/, "").trim();
}

/** Builds sum(columnRef) key from separate sector and account column labels. */
export function formatQualifiedMatrixColumnSumReference(
  sectorLabel: string,
  columnLabel: string
): string {
  const baseRef = formatMatrixColumnSumReference(columnLabel);
  if (!baseRef || baseRef.includes(".")) {
    return baseRef;
  }
  const sectorName = parseMatrixSectorDisplay(sectorLabel).sectorName.trim();
  if (!sectorName) {
    return baseRef;
  }
  return `${sectorName}.${baseRef}`;
}

export function columnHasFlowEntries(
  matrix: MatrixCell,
  columnIndex: number,
  sumRowIndex: number
): boolean {
  for (let rowIndex = 0; rowIndex < sumRowIndex; rowIndex += 1) {
    const raw = matrix.rows[rowIndex]?.values[columnIndex]?.trim() ?? "";
    if (raw && raw !== "0") {
      return true;
    }
  }
  return false;
}

function isAccountTransactionsMatrix(cell: MatrixCell): boolean {
  return resolveAccountingMatrixKind(cell) === "account-transactions";
}

function collectColumnCellSources(
  matrix: MatrixCell,
  columnIndex: number,
  sumRowIndex: number
): Array<{ source: string; location: MatrixColumnCellLocation }> {
  const sources: Array<{ source: string; location: MatrixColumnCellLocation }> = [];
  for (let rowIndex = 0; rowIndex < sumRowIndex; rowIndex += 1) {
    const raw = matrix.rows[rowIndex]?.values[columnIndex]?.trim() ?? "";
    if (isSkippableMatrixCellSource(raw)) {
      continue;
    }
    sources.push({
      source: raw,
      location: {
        matrixTitle: matrix.title.trim() || matrix.id,
        rowLabel: matrix.rows[rowIndex]?.label.trim() ?? `row ${rowIndex + 1}`,
        columnLabel: matrix.columns[columnIndex]?.trim() ?? `column ${columnIndex + 1}`
      }
    });
  }
  return sources;
}

export interface MatrixColumnSumBindingBundle {
  bindings: MatrixColumnSumBindings;
  locations: MatrixColumnSumLocations;
}

export function resolveMatrixColumnSumBindingBundle(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  equationSources: string[];
}): MatrixColumnSumBindingBundle {
  const bundle = resolveMatrixColumnSumBindingsInternal(args);
  return bundle;
}

export function resolveMatrixColumnSumBindings(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  equationSources: string[];
}): MatrixColumnSumBindings {
  return resolveMatrixColumnSumBindingBundle(args).bindings;
}

function resolveMatrixColumnSumBindingsInternal(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  equationSources: string[];
}): MatrixColumnSumBindingBundle {
  const refs = new Set<string>();
  const matrices = findLinkedAccountTransactionMatrices(
    args.cells,
    args.modelId,
    args.runCellId
  );
  const knownColumnRefs = new Set(
    matrices.flatMap((matrix) => {
      const sumColumnIndex = matrix.columns.findIndex((column) => isSumLabel(column));
      return matrix.columns.flatMap((column, columnIndex) => {
        if (columnIndex === sumColumnIndex) {
          return [];
        }
        const sectorLabel = matrix.sectors?.[columnIndex]?.trim() ?? "";
        const columnLabel = column.trim();
        const ref = sectorLabel
          ? formatQualifiedMatrixColumnSumReference(sectorLabel, columnLabel)
          : formatMatrixColumnSumReference(columnLabel);
        const variable =
          parseVariableFromColumnLabel(columnLabel) ??
          resolveMatrixColumnInspectVariable(
            matrix.columns,
            columnIndex,
            matrix.variables,
            matrix.sectors
          );
        return [ref, variable].filter(Boolean);
      });
    })
  );

  for (const source of args.equationSources) {
    for (const ref of extractMatrixColumnSumRefsFromSource(source)) {
      refs.add(ref);
    }
    for (const ref of extractBareMatrixColumnRefsFromSource(source, knownColumnRefs)) {
      refs.add(ref);
    }
  }

  if (refs.size === 0) {
    return { bindings: {}, locations: {} };
  }

  const bindings: MatrixColumnSumBindings = {};
  const locations: MatrixColumnSumLocations = {};

  for (const ref of refs) {
    const collected: Array<{ source: string; location: MatrixColumnCellLocation }> = [];
    for (const matrix of matrices) {
      const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
      if (sumRowIndex < 0) {
        continue;
      }

      const columnIndex = resolveColumnIndexForRef(matrix, ref);
      if (columnIndex == null) {
        continue;
      }

      collected.push(...collectColumnCellSources(matrix, columnIndex, sumRowIndex));
    }

    if (collected.length > 0) {
      bindings[ref] = collected.map((entry) => entry.source);
      locations[ref] = collected.map((entry) => entry.location);
    }
  }

  return { bindings, locations };
}

const MATRIX_COLUMN_REF_TOKEN = /[A-Za-z_][A-Za-z0-9_.^{}]*/g;

function extractBareMatrixColumnRefsFromSource(
  source: string,
  knownColumnRefs: Set<string>
): string[] {
  const refs = new Set<string>();
  for (const match of source.matchAll(MATRIX_COLUMN_REF_TOKEN)) {
    const token = match[0]?.trim() ?? "";
    if (token.includes(".") && knownColumnRefs.has(token)) {
      refs.add(token);
    }
  }
  return [...refs];
}

function resolveColumnIndexForRef(matrix: MatrixCell, columnRef: string): number | null {
  const sumColumnIndex = matrix.columns.findIndex((column) => isSumLabel(column));

  for (let columnIndex = 0; columnIndex < matrix.columns.length; columnIndex += 1) {
    if (columnIndex === sumColumnIndex) {
      continue;
    }

    const columnLabel = matrix.columns[columnIndex]?.trim() ?? "";
    if (!columnLabel) {
      continue;
    }

    const ref = formatMatrixColumnSumReference(columnLabel);
    const sectorLabel = matrix.sectors?.[columnIndex]?.trim() ?? "";
    const qualifiedRef = sectorLabel
      ? formatQualifiedMatrixColumnSumReference(sectorLabel, columnLabel)
      : ref;
    const variable =
      parseVariableFromColumnLabel(columnLabel) ??
      resolveMatrixColumnInspectVariable(
        matrix.columns,
        columnIndex,
        matrix.variables,
        matrix.sectors
      );

    if (ref === columnRef || qualifiedRef === columnRef || variable === columnRef) {
      return columnIndex;
    }
  }

  return null;
}

function findLinkedAccountTransactionMatrices(
  cells: NotebookCell[],
  modelId: string,
  runCellId: string
): MatrixCell[] {
  const runCell = cells.find(
    (entry): entry is RunCell => entry.type === "run" && entry.id === runCellId
  );
  if (!runCell || runCell.sourceModelId !== modelId) {
    return [];
  }

  return cells.filter((cell): cell is MatrixCell => {
    if (cell.type !== "matrix") {
      return false;
    }
    if (!isAccountTransactionsMatrix(cell)) {
      return false;
    }
    return cell.sourceRunCellId === runCellId;
  });
}

export interface MatrixColumnSumInspectContext {
  columnRef: string;
  sources: string[];
  stockVariable: string | null;
  expression: string;
  currentDependencies: string[];
  lagDependencies: string[];
}

export function collectMatrixColumnSumRefsFromMatrices(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
}): string[] {
  const refs = new Set<string>();
  for (const matrix of findLinkedAccountTransactionMatrices(
    args.cells,
    args.modelId,
    args.runCellId
  )) {
    const sumColumnIndex = matrix.columns.findIndex((column) => isSumLabel(column));
    matrix.columns.forEach((column, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }
      const ref = resolveMatrixColumnSumReference(matrix.columns, columnIndex, matrix.sectors);
      if (ref) {
        refs.add(ref);
      }
    });
  }
  return [...refs].sort((left, right) => left.localeCompare(right));
}

export function resolveMatrixColumnSumInspectContext(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  columnRef: string;
}): MatrixColumnSumInspectContext | null {
  const bindings = resolveMatrixColumnSumBindings({
    cells: args.cells,
    modelId: args.modelId,
    runCellId: args.runCellId,
    equationSources: [args.columnRef]
  });
  const sources = bindings[args.columnRef.trim()];
  if (!sources?.length) {
    return null;
  }

  const currentDependencies = new Set<string>();
  const lagDependencies = new Set<string>();
  for (const source of sources) {
    try {
      const parsed = parseEquation("_", source);
      parsed.currentDependencies.forEach((name) => currentDependencies.add(name));
      parsed.lagDependencies.forEach((name) => lagDependencies.add(name));
    } catch {
      // ignore malformed matrix entries
    }
  }

  let stockVariable: string | null = null;
  for (const matrix of findLinkedAccountTransactionMatrices(
    args.cells,
    args.modelId,
    args.runCellId
  )) {
    const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
    const columnIndex = resolveColumnIndexForRef(matrix, args.columnRef);
    if (sumRowIndex < 0 || columnIndex == null) {
      continue;
    }
    const sumSource = matrix.rows[sumRowIndex]?.values[columnIndex]?.trim() ?? "";
    const parsedStock = parseVariableFromColumnLabel(sumSource) ?? sumSource;
    if (parsedStock && parsedStock !== "0") {
      stockVariable = parsedStock;
      break;
    }
  }

  return {
    columnRef: args.columnRef.trim(),
    sources,
    stockVariable,
    expression: args.columnRef.trim(),
    currentDependencies: [...currentDependencies].sort((left, right) => left.localeCompare(right)),
    lagDependencies: [...lagDependencies].sort((left, right) => left.localeCompare(right))
  };
}

export function evaluateMatrixColumnSumAtPeriod(
  columnRef: string,
  bindings: MatrixColumnSumBindings,
  result: SimulationResult,
  periodIndex: number
): number | null {
  const sources = bindings[columnRef.trim()];
  if (!sources?.length) {
    return null;
  }

  let total = 0;
  for (const source of sources) {
    const value = evaluateMatrixEntryNumber(source, result, periodIndex);
    if (value == null) {
      return null;
    }
    total += value;
  }
  return total;
}

export function buildMatrixColumnSumSeries(
  columnRef: string,
  bindings: MatrixColumnSumBindings,
  result: SimulationResult
): number[] | null {
  const sources = bindings[columnRef.trim()];
  if (!sources?.length) {
    return null;
  }

  const periodCount = result.options.periods + 1;
  const values: number[] = [];
  for (let periodIndex = 0; periodIndex < periodCount; periodIndex += 1) {
    const value = evaluateMatrixColumnSumAtPeriod(columnRef, bindings, result, periodIndex);
    if (value == null) {
      return null;
    }
    values.push(value);
  }
  return values;
}

export function resolveMatrixColumnSumBindingsForRef(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  columnRef: string;
}): MatrixColumnSumBindings {
  return resolveMatrixColumnSumBindings({
    cells: args.cells,
    modelId: args.modelId,
    runCellId: args.runCellId,
    equationSources: [args.columnRef]
  });
}
