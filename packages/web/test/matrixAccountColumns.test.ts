import { describe, expect, it } from "vitest";

import {
  buildMatrixAccountColumnDisplaySlots,
  buildMatrixAccountColumnHeaderRows,
  collectMatrixAccountSectorCollapseKeys,
  computeMatrixAccountRowTotal,
  normalizeMatrixAccountBadgeRole,
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

  it("builds sector and leaf headers with equity badges", () => {
    const headerRows = buildMatrixAccountColumnHeaderRows(columns, sectors, columnBadges, undefined, new Set());
    expect(headerRows[0]?.[0]).toMatchObject({ label: "Households", colSpan: 2 });
    expect(headerRows[1]?.map((cell) => cell.stockRole)).toEqual(["asset", "equity", "asset"]);
    expect(headerRows[1]?.map((cell) => cell.label)).toEqual([
      ".Deposits (Mh)",
      ".Net_Worth (Vh)",
      ".Deposits (Mf)"
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
