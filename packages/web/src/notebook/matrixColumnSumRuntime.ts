import {
  extractMatrixColumnSumRefsFromSource,
  type MatrixColumnSumBindings
} from "@sfcr/core";
import {
  parseMatrixSectorDisplay,
  parseVariableFromColumnLabel,
  resolveMatrixColumnInspectVariable
} from "@sfcr/notebook-core";

import { isSumLabel } from "./matrixAccountSumRow";
import { resolveAccountingMatrixKind } from "./validation";
import type { MatrixCell, NotebookCell, RunCell } from "./types";

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
): string[] {
  const sources: string[] = [];
  for (let rowIndex = 0; rowIndex < sumRowIndex; rowIndex += 1) {
    const raw = matrix.rows[rowIndex]?.values[columnIndex]?.trim() ?? "";
    if (!raw || raw === "0") {
      continue;
    }
    sources.push(raw);
  }
  return sources;
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
      resolveMatrixColumnInspectVariable(matrix.columns, columnIndex, matrix.variables);

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

export function resolveMatrixColumnSumBindings(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  equationSources: string[];
}): MatrixColumnSumBindings {
  const refs = new Set<string>();
  for (const source of args.equationSources) {
    for (const ref of extractMatrixColumnSumRefsFromSource(source)) {
      refs.add(ref);
    }
  }

  if (refs.size === 0) {
    return {};
  }

  const matrices = findLinkedAccountTransactionMatrices(
    args.cells,
    args.modelId,
    args.runCellId
  );
  const bindings: MatrixColumnSumBindings = {};

  for (const ref of refs) {
    const sources: string[] = [];
    for (const matrix of matrices) {
      const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
      if (sumRowIndex < 0) {
        continue;
      }

      const columnIndex = resolveColumnIndexForRef(matrix, ref);
      if (columnIndex == null) {
        continue;
      }

      sources.push(...collectColumnCellSources(matrix, columnIndex, sumRowIndex));
    }

    if (sources.length > 0) {
      bindings[ref] = sources;
    }
  }

  return bindings;
}
