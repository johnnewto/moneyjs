// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  collectMatrixColumnCollapseNodeIds,
  filterMatrixColumnCollapseNodeIds,
  matrixColumnCollapseStorageKey,
  normalizeMatrixColumnCollapseNodeIds,
  readStoredMatrixColumnCollapse,
  writeStoredMatrixColumnCollapse
} from "../src/notebook/matrixColumnCollapseStorage";
import { resolveNotebookScopeId } from "../src/notebook/resolveNotebookScopeId";
import type { MatrixCell } from "../src/notebook/types";

const accountMatrix: MatrixCell = {
  id: "account-transactions",
  type: "matrix",
  title: "Account transactions",
  columns: ["Households.Deposits (Mh)", "Firms.Loans (Ld)", "Sum"],
  sectors: ["Households (H)", "Firms (F)", ""],
  columnBadges: ["asset", "liability", ""],
  accountingKind: "account-transactions",
  rows: [{ label: "Wages", values: ["1", "2", "0"] }]
};

describe("resolveNotebookScopeId", () => {
  it("prefers variant id over template and document id", () => {
    expect(
      resolveNotebookScopeId({
        activeVariantId: "my-variant",
        document: { id: "doc-1", metadata: { template: "bmw" } },
        currentTemplateId: "bmw"
      })
    ).toBe("variant:my-variant");
  });

  it("uses template scope for unmodified template sessions", () => {
    expect(
      resolveNotebookScopeId({
        activeVariantId: null,
        document: { id: "bmw-notebook", metadata: { template: "bmw" } },
        currentTemplateId: "bmw"
      })
    ).toBe("template:bmw");
  });

  it("falls back to document id when not a template session", () => {
    expect(
      resolveNotebookScopeId({
        activeVariantId: null,
        document: { id: "edited-copy", metadata: {} },
        currentTemplateId: ""
      })
    ).toBe("doc:edited-copy");
  });
});

describe("matrixColumnCollapseStorage", () => {
  const storageKey = matrixColumnCollapseStorageKey("template:bmw", "account-transactions");

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("collects sector and per-column collapse node ids for account layouts", () => {
    const valid = collectMatrixColumnCollapseNodeIds(accountMatrix);
    expect(valid.has("sector:Households (H)")).toBe(true);
    expect(valid.has("sector:Firms (F)")).toBe(true);
    expect(valid.has("col:Households (H):Households.Deposits (Mh)")).toBe(true);
    expect(valid.has("col:Firms (F):Firms.Loans (Ld)")).toBe(true);
    expect(valid.has("col:2")).toBe(false);
  });

  it("persists and restores collapse ids per notebook scope and matrix cell", () => {
    const valid = collectMatrixColumnCollapseNodeIds(accountMatrix);
    writeStoredMatrixColumnCollapse(storageKey, new Set(["sector:Households (H)", "col:1", "stale:id"]));

    expect(
      readStoredMatrixColumnCollapse(storageKey, valid, accountMatrix.columns, accountMatrix.sectors)
    ).toEqual(new Set(["sector:Households (H)", "col:Firms (F):Firms.Loans (Ld)"]));

    const otherKey = matrixColumnCollapseStorageKey("template:sim", "account-transactions");
    expect(
      readStoredMatrixColumnCollapse(otherKey, valid, accountMatrix.columns, accountMatrix.sectors)
    ).toEqual(new Set());
  });

  it("filters unknown node ids", () => {
    const valid = new Set(["sector:Households"]);
    expect(filterMatrixColumnCollapseNodeIds(["sector:Households", "col:9"], valid)).toEqual(
      new Set(["sector:Households"])
    );
  });

  it("migrates legacy index-only column collapse ids", () => {
    const valid = collectMatrixColumnCollapseNodeIds(accountMatrix);
    expect(
      normalizeMatrixColumnCollapseNodeIds(
        ["col:0", "sector:Households (H)"],
        valid,
        accountMatrix.columns,
        accountMatrix.sectors
      )
    ).toEqual(
      new Set(["col:Households (H):Households.Deposits (Mh)", "sector:Households (H)"])
    );
  });

  it("collects only sector collapse ids for transactions-flow sector layouts", () => {
    const transactionFlowMatrix: MatrixCell = {
      id: "transaction-flow",
      type: "matrix",
      title: "Transactions flow",
      columns: ["Households", "Firms current", "Firms capital", "Sum"],
      sectors: ["Households", "Firms", "Firms", ""],
      rows: [{ label: "Consumption", values: ["-C", "+C", "", "0"] }]
    };
    const valid = collectMatrixColumnCollapseNodeIds(transactionFlowMatrix);
    expect(valid.has("sector:Households")).toBe(true);
    expect(valid.has("sector:Firms")).toBe(true);
    expect([...valid].some((nodeId) => nodeId.startsWith("col:"))).toBe(false);
  });
});
