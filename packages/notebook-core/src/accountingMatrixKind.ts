import type { MatrixCell } from "./types";

export type AccountingMatrixKind =
  | "transaction-flow"
  | "balance-sheet"
  | "account-transactions"
  | "input-output";

export function normalizeAccountingMatrixKindInput(
  input: unknown
): AccountingMatrixKind | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const key = input.trim().toLowerCase().replace(/[\s_-]+/g, "");
  switch (key) {
    case "balancesheet":
    case "balance":
      return "balance-sheet";
    case "transactionflow":
    case "transactionsflow":
    case "transaction":
      return "transaction-flow";
    case "accounttransactions":
    case "accounttransaction":
      return "account-transactions";
    case "inputoutput":
    case "io":
      return "input-output";
    default:
      return undefined;
  }
}

export function inferAccountingMatrixKind(cell: MatrixCell): AccountingMatrixKind | null {
  const title = normalizeAccountingLabel(cell.title);
  const id = normalizeAccountingLabel(cell.id);

  if (title.includes("account transaction") || id.includes("account transaction")) {
    return "account-transactions";
  }

  if (title.includes("transaction") || id.includes("transaction")) {
    return "transaction-flow";
  }

  if (title.includes("balance sheet") || id.includes("balance sheet")) {
    return "balance-sheet";
  }

  if (
    title.includes("input-output") ||
    title.includes("input output") ||
    id.includes("input-output") ||
    id.includes("input-output-table")
  ) {
    return "input-output";
  }

  return null;
}

export function resolveAccountingMatrixKind(cell: MatrixCell): AccountingMatrixKind | null {
  return cell.accountingKind ?? inferAccountingMatrixKind(cell);
}

export function normalizeMatrixCellAccountingKind<T extends MatrixCell>(cell: T): T {
  const normalized = normalizeAccountingMatrixKindInput(cell.accountingKind);
  if (!normalized || normalized === cell.accountingKind) {
    return cell;
  }
  return { ...cell, accountingKind: normalized };
}

function normalizeAccountingLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}
