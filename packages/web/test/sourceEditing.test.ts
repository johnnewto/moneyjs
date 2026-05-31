import { describe, expect, it } from "vitest";

import {
  buildSourceHelperActions,
  buildSourceHelpText,
  getNotebookHelpTopicIdForCell
} from "../src/notebook/sourceEditing";
import type { MatrixCell } from "../src/notebook/types";

function matrixCell(overrides: Partial<MatrixCell> = {}): MatrixCell {
  return {
    id: "matrix-1",
    type: "matrix",
    title: "Matrix",
    columns: ["A"],
    rows: [{ label: "Row", values: ["0"] }],
    ...overrides
  };
}

describe("sourceEditing matrix help", () => {
  it("routes matrix cells to accounting-kind help topics", () => {
    expect(
      getNotebookHelpTopicIdForCell(
        matrixCell({ accountingKind: "balance-sheet", title: "Generic" })
      )
    ).toBe("balance-sheet-matrix");
    expect(
      getNotebookHelpTopicIdForCell(
        matrixCell({ accountingKind: "transaction-flow", title: "Generic" })
      )
    ).toBe("transaction-flow-matrix");
    expect(
      getNotebookHelpTopicIdForCell(
        matrixCell({ accountingKind: "account-transactions", title: "Generic" })
      )
    ).toBe("account-transactions-matrix");
    expect(getNotebookHelpTopicIdForCell(matrixCell())).toBe("matrix");
  });

  it("documents accountingKind in matrix syntax help", () => {
    const help = buildSourceHelpText(matrixCell());
    expect(help).toContain("accountingKind");
    expect(help).toContain("account-transactions");
    expect(help).toContain("transaction-flow");
    expect(help).toContain("balance-sheet");
  });

  it("offers insert snippets for accounting kinds", () => {
    const labels = buildSourceHelperActions(matrixCell()).map((action) => action.label);
    expect(labels).toContain("Balance sheet kind");
    expect(labels).toContain("Transaction flow kind");
    expect(labels).toContain("Account transactions kind");

    const inserts = buildSourceHelperActions(matrixCell()).map((action) => action.insert);
    expect(inserts).toContain('"accountingKind": "balance-sheet"');
    expect(inserts).toContain('"accountingKind": "transaction-flow"');
    expect(inserts).toContain('"accountingKind": "account-transactions"');
  });
});
