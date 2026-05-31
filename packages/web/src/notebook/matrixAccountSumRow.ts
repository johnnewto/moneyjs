import { evaluateExpression, parseExpression, type EquationRole, type SimulationResult } from "@sfcr/core";
import { parseVariableFromColumnLabel, resolveMatrixColumnInspectVariable } from "@sfcr/notebook-core";

import type { UnitMeta } from "../lib/unitMeta";
import { createUniqueRowId } from "./assistantTools/shared";
import { findEquationsCell } from "./modelSections";
import { formatMatrixColumnSumReference, columnHasFlowEntries } from "./matrixColumnSumRuntime";
import { classifyMatrixEntrySource } from "./matrixVariableReference";
import { resolveAccountingMatrixKind } from "./validation";
import type { EquationsCell, MatrixCell, NotebookCell } from "./types";

const MATRIX_BALANCE_TOLERANCE = 1e-6;

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
}

export function isAccountTransactionsMatrix(cell: MatrixCell): boolean {
  return resolveAccountingMatrixKind(cell) === "account-transactions";
}

export function isSumLabel(value: string): boolean {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "sum";
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
  const reference = classifyMatrixEntrySource(source);
  return reference?.shape.kind === "diff";
}

export function resolveSumRowStockVariable(
  cell: MatrixCell,
  columnIndex: number,
  source: string
): string | null {
  const reference = classifyMatrixEntrySource(source);
  if (reference?.shape.kind === "diff") {
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

  for (let rowIndex = 0; rowIndex < sumRowIndex; rowIndex += 1) {
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
  const laggedVariable = formatLaggedVariable(variableName);
  if (!hasFlows) {
    return laggedVariable;
  }

  return `${laggedVariable} + sum(${columnRef}) * dt`;
}

export function normalizeEquationExpression(expression: string): string {
  return expression
    .trim()
    .replace(/\s+/g, " ")
    .replace(LAG_INDEX_PATTERN, "$1'")
    .replace(LAG_CALL_PATTERN, "$1'");
}

export function equationExpressionsMatch(left: string, right: string): boolean {
  return normalizeEquationExpression(left) === normalizeEquationExpression(right);
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
  const existing = equationsCell?.equations.find((equation) => equation.name.trim() === variable)?.unitMeta;
  if (existing?.stockFlow === "stock" && existing.signature) {
    return existing;
  }
  return defaultStockUnitMeta();
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

  args.matrix.rows[sumRowIndex]?.values.forEach((source, columnIndex) => {
    if (columnIndex === sumColumnIndex) {
      return;
    }

    const trimmedSource = source.trim();
    if (!trimmedSource || trimmedSource === "0" || !isSumRowStockChangeAnnotation(trimmedSource)) {
      return;
    }

    const variable = resolveSumRowStockVariable(args.matrix, columnIndex, trimmedSource);
    if (!variable) {
      return;
    }

    const columnLabel = args.matrix.columns[columnIndex]?.trim() ?? variable;
    const columnRef = formatMatrixColumnSumReference(columnLabel);
    const hasFlows = columnHasFlowEntries(args.matrix, columnIndex, sumRowIndex);
    const proposedExpression = buildProposedAccumulationExpression(variable, columnRef, hasFlows);
    const existingIndex = equationsCell.equations.findIndex(
      (equation) => equation.name.trim() === variable
    );
    const existing =
      existingIndex >= 0 ? equationsCell.equations[existingIndex] : undefined;
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
        source: `Sum row ${trimmedSource} · ${columnLabel}`,
        isMismatch: true
      });
      return;
    }

    const isMismatch = !equationExpressionsMatch(existing.expression, proposedExpression);
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
      source: `Sum row ${trimmedSource} · ${columnLabel}`,
      isMismatch
    });
  });

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
