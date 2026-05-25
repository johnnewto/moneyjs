import type { SimulationResult } from "@sfcr/core";

import { formatValueWithUnits, type UnitMeta, type VariableUnitMetadata } from "../lib/unitMeta";
import {
  classifyMatrixStockRole,
  inferMatrixTableKind,
  type MatrixStockRole
} from "../notebook/matrixSemantics";
import { evaluateMatrixEntryAtPeriod } from "../notebook/sequence";
import type { MatrixCell, NotebookCell } from "../notebook/types";

const STOCK_VALUE_FORMAT_OPTIONS = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
} as const;

export interface MultiportParticipantStock {
  variableName: string;
  displayName: string;
  role: MatrixStockRole | null;
  value: number | null;
  unitMeta?: UnitMeta;
  formattedValue: string;
}

const DERIVATIVE_BALANCE_PATTERN = /^([+-])?\s*d\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*$/i;

export function findCompanionBalanceMatrixCell(
  cells: NotebookCell[],
  transactionMatrix: MatrixCell
): MatrixCell | null {
  const candidates = cells.filter(
    (cell): cell is MatrixCell =>
      cell.type === "matrix" &&
      cell.id !== transactionMatrix.id &&
      isLikelyBalanceSheetMatrix(cell)
  );
  if (candidates.length === 0) {
    return null;
  }

  const titled = candidates.find((cell) => /balance/i.test(`${cell.id} ${cell.title}`));
  return titled ?? candidates[0] ?? null;
}

function isLikelyBalanceSheetMatrix(cell: MatrixCell): boolean {
  const hasDerivativeEntries = cell.rows.some((row) =>
    row.values.some((value) => /d\s*\(/i.test(value))
  );
  if (hasDerivativeEntries) {
    return false;
  }

  if (/balance/i.test(`${cell.id} ${cell.title}`)) {
    return true;
  }

  return inferMatrixTableKind(cell) === "stocks";
}

export function buildMultiportParticipantStocks(
  transactionMatrix: MatrixCell,
  balanceMatrix: MatrixCell | null,
  result: SimulationResult | null,
  selectedPeriodIndex: number,
  variableUnitMetadata: VariableUnitMetadata = new Map()
): Map<string, MultiportParticipantStock[]> {
  const sumColumnIndex = findSumColumnIndex(transactionMatrix.columns);
  const stocksByParticipant = new Map<string, MultiportParticipantStock[]>();

  transactionMatrix.rows.forEach((row) => {
    if (row.label.trim().toLowerCase() === "sum") {
      return;
    }

    row.values.forEach((source, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }

      const parsed = parseDerivativeBalanceEntry(source);
      if (!parsed) {
        return;
      }

      const participantId = transactionMatrix.columns[columnIndex] ?? `column-${columnIndex}`;
      const sectorLabel = transactionMatrix.sectors?.[columnIndex]?.trim() || participantId;
      const role = balanceMatrix
        ? resolveBalanceStockRole(
            balanceMatrix,
            parsed.variableName,
            sectorLabel,
            result,
            selectedPeriodIndex
          )
        : classifyMatrixStockRole(row.label, source, null);
      const value = evaluateMatrixEntryAtPeriod(parsed.variableName, result, selectedPeriodIndex);
      const unitMeta = variableUnitMetadata.get(parsed.variableName);
      const entry: MultiportParticipantStock = {
        variableName: parsed.variableName,
        displayName: `${parsed.signPrefix}${parsed.variableName}`,
        role,
        value,
        unitMeta,
        formattedValue: formatStockValue(value, unitMeta)
      };

      const existing = stocksByParticipant.get(participantId) ?? [];
      if (!existing.some((stock) => stock.variableName === entry.variableName)) {
        existing.push(entry);
        stocksByParticipant.set(participantId, existing);
      }
    });
  });

  for (const stocks of stocksByParticipant.values()) {
    stocks.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  return stocksByParticipant;
}

function parseDerivativeBalanceEntry(
  source: string
): { variableName: string; signPrefix: string } | null {
  const match = source.trim().match(DERIVATIVE_BALANCE_PATTERN);
  if (!match) {
    return null;
  }

  const signPrefix = match[1] === "-" ? "-" : match[1] === "+" ? "+" : "";
  return {
    variableName: match[2],
    signPrefix
  };
}

function resolveBalanceStockRole(
  balanceMatrix: MatrixCell,
  variableName: string,
  sectorLabel: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): MatrixStockRole | null {
  const balanceColumnIndex = resolveBalanceColumnIndex(balanceMatrix, sectorLabel);
  if (balanceColumnIndex == null) {
    return null;
  }

  const sumColumnIndex = findSumColumnIndex(balanceMatrix.columns);
  for (const row of balanceMatrix.rows) {
    if (row.label.trim().toLowerCase() === "sum") {
      continue;
    }

    const source = row.values[balanceColumnIndex]?.trim() ?? "";
    if (!source || !expressionReferencesVariable(source, variableName)) {
      continue;
    }

    const numericValue = evaluateMatrixEntryAtPeriod(source, result, selectedPeriodIndex);
    return classifyMatrixStockRole(row.label, source, numericValue);
  }

  return null;
}

function expressionReferencesVariable(source: string, variableName: string): boolean {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(source);
}

function resolveBalanceColumnIndex(balanceMatrix: MatrixCell, sectorLabel: string): number | null {
  const normalizedSector = sectorLabel.trim().toLowerCase();
  const sumColumnIndex = findSumColumnIndex(balanceMatrix.columns);

  for (let index = 0; index < balanceMatrix.columns.length; index += 1) {
    if (index === sumColumnIndex) {
      continue;
    }

    const column = balanceMatrix.columns[index]?.trim().toLowerCase() ?? "";
    const sector = balanceMatrix.sectors?.[index]?.trim().toLowerCase() ?? column;
    if (sector === normalizedSector || column === normalizedSector) {
      return index;
    }
  }

  for (let index = 0; index < balanceMatrix.columns.length; index += 1) {
    if (index === sumColumnIndex) {
      continue;
    }

    const column = balanceMatrix.columns[index]?.trim().toLowerCase() ?? "";
    const sector = balanceMatrix.sectors?.[index]?.trim().toLowerCase() ?? column;
    if (
      normalizedSector.includes(sector) ||
      sector.includes(normalizedSector) ||
      normalizedSector.includes(column) ||
      column.includes(normalizedSector)
    ) {
      return index;
    }
  }

  return null;
}

function findSumColumnIndex(columns: string[]): number {
  return columns.findIndex((column) => column.trim().toLowerCase() === "sum");
}

function formatStockValue(value: number | null, unitMeta?: UnitMeta): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return formatValueWithUnits(value, unitMeta, STOCK_VALUE_FORMAT_OPTIONS);
}
