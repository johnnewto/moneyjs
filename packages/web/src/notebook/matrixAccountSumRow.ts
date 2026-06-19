import { isSkippableMatrixCellSource } from "@sfcr/core";
import {
  findMatrixInitialRowIndex,
  isMatrixInitialRow,
  isRowComment,
  listMatrixFlowRowIndices
} from "@sfcr/notebook-core";

import { evaluateExpression, parseExpression, type EquationRole, type SimulationResult } from "@sfcr/core";
import {
  computeSectorImpliedEquity,
  isMatrixEquityColumn,
  parseVariableFromColumnLabel,
  resolveMatrixColumnInspectVariable,
  sectorsAlignWithMatrixColumns,
  usesMatrixAccountColumnLayout
} from "@sfcr/notebook-core";

import type { UnitMeta } from "../lib/unitMeta";
import { createUniqueRowId } from "./assistantTools/shared";
import { findEquationsCell } from "./modelSections";
import {
  columnHasFlowEntries,
  formatMatrixColumnSumReference,
  formatQualifiedMatrixColumnSumReference
} from "./matrixColumnSumRuntime";
import { classifyMatrixEntrySource } from "./matrixVariableReference";
import { resolveAccountingMatrixKind } from "./validation";
import type { EquationsCell, MatrixCell, NotebookCell } from "./types";

const MATRIX_BALANCE_TOLERANCE = 1e-6;

export const ACCOUNT_SUM_ROW_FLOW_UNIT_META: UnitMeta = {
  stockFlow: "flow",
  signature: { money: 1, time: -1 }
};

export const ACCOUNT_SUM_ROW_INTEGRATED_STOCK_UNIT_META: UnitMeta = {
  stockFlow: "stock",
  signature: { money: 1 }
};

export function isEmptyAccountSumRowSource(source: string): boolean {
  return isEmptyMatrixEntrySource(source);
}

/** Treats accounting sign-only placeholders as empty matrix cells. */
export function isEmptyMatrixEntrySource(source: string): boolean {
  return isSkippableMatrixCellSource(source);
}

export interface ProposedMatrixEquationUpdate {
  variable: string;
  action: "add" | "update";
  cellId: string;
  rowIndex: number | null;
  proposed: {
    name: string;
    expression: string;
    desc: string;
    role: EquationRole;
    unitMeta: UnitMeta;
  };
  current?: {
    expression: string;
    role?: EquationRole;
  };
  source: string;
  isMismatch: boolean;
  warning?: string;
}

export function isAccountTransactionsMatrix(cell: MatrixCell): boolean {
  return resolveAccountingMatrixKind(cell) === "account-transactions";
}

export const ACCOUNT_TRANSACTIONS_SUM_ROW_DISPLAY_LABEL = "initial + ∫ Σ(flows) dt";

export const ACCOUNT_TRANSACTIONS_SUM_COLUMN_DISPLAY_LABEL = "A − L − E";

export function isSumLabel(value: string): boolean {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "sum";
}

export function formatAccountTransactionsSumRowDisplayLabel(
  matrix: MatrixCell,
  rowLabel: string
): string {
  return isAccountTransactionsMatrix(matrix) && isSumLabel(rowLabel)
    ? ACCOUNT_TRANSACTIONS_SUM_ROW_DISPLAY_LABEL
    : rowLabel;
}

/** The Sum column totals each row as assets − liabilities − equities for account-transactions matrices. */
export function formatAccountTransactionsSumColumnDisplayLabel(
  matrix: MatrixCell,
  columnLabel: string
): string {
  return isAccountTransactionsMatrix(matrix) && isSumLabel(columnLabel)
    ? ACCOUNT_TRANSACTIONS_SUM_COLUMN_DISPLAY_LABEL
    : columnLabel;
}

export function isEditableAccountSumRowCell(
  cell: MatrixCell,
  rowIndex: number,
  columnIndex: number,
  sumRowIndex: number,
  sumColumnIndex: number
): boolean {
  if (!isAccountTransactionsMatrix(cell)) {
    return false;
  }
  if (rowIndex !== sumRowIndex || columnIndex === sumColumnIndex) {
    return false;
  }
  return columnIndex >= 0 && columnIndex < cell.columns.length;
}

export function isSumRowStockChangeAnnotation(source: string): boolean {
  return classifyMatrixEntrySource(source)?.shape.kind === "diff";
}

export function isSumRowStockAnnotation(source: string): boolean {
  const kind = classifyMatrixEntrySource(source)?.shape.kind;
  return kind === "diff" || kind === "plain";
}

export function sumRowHasStockAnnotations(matrix: MatrixCell): boolean {
  if (!isAccountTransactionsMatrix(matrix)) {
    return false;
  }

  const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
  const sumColumnIndex = matrix.columns.findIndex((column) => isSumLabel(column));
  if (sumRowIndex < 0) {
    return false;
  }

  return matrix.rows[sumRowIndex]?.values.some((source, columnIndex) => {
    if (columnIndex === sumColumnIndex) {
      return false;
    }

    const trimmed = source.trim();
    return Boolean(trimmed && trimmed !== "0" && isSumRowStockAnnotation(trimmed));
  }) ?? false;
}

/** Resolves the stock variable named explicitly in the Sum row for an account column. */
export function resolveAccountTransactionsSectorImpliedEquity(
  matrix: MatrixCell,
  equityColumnIndex: number,
  getColumnValue: (columnIndex: number) => number | null
): number | null {
  if (!isAccountTransactionsMatrix(matrix) || !usesMatrixAccountColumnLayout(matrix.columnBadges)) {
    return null;
  }
  if (!sectorsAlignWithMatrixColumns(matrix.columns, matrix.sectors)) {
    return null;
  }

  const sumColumnIndex = matrix.columns.findIndex((column) => isSumLabel(column));
  return computeSectorImpliedEquity(
    matrix.columns,
    matrix.sectors,
    matrix.columnBadges,
    equityColumnIndex,
    getColumnValue,
    sumColumnIndex
  );
}

export function resolveMatrixColumnStockVariable(
  matrix: MatrixCell,
  columnIndex: number
): string | null {
  const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
  if (sumRowIndex < 0) {
    return null;
  }

  const sumSource = matrix.rows[sumRowIndex]?.values[columnIndex]?.trim() ?? "";
  if (!sumSource || sumSource === "0" || !isSumRowStockAnnotation(sumSource)) {
    return null;
  }

  return resolveSumRowStockVariable(matrix, columnIndex, sumSource);
}

export function resolveMatrixColumnInitialConstant(matrix: MatrixCell, columnIndex: number): number {
  const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
  if (sumRowIndex < 0) {
    return 0;
  }

  const initialRowIndex = findMatrixInitialRowIndex(matrix, sumRowIndex);
  if (initialRowIndex == null) {
    return 0;
  }

  const source = matrix.rows[initialRowIndex]?.values[columnIndex]?.trim() ?? "";
  if (!source || isSkippableMatrixCellSource(source)) {
    return (
      resolveAccountTransactionsMatrixCellValue(matrix, initialRowIndex, columnIndex, null, 0) ?? 0
    );
  }

  const value = Number(source);
  return Number.isFinite(value) ? value : 0;
}

function resolveAccountTransactionsRowImpliedEquity(
  matrix: MatrixCell,
  rowIndex: number,
  columnIndex: number,
  getColumnValue: (columnIndex: number) => number | null
): number | null {
  if (!isMatrixEquityColumn(matrix.columnBadges, columnIndex)) {
    return null;
  }

  return resolveAccountTransactionsSectorImpliedEquity(matrix, columnIndex, getColumnValue);
}

function evaluateAccountTransactionsFlowCellNumber(
  source: string,
  result: SimulationResult | null,
  periodIndex: number
): number | null {
  const trimmed = source.trim();
  if (isEmptyMatrixEntrySource(trimmed)) {
    return null;
  }

  const literal = Number(trimmed);
  if (Number.isFinite(literal)) {
    return literal;
  }

  return evaluateMatrixEntryNumber(trimmed, result, periodIndex);
}

export function resolveAccountTransactionsMatrixCellValue(
  matrix: MatrixCell,
  rowIndex: number,
  columnIndex: number,
  result: SimulationResult | null,
  periodIndex: number
): number | null {
  const row = matrix.rows[rowIndex];
  if (!row || isSumLabel(row.label)) {
    return null;
  }

  const source = row.values[columnIndex]?.trim() ?? "";
  if (isMatrixInitialRow(row)) {
    if (!isEmptyMatrixEntrySource(source)) {
      const value = Number(source);
      return Number.isFinite(value) ? value : null;
    }

    return resolveAccountTransactionsRowImpliedEquity(matrix, rowIndex, columnIndex, (col) => {
      const initialSource = row.values[col]?.trim() ?? "";
      if (isEmptyMatrixEntrySource(initialSource)) {
        return null;
      }
      const initialValue = Number(initialSource);
      return Number.isFinite(initialValue) ? initialValue : null;
    });
  }

  if (!isEmptyMatrixEntrySource(source)) {
    return evaluateAccountTransactionsFlowCellNumber(source, result, periodIndex);
  }

  return resolveAccountTransactionsRowImpliedEquity(matrix, rowIndex, columnIndex, (col) => {
    const colSource = row.values[col]?.trim() ?? "";
    if (isEmptyMatrixEntrySource(colSource)) {
      return null;
    }
    return evaluateAccountTransactionsFlowCellNumber(colSource, result, periodIndex);
  });
}

export function resolveMatrixInitialRowCellValue(
  matrix: MatrixCell,
  columnIndex: number
): number | null {
  const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
  if (sumRowIndex < 0) {
    return null;
  }

  const initialRowIndex = findMatrixInitialRowIndex(matrix, sumRowIndex);
  if (initialRowIndex == null) {
    return null;
  }

  return resolveAccountTransactionsMatrixCellValue(matrix, initialRowIndex, columnIndex, null, 0);
}

export function evaluateMatrixColumnFlowSumAtPeriod(
  matrix: MatrixCell,
  columnIndex: number,
  result: SimulationResult | null,
  periodIndex: number
): number | null {
  if (!result) {
    return null;
  }

  const sumRowIndex = matrix.rows.findIndex((row) => isSumLabel(row.label));
  if (sumRowIndex < 0) {
    return null;
  }

  let total = 0;
  for (const rowIndex of listMatrixFlowRowIndices(matrix, sumRowIndex)) {
    const source = matrix.rows[rowIndex]?.values[columnIndex]?.trim() ?? "";
    if (isSkippableMatrixCellSource(source)) {
      continue;
    }

    const value = evaluateMatrixEntryNumber(source, result, periodIndex);
    if (value == null) {
      return null;
    }
    total += value;
  }

  return total;
}

export function evaluateMatrixColumnIntegratedDisplay(
  matrix: MatrixCell,
  columnIndex: number,
  result: SimulationResult | null,
  periodIndex: number,
  dt = 1
): number | null {
  if (!result) {
    return null;
  }

  let integrated = resolveMatrixColumnInitialConstant(matrix, columnIndex);
  for (let period = 1; period <= periodIndex; period += 1) {
    const flowSum = evaluateMatrixColumnFlowSumAtPeriod(matrix, columnIndex, result, period);
    if (flowSum == null) {
      return null;
    }
    integrated += flowSum * dt;
  }

  return integrated;
}

export function columnAccumulationMissingFlowsMessage(columnLabel: string): string {
  return `Column "${columnLabel}" has no flow entries; accumulation expects column flows.`;
}

export const MATRIX_INTEGRAL_INSPECT_PREFIX = "∫:";

export function formatMatrixIntegralInspectVariable(columnRef: string): string {
  return `${MATRIX_INTEGRAL_INSPECT_PREFIX}${columnRef.trim()}`;
}

export function parseMatrixIntegralInspectVariable(selectedVariable: string): string | null {
  const trimmed = selectedVariable.trim();
  if (!trimmed.startsWith(MATRIX_INTEGRAL_INSPECT_PREFIX)) {
    return null;
  }
  const columnRef = trimmed.slice(MATRIX_INTEGRAL_INSPECT_PREFIX.length).trim();
  return columnRef || null;
}

export function formatMatrixIntegralEquation(columnRef: string): string {
  return `I(${columnRef.trim()})`;
}

export function resolveSumRowStockVariable(
  cell: MatrixCell,
  columnIndex: number,
  source: string
): string | null {
  const reference = classifyMatrixEntrySource(source);
  if (reference?.shape.kind === "diff" || reference?.shape.kind === "plain") {
    return reference.variableName;
  }

  const columnLabel = cell.columns[columnIndex]?.trim() ?? "";
  if (!columnLabel || isSumLabel(columnLabel)) {
    return null;
  }

  return (
    parseVariableFromColumnLabel(columnLabel) ??
    resolveMatrixColumnInspectVariable(cell.columns, columnIndex, cell.variables)
  );
}

export function buildSymbolicColumnFlowSum(
  matrix: MatrixCell,
  columnIndex: number,
  sumRowIndex: number
): string {
  const terms: string[] = [];

  for (const rowIndex of listMatrixFlowRowIndices(matrix, sumRowIndex)) {
    const raw = matrix.rows[rowIndex]?.values[columnIndex]?.trim() ?? "";
    if (!raw || raw === "0") {
      continue;
    }

    if (raw.startsWith("+") || raw.startsWith("-")) {
      terms.push(raw);
    } else {
      terms.push(`+ ${raw}`);
    }
  }

  if (terms.length === 0) {
    return "0";
  }

  const joined = terms
    .map((term, index) => normalizeSymbolicFlowTerm(term, index === 0))
    .join(" ");

  return joined.includes(" ") ? `(${joined})` : joined;
}

function normalizeSymbolicFlowTerm(raw: string, isFirst: boolean): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("-")) {
    const magnitude = trimmed.slice(1).trimStart();
    return isFirst ? `- ${magnitude}` : `- ${magnitude}`;
  }
  if (trimmed.startsWith("+")) {
    const magnitude = trimmed.slice(1).trimStart();
    return isFirst ? magnitude : `+ ${magnitude}`;
  }
  return isFirst ? trimmed : `+ ${trimmed}`;
}

const LAG_CALL_PATTERN = /\blag\(\s*([A-Za-z_][A-Za-z0-9_.^{}]*)\s*\)/g;
const LAG_INDEX_PATTERN = /([A-Za-z_][A-Za-z0-9_.^{}]*)\[-1\]/g;

export function formatLaggedVariable(variableName: string): string {
  return `${variableName}'`;
}

export function buildProposedAccumulationExpression(
  variableName: string,
  columnRef: string,
  hasFlows: boolean
): string {
  if (!hasFlows) {
    return formatLaggedVariable(variableName);
  }

  return `I(${columnRef})`;
}

const SUM_WRAPPED_COLUMN_REF_PATTERN =
  /sum\(\s*([A-Za-z_][A-Za-z0-9_.]*\.[A-Za-z0-9_.]*)\s*\)/g;
const INTEGRAL_COLUMN_REF_PATTERN =
  /^I\(\s*([A-Za-z_][A-Za-z0-9_.]*\.[A-Za-z0-9_.]*)\s*\)$/;

export function normalizeEquationExpression(expression: string): string {
  return expression
    .trim()
    .replace(/\s+/g, " ")
    .replace(SUM_WRAPPED_COLUMN_REF_PATTERN, "$1")
    .replace(LAG_INDEX_PATTERN, "$1'")
    .replace(LAG_CALL_PATTERN, "$1'");
}

export function normalizeAccumulationEquationExpression(
  expression: string,
  stockVariable: string
): string {
  const normalized = normalizeEquationExpression(expression);
  const stock = stockVariable.trim();
  if (!stock) {
    return normalized;
  }

  const integralMatch = INTEGRAL_COLUMN_REF_PATTERN.exec(normalized);
  if (integralMatch?.[1]) {
    return `${formatLaggedVariable(stock)} + ${integralMatch[1]} * dt`;
  }

  return normalized;
}

export function equationExpressionsMatch(
  left: string,
  right: string,
  stockVariable?: string
): boolean {
  const normalizedLeft = normalizeEquationExpression(left);
  const normalizedRight = normalizeEquationExpression(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const stock = stockVariable?.trim();
  if (!stock) {
    return false;
  }

  return (
    normalizeAccumulationEquationExpression(left, stock) ===
    normalizeAccumulationEquationExpression(right, stock)
  );
}

export function evaluateMatrixEntryNumber(
  source: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): number | null {
  const normalizedSource = source.trim();
  if (!normalizedSource || !result) {
    return null;
  }

  try {
    const expression = parseExpression(stripLeadingPlus(normalizedSource));
    const value = evaluateExpression(expression, createResultContext(result, selectedPeriodIndex));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveAccountSumRowCellBalance(
  source: string,
  computedColumnSum: number | null,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): boolean {
  if (!isSumRowStockChangeAnnotation(source)) {
    return true;
  }

  const expected = evaluateMatrixEntryNumber(source, result, selectedPeriodIndex);
  if (computedColumnSum == null || expected == null) {
    return true;
  }

  return Math.abs(computedColumnSum - expected) < MATRIX_BALANCE_TOLERANCE;
}

export function resolveAccountSumRowDisplayValue(
  source: string,
  columnSum: number | null,
  result: SimulationResult | null,
  selectedPeriodIndex: number,
  options?: {
    stockVariable?: string | null;
    matrix?: MatrixCell;
    columnIndex?: number;
  }
): number | null {
  // Equity columns in the Sum row are derived as assets − liabilities for the sector,
  // overriding any explicit stock entry so net worth always reflects the balance sheet.
  if (
    options?.matrix &&
    options.columnIndex != null &&
    isMatrixEquityColumn(options.matrix.columnBadges, options.columnIndex)
  ) {
    const matrix = options.matrix;
    const equityColumnIndex = options.columnIndex;
    const implied = resolveAccountTransactionsSectorImpliedEquity(matrix, equityColumnIndex, (col) =>
      resolveAccountSumRowDisplayValue(
        matrix.rows[matrix.rows.findIndex((row) => isSumLabel(row.label))]?.values[col]?.trim() ??
          "",
        evaluateMatrixColumnFlowSumAtPeriod(matrix, col, result, selectedPeriodIndex),
        result,
        selectedPeriodIndex,
        {
          stockVariable: resolveMatrixColumnStockVariable(matrix, col),
          matrix,
          columnIndex: col
        }
      )
    );
    if (implied != null) {
      return implied;
    }
  }

  const trimmed = source.trim();
  if (trimmed && trimmed !== "0") {
    const evaluated = evaluateMatrixEntryNumber(trimmed, result, selectedPeriodIndex);
    if (evaluated != null) {
      return evaluated;
    }
  }

  const stock = options?.stockVariable?.trim();
  if (stock && result) {
    const stockValue = evaluateMatrixEntryNumber(stock, result, selectedPeriodIndex);
    if (stockValue != null) {
      return stockValue;
    }
  }

  if (
    isEmptyAccountSumRowSource(source) &&
    options?.matrix &&
    options.columnIndex != null &&
    result
  ) {
    return evaluateMatrixColumnIntegratedDisplay(
      options.matrix,
      options.columnIndex,
      result,
      selectedPeriodIndex
    );
  }

  return columnSum;
}

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

function createResultContext(result: SimulationResult, selectedPeriodIndex: number) {
  return {
    currentValue(variable: string): number {
      const values = result.series[variable];
      if (values) {
        const index = Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0));
        return values[index] ?? NaN;
      }
      return externalValueAt(result, variable, selectedPeriodIndex);
    },
    lagValue(variable: string): number {
      const values = result.series[variable];
      if (values) {
        const index = Math.max(Math.min(selectedPeriodIndex, values.length - 1) - 1, 0);
        return values[index] ?? NaN;
      }
      return externalValueAt(result, variable, Math.max(selectedPeriodIndex - 1, 0));
    },
    diffValue(variable: string): number {
      return this.currentValue(variable) - this.lagValue(variable);
    },
    setCurrentValue(): void {},
    hasSeries(variable: string): boolean {
      return variable in result.series;
    }
  };
}

function externalValueAt(result: SimulationResult, variable: string, periodIndex: number): number {
  const external = result.model.externals[variable];
  if (!external) {
    return NaN;
  }
  if (external.kind === "constant") {
    return external.value;
  }
  const index = Math.min(periodIndex, Math.max(external.values.length - 1, 0));
  return external.values[index] ?? NaN;
}

function defaultStockUnitMeta(): UnitMeta {
  return {
    stockFlow: "stock",
    signature: { money: 1 }
  };
}

function resolveStockUnitMeta(
  variable: string,
  equationsCell: EquationsCell | null
): UnitMeta {
  const match = equationsCell?.equations.find(
    (equation) => !isRowComment(equation) && equation.name.trim() === variable
  );
  const existing = match && !isRowComment(match) ? match.unitMeta : undefined;
  if (existing?.stockFlow === "stock" && existing.signature) {
    return existing;
  }
  return defaultStockUnitMeta();
}

function buildMatrixAccumulationProposalSource(sumRowSource: string, columnLabel: string): string {
  const trimmedSource = sumRowSource.trim();
  if (trimmedSource && trimmedSource !== "0") {
    return `Sum row ${trimmedSource} · ${columnLabel}`;
  }
  return `Column ${columnLabel}`;
}

export function collectProposedMatrixEquationUpdates(args: {
  cells: NotebookCell[];
  matrix: MatrixCell;
  modelId: string;
}): ProposedMatrixEquationUpdate[] {
  if (!isAccountTransactionsMatrix(args.matrix)) {
    return [];
  }

  const equationsCell = findEquationsCell(args.cells, args.modelId);
  if (!equationsCell) {
    return [];
  }

  const sumRowIndex = args.matrix.rows.findIndex((row) => isSumLabel(row.label));
  const sumColumnIndex = args.matrix.columns.findIndex((column) => isSumLabel(column));
  if (sumRowIndex < 0) {
    return [];
  }

  const updates: ProposedMatrixEquationUpdate[] = [];

  for (let columnIndex = 0; columnIndex < args.matrix.columns.length; columnIndex += 1) {
    if (columnIndex === sumColumnIndex) {
      continue;
    }

    const variable = resolveMatrixColumnStockVariable(args.matrix, columnIndex);
    if (!variable) {
      continue;
    }

    const trimmedSource = args.matrix.rows[sumRowIndex]?.values[columnIndex]?.trim() ?? "";
    const columnLabel = args.matrix.columns[columnIndex]?.trim() ?? variable;
    const sectorLabel = args.matrix.sectors?.[columnIndex]?.trim() ?? "";
    const columnRef = sectorLabel
      ? formatQualifiedMatrixColumnSumReference(sectorLabel, columnLabel)
      : formatMatrixColumnSumReference(columnLabel);
    const hasFlows = columnHasFlowEntries(args.matrix, columnIndex, sumRowIndex);
    const proposedExpression = buildProposedAccumulationExpression(variable, columnRef, hasFlows);
    const warning = hasFlows ? undefined : columnAccumulationMissingFlowsMessage(columnLabel);
    const existingIndex = equationsCell.equations.findIndex(
      (equation) => !isRowComment(equation) && equation.name.trim() === variable
    );
    const existing =
      existingIndex >= 0 && !isRowComment(equationsCell.equations[existingIndex]!)
        ? equationsCell.equations[existingIndex]
        : undefined;
    const proposed = {
      name: variable,
      expression: proposedExpression,
      desc: `Stock accumulation from ${columnLabel}`,
      role: "accumulation" as const,
      unitMeta: resolveStockUnitMeta(variable, equationsCell)
    };

    if (!existing) {
      updates.push({
        variable,
        action: "add",
        cellId: equationsCell.id,
        rowIndex: null,
        proposed,
        source: buildMatrixAccumulationProposalSource(trimmedSource, columnLabel),
        isMismatch: true,
        ...(warning ? { warning } : {})
      });
      continue;
    }

    const isMismatch = !equationExpressionsMatch(existing.expression, proposedExpression, variable);
    updates.push({
      variable,
      action: "update",
      cellId: equationsCell.id,
      rowIndex: existingIndex,
      proposed,
      current: {
        expression: existing.expression,
        ...(existing.role ? { role: existing.role } : {})
      },
      source: buildMatrixAccumulationProposalSource(trimmedSource, columnLabel),
      isMismatch,
      ...(warning ? { warning } : {})
    });
  }

  return updates.sort((left, right) => left.variable.localeCompare(right.variable));
}

export function defaultSelectedMatrixEquationVariables(
  updates: ProposedMatrixEquationUpdate[]
): Set<string> {
  return new Set(updates.filter((update) => update.isMismatch).map((update) => update.variable));
}

export function applyMatrixEquationUpdates(
  cells: NotebookCell[],
  updates: ProposedMatrixEquationUpdate[]
): NotebookCell[] {
  if (updates.length === 0) {
    return cells;
  }

  const updatesByCellId = new Map<string, ProposedMatrixEquationUpdate[]>();
  for (const update of updates) {
    const list = updatesByCellId.get(update.cellId) ?? [];
    list.push(update);
    updatesByCellId.set(update.cellId, list);
  }

  return cells.map((cell) => {
    const cellUpdates = updatesByCellId.get(cell.id);
    if (!cellUpdates?.length || cell.type !== "equations") {
      return cell;
    }

    let nextEquations = cell.equations.slice();

    for (const update of cellUpdates) {
      if (update.action === "update" && update.rowIndex != null) {
        nextEquations = nextEquations.map((equation, index) =>
          index === update.rowIndex
            ? {
                ...equation,
                expression: update.proposed.expression,
                desc: update.proposed.desc,
                role: update.proposed.role,
                unitMeta: update.proposed.unitMeta
              }
            : equation
        );
        continue;
      }

      if (update.action === "add") {
        nextEquations = [
          ...nextEquations,
          {
            id: createUniqueRowId(
              nextEquations.map((equation) => equation.id),
              "eq",
              update.proposed.name
            ),
            name: update.proposed.name,
            expression: update.proposed.expression,
            desc: update.proposed.desc,
            role: update.proposed.role,
            unitMeta: update.proposed.unitMeta
          }
        ];
      }
    }

    return {
      ...cell,
      equations: nextEquations
    } satisfies EquationsCell;
  });
}
