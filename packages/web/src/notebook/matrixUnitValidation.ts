import { isSkippableMatrixCellSource, parseExpression } from "@sfcr/core";

import { formatMatrixEntryParseMessage } from "../lib/parseDiagnostics";
import { inferUnits, type UnitDiagnostic } from "../lib/units";
import {
  formatSignature,
  formatUnitText,
  normalizeSignature,
  signaturesEqual,
  type UnitSignature,
  type VariableUnitMetadata
} from "../lib/unitMeta";
import { isMatrixInitialRow } from "@sfcr/notebook-core";
import { resolveAccountingMatrixKind, type AccountingMatrixKind } from "./validation";
import type { MatrixCell } from "./types";

const BALANCE_SHEET_SIGNATURES: UnitSignature[] = [
  { money: 1 },
  { items: 1 },
  { mass: 1 },
  { energy: 1 },
  { pp: 1 },
  { carbon: 1 },
  { time: 1 }
];
const TRANSACTION_FLOW_SIGNATURES: UnitSignature[] = [
  { money: 1, time: -1 },
  { items: 1, time: -1 },
  { mass: 1, time: -1 },
  { energy: 1, time: -1 },
  { pp: 1, time: -1 },
  { carbon: 1, time: -1 }
];

export interface MatrixEntryUnitContext {
  columnLabel?: string;
  rowLabel?: string;
}

function isSumLabel(value: string): boolean {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "sum";
}

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

function expectedSignaturesForRow(
  kind: AccountingMatrixKind,
  isInitialRow: boolean
): UnitSignature[] {
  if (isInitialRow && kind === "account-transactions") {
    return BALANCE_SHEET_SIGNATURES;
  }
  return expectedSignaturesForKind(kind);
}

function expectedUnitLabelsForRow(kind: AccountingMatrixKind, isInitialRow: boolean): string {
  if (isInitialRow && kind === "account-transactions") {
    return expectedUnitLabelsForKind("balance-sheet");
  }
  return expectedUnitLabelsForKind(kind);
}

function expectedSignaturesForKind(kind: AccountingMatrixKind): UnitSignature[] {
  return kind === "balance-sheet" ? BALANCE_SHEET_SIGNATURES : TRANSACTION_FLOW_SIGNATURES;
}

function expectedUnitLabelsForKind(kind: AccountingMatrixKind): string {
  return kind === "balance-sheet"
    ? "$, items, kg, J, pp, °C, or yr"
    : "$/yr, items/yr, kg/yr, J/yr, pp/yr, or °C/yr";
}

function matrixKindLabel(kind: AccountingMatrixKind): string {
  switch (kind) {
    case "balance-sheet":
      return "Balance-sheet";
    case "account-transactions":
      return "Account-transactions";
    default:
      return "Transaction-flow";
  }
}

function formatEntryLocation(context?: MatrixEntryUnitContext): string {
  if (!context?.rowLabel && !context?.columnLabel) {
    return "";
  }

  const parts = [context.rowLabel, context.columnLabel].filter(Boolean);
  return ` (${parts.join(" / ")})`;
}

function signatureMatchesAllowed(signature: UnitSignature, allowed: UnitSignature[]): boolean {
  const normalized = normalizeSignature(signature);
  return allowed.some((candidate) => signaturesEqual(candidate, normalized));
}

function isPlainNumericLiteral(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }
  return Number.isFinite(Number(trimmed));
}

export function validateMatrixEntryUnits(
  source: string,
  kind: AccountingMatrixKind,
  variableUnitMetadata: VariableUnitMetadata,
  context?: MatrixEntryUnitContext & {
    cell?: Pick<MatrixCell, "id" | "title">;
    isInitialRow?: boolean;
  }
): UnitDiagnostic[] {
  const trimmed = source.trim();
  if (isSkippableMatrixCellSource(trimmed)) {
    return [];
  }

  const isInitialRow = context?.isInitialRow === true;
  if (isInitialRow && kind === "account-transactions" && isPlainNumericLiteral(trimmed)) {
    return [];
  }

  const allowed = expectedSignaturesForRow(kind, isInitialRow);
  const location = formatEntryLocation(context);
  const unitLabelKind = isInitialRow && kind === "account-transactions" ? "Account-transactions initial" : matrixKindLabel(kind);

  try {
    const expression = parseExpression(stripLeadingPlus(trimmed));
    const inferred = inferUnits(expression, variableUnitMetadata);
    const diagnostics = inferred.diagnostics.filter((entry) => entry.severity === "error");

    if (inferred.signature == null) {
      diagnostics.push({
        severity: "warning",
        message: `${unitLabelKind} matrix cell${location} cannot verify units for '${trimmed}'.`
      });
      return diagnostics;
    }

    if (!signatureMatchesAllowed(inferred.signature, allowed)) {
      const inferredLabel =
        formatUnitText({ signature: inferred.signature }) ?? formatSignature(inferred.signature);
      diagnostics.push({
        severity: "error",
        message: `${unitLabelKind} matrix cell${location} expects ${expectedUnitLabelsForRow(kind, isInitialRow)}, but '${trimmed}' infers ${inferredLabel}.`
      });
    }

    return diagnostics;
  } catch (error) {
    const parseMessage =
      context?.cell && context.rowLabel != null && context.columnLabel != null
        ? formatMatrixEntryParseMessage(
            context.cell,
            context.rowLabel,
            context.columnLabel,
            trimmed,
            error
          )
        : `${matrixKindLabel(kind)} matrix cell${location} cannot parse '${trimmed}': ${
            error instanceof Error ? error.message : "Unable to parse expression."
          }`;
    return [
      {
        severity: "warning",
        message: parseMessage
      }
    ];
  }
}

export function validateMatrixCellUnits(
  cell: MatrixCell,
  variableUnitMetadata: VariableUnitMetadata
): UnitDiagnostic[] {
  const kind = resolveAccountingMatrixKind(cell);
  if (!kind) {
    return [];
  }

  const sumColumnIndex = cell.columns.findIndex((column) => isSumLabel(column));
  const diagnostics: UnitDiagnostic[] = [];

  cell.rows.forEach((row) => {
    if (isSumLabel(row.label)) {
      return;
    }

    const isInitialRow = isMatrixInitialRow(row);

    row.values.forEach((value, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }

      diagnostics.push(
        ...validateMatrixEntryUnits(value, kind, variableUnitMetadata, {
          rowLabel: row.label,
          columnLabel: cell.columns[columnIndex],
          cell: { id: cell.id, title: cell.title },
          isInitialRow
        })
      );
    });
  });

  return diagnostics;
}

export function firstMatrixCellUnitValidationError(
  cell: MatrixCell,
  variableUnitMetadata: VariableUnitMetadata
): string | null {
  return formatMatrixCellUnitValidationMessage(cell, variableUnitMetadata);
}

export function formatMatrixCellUnitValidationMessage(
  cell: MatrixCell,
  variableUnitMetadata: VariableUnitMetadata
): string | null {
  const errors = validateMatrixCellUnits(cell, variableUnitMetadata).filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (errors.length === 0) {
    return null;
  }

  const [first, ...rest] = errors;
  if (rest.length === 0) {
    return first.message;
  }

  return `${first.message} (+${rest.length} more unit error${rest.length === 1 ? "" : "s"})`;
}

export function hasMatrixEntryUnitErrors(diagnostics: UnitDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
