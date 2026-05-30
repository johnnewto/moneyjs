import { resolveAccountingMatrixKind } from "./validation";
import type { MatrixCell } from "./types";

export type MatrixTableKind = "flows" | "stocks";

const FLOW_HINTS = [
  "change",
  "consumption",
  "depreciation",
  "deposit",
  "interest",
  "investment",
  "loan",
  "profit",
  "tax",
  "wages"
];

const STOCK_HINTS = [
  "balance",
  "capital",
  "deposit",
  "equity",
  "fixed capital",
  "inventory",
  "loan",
  "money",
  "net wealth",
  "net worth"
];

export function resolveMatrixTableKind(
  cell: MatrixCell,
  mode: "auto" | MatrixTableKind = "auto"
): MatrixTableKind {
  if (mode !== "auto") {
    return mode;
  }

  const accountingKind = resolveAccountingMatrixKind(cell);
  if (accountingKind === "balance-sheet") {
    return "stocks";
  }
  if (accountingKind === "transaction-flow" || accountingKind === "account-transactions") {
    return "flows";
  }

  return inferMatrixTableKind(cell, "auto");
}

export function inferMatrixTableKind(
  cell: MatrixCell,
  mode: "auto" | MatrixTableKind = "auto"
): MatrixTableKind {
  if (mode !== "auto") {
    return mode;
  }

  let flowScore = 0;
  let stockScore = 0;
  for (const row of cell.rows) {
    const haystack = `${row.band ?? ""} ${row.label}`.toLowerCase();
    if (FLOW_HINTS.some((hint) => haystack.includes(hint))) {
      flowScore += 1;
    }
    if (STOCK_HINTS.some((hint) => haystack.includes(hint))) {
      stockScore += 1;
    }
  }

  return stockScore > flowScore ? "stocks" : "flows";
}

export type MatrixStockRole = "asset" | "liability" | "equity";

export function formatStockRoleLabel(role: MatrixStockRole): string {
  switch (role) {
    case "asset":
      return "A";
    case "liability":
      return "L";
    case "equity":
      return "E";
  }
}

export function formatStockRoleTitle(role: MatrixStockRole): string {
  switch (role) {
    case "asset":
      return "Asset";
    case "liability":
      return "Liability";
    case "equity":
      return "Equity";
  }
}

export function classifyMatrixStockRole(
  rowLabel: string,
  source: string,
  numericValue: number | null
): MatrixStockRole | null {
  const normalizedLabel = rowLabel.trim().toLowerCase();
  if (
    normalizedLabel.includes("net worth") ||
    normalizedLabel.includes("net wealth") ||
    normalizedLabel.includes("balance")
  ) {
    return "equity";
  }

  const direction = inferMatrixDirection(source);
  if (direction === 1) {
    return "asset";
  }
  if (direction === -1) {
    return "liability";
  }
  if (numericValue == null) {
    return null;
  }
  if (numericValue > 0) {
    return "asset";
  }
  if (numericValue < 0) {
    return "liability";
  }
  return null;
}

function inferMatrixDirection(source: string): -1 | 0 | 1 | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("+")) {
    return 1;
  }
  if (trimmed.startsWith("-")) {
    return -1;
  }
  return 0;
}