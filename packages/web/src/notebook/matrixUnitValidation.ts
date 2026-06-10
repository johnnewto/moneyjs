import { parseExpression } from "@sfcr/core";

import { inferUnits, type UnitDiagnostic } from "../lib/units";
import {
  formatSignature,
  formatUnitText,
  normalizeSignature,
  signaturesEqual,
  type UnitSignature,
  type VariableUnitMetadata
} from "../lib/unitMeta";
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

export function validateMatrixEntryUnits(
  source: string,
  kind: AccountingMatrixKind,
  variableUnitMetadata: VariableUnitMetadata,
  context?: MatrixEntryUnitContext
): UnitDiagnostic[] {
  const trimmed = source.trim();
  if (!trimmed || trimmed === "0") {
    return [];
  }

  const allowed = expectedSignaturesForKind(kind);
  const location = formatEntryLocation(context);

  try {
    const expression = parseExpression(stripLeadingPlus(trimmed));
    const inferred = inferUnits(expression, variableUnitMetadata);
    const diagnostics = inferred.diagnostics.filter((entry) => entry.severity === "error");

    if (inferred.signature == null) {
      diagnostics.push({
        severity: "warning",
        message: `${matrixKindLabel(kind)} matrix cell${location} cannot verify units for '${trimmed}'.`
      });
      return diagnostics;
    }

    if (!signatureMatchesAllowed(inferred.signature, allowed)) {
      const inferredLabel =
        formatUnitText({ signature: inferred.signature }) ?? formatSignature(inferred.signature);
      diagnostics.push({
        severity: "error",
        message: `${matrixKindLabel(kind)} matrix cell${location} expects ${expectedUnitLabelsForKind(kind)}, but '${trimmed}' infers ${inferredLabel}.`
      });
    }

    return diagnostics;
  } catch {
    return [
      {
        severity: "warning",
        message: `${matrixKindLabel(kind)} matrix cell${location} cannot parse '${trimmed}' for unit validation.`
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

    row.values.forEach((value, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }

      diagnostics.push(
        ...validateMatrixEntryUnits(value, kind, variableUnitMetadata, {
          rowLabel: row.label,
          columnLabel: cell.columns[columnIndex]
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
