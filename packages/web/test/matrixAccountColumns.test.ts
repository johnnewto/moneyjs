import { describe, expect, it } from "vitest";

import {
  buildMatrixAccountColumnDisplaySlots,
  buildMatrixAccountColumnHeaderRows,
  collectMatrixAccountSectorCollapseKeys,
  computeMatrixAccountRowTotal,
  formatMatrixAccountRowBalanceBreakdown,
  isMatrixAccountIntraSectorColumnDivider,
  isMatrixAccountSectorStartColumn,
  resolveMatrixAccountColumnCellClasses,
  normalizeMatrixAccountBadgeRole,
  parseMatrixAccountColumnLeafDisplay,
  signedMatrixAccountColumnContribution,
  validateMatrixAccountColumnsLayout
} from "@sfcr/notebook-core";

const columns = [
  "Households.Deposits (Mh)",
  "Households.Net_Worth (Vh)",
  "Firms.Deposits (Mf)",
  "Sum"
];
const sectors = ["Households", "Households", "Firms", ""];
const columnBadges = ["asset", "equity", "asset", ""];

describe("matrixAccountColumns", () => {
  it("normalizes equity badge aliases", () => {
    expect(normalizeMatrixAccountBadgeRole("equity")).toBe("equity");
    expect(normalizeMatrixAccountBadgeRole("netWorth")).toBe("equity");
  });

  it("sums account-transaction rows as A - L - E", () => {
    expect(signedMatrixAccountColumnContribution(10, "asset")).toBe(10);
    expect(signedMatrixAccountColumnContribution(10, "liability")).toBe(-10);
    expect(signedMatrixAccountColumnContribution(10, "equity")).toBe(-10);

    const columnBadges = ["asset", "liability", "equity", ""];
    expect(computeMatrixAccountRowTotal([100, 40, 30, 0], columnBadges, 3)).toBe(30);
    expect(computeMatrixAccountRowTotal([100, 100, 100, 0], columnBadges, 3)).toBe(-100);
  });

  it("validates parallel sectors and columnBadges lengths", () => {
    expect(validateMatrixAccountColumnsLayout(columns, sectors, columnBadges)).toBeNull();
    expect(
      validateMatrixAccountColumnsLayout(columns, sectors, ["asset", "equity"])
    ).toMatch(/columnBadges has 2 entries/);
  });

  it("parses leaf display names and variable symbols", () => {
    expect(parseMatrixAccountColumnLeafDisplay("Households.Deposits (Mh)")).toEqual({
      accountName: "Deposits",
      variableSymbol: "Mh",
      fullLabel: "Households.Deposits (Mh)"
    });
    expect(parseMatrixAccountColumnLeafDisplay("Bank.Firm.Loans (Ls)")).toEqual({
      accountName: "Firm.Loans",
      variableSymbol: "Ls",
      fullLabel: "Bank.Firm.Loans (Ls)"
    });
  });

  it("formats A-L-E imbalance breakdown tooltips", () => {
    const columnBadges = ["asset", "liability", "equity", ""];
    expect(
      formatMatrixAccountRowBalanceBreakdown([100, 40, 30, 0], columnBadges, 3, (value) => String(value))
    ).toBe("+100 −40 −30 = 30");
  });

  it("marks the first column in each sector group", () => {
    expect(isMatrixAccountSectorStartColumn(columns, sectors, 0)).toBe(true);
    expect(isMatrixAccountSectorStartColumn(columns, sectors, 1)).toBe(false);
    expect(isMatrixAccountSectorStartColumn(columns, sectors, 2)).toBe(true);
  });

  it("marks intra-sector column dividers before the next column in the same sector", () => {
    expect(isMatrixAccountIntraSectorColumnDivider(columns, sectors, 0)).toBe(true);
    expect(isMatrixAccountIntraSectorColumnDivider(columns, sectors, 1)).toBe(false);
    expect(isMatrixAccountIntraSectorColumnDivider(columns, sectors, 2)).toBe(false);
  });

  it("resolves surface classes for visible and collapsed account columns", () => {
    expect(resolveMatrixAccountColumnCellClasses(columns, sectors, columnBadges, 0, 3)).toEqual([
      "notebook-matrix-sector-start",
      "notebook-matrix-intra-sector-divider",
      "notebook-matrix-cell-asset"
    ]);
    expect(resolveMatrixAccountColumnCellClasses(columns, sectors, columnBadges, 1, 3)).toEqual([
      "notebook-matrix-cell-equity"
    ]);
  });

  it("builds sector and leaf headers with equity badges", () => {
    const headerRows = buildMatrixAccountColumnHeaderRows(columns, sectors, columnBadges, undefined, new Set());
    expect(headerRows[0]?.[0]).toMatchObject({ label: "Households", colSpan: 2, isSectorStart: true });
    expect(headerRows[1]?.map((cell) => cell.stockRole)).toEqual(["asset", "equity", "asset"]);
    expect(headerRows[1]?.map((cell) => cell.isSectorStart)).toEqual([true, false, true]);
    expect(headerRows[1]?.map((cell) => cell.label)).toEqual(["Deposits", "Net_Worth", "Deposits"]);
    expect(headerRows[1]?.map((cell) => cell.variableSymbol)).toEqual(["Mh", "Vh", "Mf"]);
    expect(headerRows[1]?.map((cell) => cell.fullLabel)).toEqual([
      "Households.Deposits (Mh)",
      "Households.Net_Worth (Vh)",
      "Firms.Deposits (Mf)"
    ]);
  });

  it("supports sector collapse and per-column hide", () => {
    const collapsedSector = buildMatrixAccountColumnDisplaySlots(
      columns,
      sectors,
      columnBadges,
      new Set(["sector:Households"])
    );
    expect(collapsedSector).toEqual([
      { kind: "collapsed", nodeId: "sector:Households", label: "Households" },
      { kind: "leaf", columnIndex: 2 }
    ]);

    const hiddenLeaf = buildMatrixAccountColumnDisplaySlots(
      columns,
      sectors,
      columnBadges,
      new Set(["col:0"])
    );
    expect(hiddenLeaf[0]).toMatchObject({
      kind: "hiddenLeaf",
      columnIndex: 0,
      stockRole: "asset"
    });
  });

  it("collects unique sector collapse keys", () => {
    expect(collectMatrixAccountSectorCollapseKeys(sectors)).toEqual([
      "sector:Households",
      "sector:Firms"
    ]);
  });
});
