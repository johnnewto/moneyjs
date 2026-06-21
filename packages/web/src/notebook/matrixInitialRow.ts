import { isSkippableMatrixCellSource } from "@sfcr/core";
import {
  findMatrixInitialRowIndex,
  initialValueRowsOnly,
  isInitialValueEnabled,
  isMatrixEquityColumn,
  isRowComment,
  type InitialValueListItem
} from "@sfcr/notebook-core";

import type { ValidationIssue } from "../editor-model/index";
import { findLinkedAccountTransactionMatrices } from "./matrixColumnSumRuntime";
import {
  isAccountTransactionsMatrix,
  isSumLabel,
  resolveAccountTransactionsSectorImpliedEquity,
  resolveSumRowStockVariable
} from "./matrixAccountSumRow";
import type { InitialValuesCell, MatrixCell, NotebookCell, RunCell } from "./types";

export interface MatrixInitialValueBinding {
  variable: string;
  valueText: string;
  numericValue: number;
  matrixCellId: string;
  matrixTitle: string;
  columnLabel: string;
  rowIndex: number;
  columnIndex: number;
}

export interface MatrixInitialValueOverride extends MatrixInitialValueBinding {
  cellValueText: string;
  cellNumericValue: number;
}

function parseMatrixInitialNumericValue(valueText: string): number {
  const value = Number(valueText.trim());
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid initial value: ${valueText}`);
  }
  return value;
}

function findAccountTransactionMatricesForModel(
  cells: NotebookCell[],
  modelId: string
): MatrixCell[] {
  const runCellIds = new Set(
    cells
      .filter((cell): cell is RunCell => cell.type === "run" && cell.sourceModelId === modelId)
      .map((cell) => cell.id)
  );

  return cells.filter((cell): cell is MatrixCell => {
    if (cell.type !== "matrix") {
      return false;
    }
    if (!isAccountTransactionsMatrix(cell)) {
      return false;
    }
    return Boolean(cell.sourceRunCellId && runCellIds.has(cell.sourceRunCellId));
  });
}

function collectMatrixInitialValueBindingsFromMatrix(matrix: MatrixCell): MatrixInitialValueBinding[] {
  const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
  const sumColumnIndex = matrix.columns.findIndex((column) => isSumLabel(column));
  if (sumRowIndex < 0) {
    return [];
  }

  const initialRowIndex = findMatrixInitialRowIndex(matrix, sumRowIndex);
  if (initialRowIndex == null) {
    return [];
  }

  const bindings: MatrixInitialValueBinding[] = [];
  const initialRow = matrix.rows[initialRowIndex];
  if (!initialRow) {
    return [];
  }

  initialRow.values.forEach((source, columnIndex) => {
    if (columnIndex === sumColumnIndex) {
      return;
    }

    const trimmedSource = source.trim();
    const sumSource = matrix.rows[sumRowIndex]?.values[columnIndex]?.trim() ?? "";
    const variable = resolveSumRowStockVariable(matrix, columnIndex, sumSource);
    if (!variable) {
      return;
    }

    let numericValue: number;
    let valueText: string;

    if (!trimmedSource || isSkippableMatrixCellSource(trimmedSource)) {
      if (!isMatrixEquityColumn(matrix.columnBadges, columnIndex)) {
        return;
      }

      const implied = resolveAccountTransactionsSectorImpliedEquity(matrix, columnIndex, (col) => {
        const initialSource = initialRow.values[col]?.trim() ?? "";
        if (!initialSource || isSkippableMatrixCellSource(initialSource)) {
          return null;
        }
        const initialValue = Number(initialSource);
        return Number.isFinite(initialValue) ? initialValue : null;
      });
      if (implied == null) {
        return;
      }

      numericValue = implied;
      valueText = String(implied);
    } else {
      try {
        numericValue = parseMatrixInitialNumericValue(trimmedSource);
      } catch {
        return;
      }
      valueText = trimmedSource;
    }

    bindings.push({
      variable,
      valueText,
      numericValue,
      matrixCellId: matrix.id,
      matrixTitle: matrix.title.trim() || matrix.id,
      columnLabel: matrix.columns[columnIndex]?.trim() ?? variable,
      rowIndex: initialRowIndex,
      columnIndex
    });
  });

  return bindings;
}

export function collectMatrixInitialValueBindings(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId?: string;
}): MatrixInitialValueBinding[] {
  const matrices = args.runCellId
    ? findLinkedAccountTransactionMatrices(args.cells, args.modelId, args.runCellId)
    : findAccountTransactionMatricesForModel(args.cells, args.modelId);

  const bindings: MatrixInitialValueBinding[] = [];
  const seen = new Set<string>();

  for (const matrix of matrices) {
    for (const binding of collectMatrixInitialValueBindingsFromMatrix(matrix)) {
      const key = `${binding.matrixCellId}:${binding.variable}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      bindings.push(binding);
    }
  }

  return bindings.sort((left, right) => left.variable.localeCompare(right.variable));
}

export function resolveMatrixInitialValues(args: {
  cells: NotebookCell[];
  modelId: string;
  runCellId?: string;
}): Record<string, number> {
  const values: Record<string, number> = {};
  for (const binding of collectMatrixInitialValueBindings(args)) {
    values[binding.variable] = binding.numericValue;
  }
  return values;
}

export function collectMatrixInitialValueOverrides(args: {
  cells: NotebookCell[];
  modelId: string;
  cellInitialValues: InitialValueListItem[];
  runCellId?: string;
}): MatrixInitialValueOverride[] {
  const cellInitialByName = new Map<string, { valueText: string; numericValue: number }>();
  for (const row of initialValueRowsOnly(args.cellInitialValues)) {
    if (!isInitialValueEnabled(row)) {
      continue;
    }
    const name = row.name.trim();
    const valueText = row.valueText.trim();
    if (!name || !valueText) {
      continue;
    }
    try {
      cellInitialByName.set(name, {
        valueText,
        numericValue: parseMatrixInitialNumericValue(valueText)
      });
    } catch {
      // ignore unparsable cell values here; runtime validation handles them
    }
  }

  const overrides: MatrixInitialValueOverride[] = [];
  for (const binding of collectMatrixInitialValueBindings(args)) {
    const cellInitial = cellInitialByName.get(binding.variable);
    if (!cellInitial) {
      continue;
    }
    overrides.push({
      ...binding,
      cellValueText: cellInitial.valueText,
      cellNumericValue: cellInitial.numericValue
    });
  }

  return overrides;
}

function formatOverrideMessage(override: MatrixInitialValueOverride): string {
  if (Math.abs(override.numericValue - override.cellNumericValue) < 1e-12) {
    return `Matrix "${override.matrixTitle}" sets ${override.variable} = ${override.valueText}; this overrides the initial-values cell at runtime.`;
  }
  return `Matrix "${override.matrixTitle}" sets ${override.variable} = ${override.valueText}; this overrides the initial-values cell value ${override.cellValueText} at runtime.`;
}

export function collectMatrixInitialValueOverrideIssues(args: {
  cells: NotebookCell[];
  modelId: string;
  cellInitialValues: InitialValueListItem[];
  runCellId?: string;
}): ValidationIssue[] {
  const overrides = collectMatrixInitialValueOverrides(args);
  if (overrides.length === 0) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const cellInitialIndexByName = new Map<string, number>();
  args.cellInitialValues.forEach((row, index) => {
    if (isRowComment(row) || !isInitialValueEnabled(row)) {
      return;
    }
    const name = row.name.trim();
    if (name) {
      cellInitialIndexByName.set(name, index);
    }
  });

  for (const override of overrides) {
    const initialIndex = cellInitialIndexByName.get(override.variable);
    if (initialIndex != null) {
      issues.push({
        path: `initialValues.${initialIndex}.valueText`,
        message: formatOverrideMessage(override),
        severity: "warning"
      });
    }

    issues.push({
      path: `matrix.${override.matrixCellId}.rows.${override.rowIndex}.values.${override.columnIndex}`,
      message: formatOverrideMessage(override),
      severity: "warning"
    });
  }

  const matrixSummary = new Map<string, MatrixInitialValueOverride[]>();
  for (const override of overrides) {
    const list = matrixSummary.get(override.matrixCellId) ?? [];
    list.push(override);
    matrixSummary.set(override.matrixCellId, list);
  }

  for (const [matrixCellId, matrixOverrides] of matrixSummary) {
    const variables = matrixOverrides.map((entry) => entry.variable).join(", ");
    issues.push({
      path: `matrix.${matrixCellId}.initialValues`,
      message: `Initial row overrides initial-values cell for ${variables} at runtime.`,
      severity: "warning"
    });
  }

  const allVariables = [...new Set(overrides.map((entry) => entry.variable))].sort((a, b) =>
    a.localeCompare(b)
  );
  issues.push({
    path: "options.matrixInitialValues",
    message: `Account-transactions matrix initial row overrides initial-values cell for ${allVariables.join(", ")} at runtime.`,
    severity: "warning"
  });

  return issues;
}

export function buildIssueMapForMatrixCell(
  cells: NotebookCell[],
  matrix: MatrixCell
): Record<string, string | undefined> {
  if (!isAccountTransactionsMatrix(matrix) || !matrix.sourceRunCellId) {
    return {};
  }

  const runCell = cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.id === matrix.sourceRunCellId
  );
  if (!runCell) {
    return {};
  }

  const initialValuesCell = cells.find(
    (cell): cell is InitialValuesCell =>
      cell.type === "initial-values" && cell.modelId === runCell.sourceModelId
  );

  const issues = collectMatrixInitialValueOverrideIssues({
    cells,
    modelId: runCell.sourceModelId ?? "",
    cellInitialValues: initialValuesCell?.initialValues ?? [],
    runCellId: runCell.id
  }).filter((issue) => issue.path.startsWith(`matrix.${matrix.id}.`));

  return Object.fromEntries(issues.map((issue) => [issue.path, issue.message]));
}
