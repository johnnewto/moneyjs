import { describe, expect, it } from "vitest";

import {
  buildMatrixColumnDisplaySlots,
  buildMatrixColumnHeaderRows,
  classifyMatrixColumnTreeCategoryRole,
  collectVisibleMatrixColumnLeaves,
  flattenMatrixColumnTreeLeaves,
  formatMatrixColumnLeafHeaderLabel,
  parseMatrixColumnTree,
  validateMatrixColumnTreeMatchesColumns
} from "@sfcr/notebook-core";

const sampleTree = [
  {
    id: "households",
    label: "Households",
    children: [
      {
        id: "hh-assets",
        label: "Assets",
        children: [{ id: "Mh", label: "Households.Deposits (Mh)", variable: "Mh" }]
      },
      {
        id: "hh-equity",
        label: "Equity",
        children: [{ id: "Vh", label: "Households.Net_Worth (Vh)", variable: "Vh" }]
      }
    ]
  }
];

describe("matrixColumnTree", () => {
  it("parses nested columnTree nodes from YAML-shaped input", () => {
    const tree = parseMatrixColumnTree([
      {
        id: "firms",
        label: "Firms",
        children: [{ id: "Ld", label: "Firms.Loans (Ld)", variable: "Ld" }]
      }
    ]);

    expect(tree).toEqual([
      {
        id: "firms",
        label: "Firms",
        children: [{ id: "Ld", label: "Firms.Loans (Ld)", variable: "Ld" }]
      }
    ]);
  });

  it("validates leaf order against flat columns", () => {
    expect(
      validateMatrixColumnTreeMatchesColumns(sampleTree, [
        "Households.Deposits (Mh)",
        "Households.Net_Worth (Vh)",
        "Sum"
      ])
    ).toBeNull();
    expect(validateMatrixColumnTreeMatchesColumns(sampleTree, ["Vh", "Mh", "Sum"])).toMatch(
      /does not match columns/
    );
  });

  it("builds sector and leaf header rows with category roles on leaves", () => {
    const columns = ["Households.Deposits (Mh)", "Households.Net_Worth (Vh)", "Sum"];
    const expanded = buildMatrixColumnHeaderRows(sampleTree, columns, new Set());
    expect(expanded).toHaveLength(2);
    expect(expanded[0]?.[0]).toMatchObject({ label: "Households", colSpan: 2, isExpandable: true });
    expect(expanded[1]?.map((cell) => cell.label)).toEqual([
      ".Deposits (Mh)",
      ".Net_Worth (Vh)"
    ]);
    expect(expanded[1]?.map((cell) => cell.stockRole)).toEqual(["asset", "equity"]);

    const hiddenLeafSlots = buildMatrixColumnDisplaySlots(sampleTree, columns, new Set(["Mh"]));
    expect(hiddenLeafSlots).toEqual([
      { kind: "hiddenLeaf", nodeId: "Mh", columnIndex: 0, stockRole: "asset" },
      { kind: "leaf", columnIndex: 1 }
    ]);

    const hiddenLeafHeaders = buildMatrixColumnHeaderRows(sampleTree, columns, new Set(["Mh"]));
    expect(hiddenLeafHeaders[1]?.[0]).toMatchObject({
      nodeId: "Mh",
      isLeafHidden: true,
      stockRole: "asset"
    });
    expect(hiddenLeafHeaders[1]?.[1]).toMatchObject({
      nodeId: "Vh",
      isLeafHidden: false
    });

    const collapsedSlots = buildMatrixColumnDisplaySlots(sampleTree, columns, new Set(["households"]));
    expect(collapsedSlots).toEqual([
      { kind: "collapsed", nodeId: "households", label: "Households" }
    ]);

    const collapsedHeaders = buildMatrixColumnHeaderRows(sampleTree, columns, new Set(["households"]));
    expect(collapsedHeaders[0]?.[0]).toMatchObject({
      label: "Households",
      colSpan: 1,
      rowSpan: 2,
      isCollapsedStub: true
    });

    const collapsedLeaves = collectVisibleMatrixColumnLeaves(sampleTree, columns, new Set(["households"]));
    expect(collapsedLeaves).toEqual([]);
  });
});

describe("classifyMatrixColumnTreeCategoryRole", () => {
  it("maps category labels to stock roles", () => {
    expect(classifyMatrixColumnTreeCategoryRole("Assets")).toBe("asset");
    expect(classifyMatrixColumnTreeCategoryRole("Liabilities")).toBe("liability");
    expect(classifyMatrixColumnTreeCategoryRole("Equity")).toBe("equity");
  });
});

describe("formatMatrixColumnLeafHeaderLabel", () => {
  it("shows only the account suffix from the first dot", () => {
    expect(formatMatrixColumnLeafHeaderLabel("Households.Deposits (Mh)")).toBe(".Deposits (Mh)");
    expect(formatMatrixColumnLeafHeaderLabel("Firms.Loans (Ld)")).toBe(".Loans (Ld)");
    expect(formatMatrixColumnLeafHeaderLabel("Bank.Firm.Loans (Ls)")).toBe(".Firm.Loans (Ls)");
    expect(formatMatrixColumnLeafHeaderLabel("Banks.HH.Deposits (MhL)")).toBe(".HH.Deposits (MhL)");
    expect(formatMatrixColumnLeafHeaderLabel("Banks.Firm.Deposits (MfL)")).toBe(".Firm.Deposits (MfL)");
    expect(formatMatrixColumnLeafHeaderLabel("Sum")).toBe("Sum");
  });
});

describe("flattenMatrixColumnTreeLeaves", () => {
  it("returns leaves in depth-first order", () => {
    expect(flattenMatrixColumnTreeLeaves(sampleTree).map((node) => node.id)).toEqual(["Mh", "Vh"]);
  });
});
