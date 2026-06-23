import { describe, expect, it } from "vitest";

import {
  buildSourceHelperActions,
  buildSourceHelpText,
  getNotebookHelpTopicIdForCell
} from "../src/notebook/sourceEditing";
import type { ChartCell, MatrixCell } from "../src/notebook/types";

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

function chartCell(overrides: Partial<ChartCell> = {}): ChartCell {
  return {
    id: "chart-1",
    type: "chart",
    title: "Chart",
    sourceRunCellId: "run-1",
    variables: ["Y", "Cd"],
    ...overrides
  };
}

describe("sourceEditing chart axisGroups insert", () => {
  function axisGroupsInsert(cell: ChartCell, suggestion?: string[][]): string | undefined {
    return buildSourceHelperActions(cell, { chartAxisGroupSuggestion: suggestion }).find(
      (action) => action.label === "Axis groups"
    )?.insert;
  }

  it("uses the provided suggestion in the insert snippet", () => {
    expect(axisGroupsInsert(chartCell(), [["Y", "Cd", "Mh"], ["W"]])).toBe(
      '"axisGroups": [["Y", "Cd", "Mh"], ["W"]]'
    );
    expect(axisGroupsInsert(chartCell(), [["ydhs", "c"], ["p"]])).toBe(
      '"axisGroups": [["ydhs", "c"], ["p"]]'
    );
  });

  it("falls back to a generic example when no suggestion is given", () => {
    expect(axisGroupsInsert(chartCell())).toBe('"axisGroups": [["Y", "Cd", "Mh"], ["W"]]');
  });
});
