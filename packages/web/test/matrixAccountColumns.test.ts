import { describe, expect, it } from "vitest";

import {
  buildMatrixAccountColumnDisplaySlots,
  buildMatrixAccountColumnHeaderRows,
  collectMatrixAccountSectorCollapseKeys,
  computeMatrixAccountRowTotal,
  computeSectorImpliedEquity,
  formatMatrixAccountRowBalanceBreakdown,
  isMatrixAccountIntraSectorColumnDivider,
  isMatrixAccountSectorStartColumn,
  resolveMatrixAccountColumnCellClasses,
  normalizeMatrixAccountBadgeRole,
  formatMatrixSectorCollapsedLabel,
  formatMatrixAccountColumnDisplayLabel,
  formatMatrixAccountColumnTooltipLabel,
  migrateLegacyColumnCollapseNodeId,
  parseMatrixAccountColumnLeafDisplay,
  parseMatrixSectorDisplay,
  resolveMatrixColumnInspectVariable,
  resolveMatrixColumnSumReference,
  signedMatrixAccountColumnContribution,
  usesMatrixSectorColumnLayout,
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

  it("sums unsigned stock magnitudes as A - L - E", () => {
    expect(signedMatrixAccountColumnContribution(10, "asset")).toBe(10);
    expect(signedMatrixAccountColumnContribution(10, "liability")).toBe(-10);
    expect(signedMatrixAccountColumnContribution(10, "equity")).toBe(-10);

    const columnBadges = ["asset", "liability", "equity", ""];
    expect(computeMatrixAccountRowTotal([100, 40, 30, 0], columnBadges, 3)).toBe(30);
    expect(computeMatrixAccountRowTotal([100, 100, 100, 0], columnBadges, 3)).toBe(-100);
  });

  it("weights every column by badge sign regardless of cell sign", () => {
    const columnBadges = ["asset", "equity", "asset", "asset", "liability", ""];
    const interestOnDepositsRow = [12, -12, 0, 12, -12, null];
    expect(computeMatrixAccountRowTotal(interestOnDepositsRow, columnBadges, 5)).toBe(48);
    expect(
      interestOnDepositsRow.reduce<number>(
        (total, value, index) => (index === 5 ? total : total + (value ?? 0)),
        0
      )
    ).toBe(0);
  });

  it("infers empty equity from sector row assets and liabilities", () => {
    const columns = ["Deposits", "Bills", "Equity", "Sum"];
    const sectors = ["Poor (HH)", "Poor (HH)", "Poor (HH)", ""];
    const columnBadges = ["asset", "liability", "equity", ""];

    expect(
      computeSectorImpliedEquity(columns, sectors, columnBadges, 2, (columnIndex) => {
        const values = [100, 40, null, null];
        return values[columnIndex];
      })
    ).toBe(60);

    expect(computeSectorImpliedEquity(columns, sectors, columnBadges, 2, () => null)).toBeNull();

    expect(
      computeSectorImpliedEquity(columns, sectors, columnBadges, 2, (columnIndex) =>
        columnIndex === 0 ? 100 : null
      )
    ).toBe(100);

    expect(
      computeSectorImpliedEquity(columns, sectors, columnBadges, 2, (columnIndex) =>
        columnIndex === 1 ? 40 : null
      )
    ).toBe(-40);

    expect(
      computeSectorImpliedEquity(columns, ["Poor (HH)", "Poor (HH)"], columnBadges, 2, () => null)
    ).toBeNull();
  });

  it("validates parallel sectors and columnBadges lengths", () => {
    expect(validateMatrixAccountColumnsLayout(columns, sectors, columnBadges)).toBeNull();
    expect(
      validateMatrixAccountColumnsLayout(columns, sectors, ["asset", "equity"])
    ).toMatch(/columnBadges has 2 entries/);
  });

  it("parses sector display names and collapsed aliases", () => {
    expect(parseMatrixSectorDisplay("Households (H)")).toEqual({
      sectorName: "Households",
      variableSymbol: "H",
      fullLabel: "Households (H)"
    });
    expect(formatMatrixSectorCollapsedLabel("Firms")).toBe("F");
    expect(formatMatrixSectorCollapsedLabel("Banks (Bk)")).toBe("B");
  });

  it("formats account column display labels and sector-prefixed tooltips", () => {
    expect(formatMatrixAccountColumnDisplayLabel("Deposits (Mh)")).toBe("Deposits");
    expect(formatMatrixAccountColumnDisplayLabel("Firm.Loans")).toBe("Firm.Loans");
    expect(formatMatrixAccountColumnDisplayLabel("Households.Deposits (Mh)")).toBe("Households.Deposits");

    expect(formatMatrixAccountColumnTooltipLabel("Deposits (Mh)", "Households(HH)")).toBe(
      "Households(HH).Deposits"
    );
    expect(formatMatrixAccountColumnTooltipLabel("Firm.Loans", "Banks")).toBe("Banks.Firm.Loans");
    expect(formatMatrixAccountColumnTooltipLabel("Capital", "")).toBe("Capital");
  });

  it("resolves matrix column sum and inspect variable names", () => {
    expect(resolveMatrixColumnSumReference(["Deposits (Mh)", "Sum"], 0, ["Households(HH)", ""])).toBe(
      "Households.Deposits"
    );
    expect(
      resolveMatrixColumnInspectVariable(
        ["Deposits (Mh)", "Sum"],
        0,
        undefined,
        ["Households(HH)", ""]
      )
    ).toBe("Households.Deposits");
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

  it("resolves sector boundary classes for sector-only balance-sheet and transaction-flow layouts", () => {
    const flowColumns = ["Households", "Firms current", "Firms capital", "Sum"];
    const flowSectors = ["Households", "Production firms", "Production firms", ""];

    expect(resolveMatrixAccountColumnCellClasses(flowColumns, flowSectors, undefined, 0, 3)).toEqual([
      "notebook-matrix-sector-start"
    ]);
    expect(resolveMatrixAccountColumnCellClasses(flowColumns, flowSectors, undefined, 1, 3)).toEqual([
      "notebook-matrix-sector-start",
      "notebook-matrix-intra-sector-divider"
    ]);
    expect(resolveMatrixAccountColumnCellClasses(flowColumns, flowSectors, undefined, 2, 3)).toEqual([]);
  });

  it("builds sector and leaf headers with equity badges", () => {
    const sectorsWithAliases = ["Households (H)", "Households (H)", "Firms (F)", ""];
    const collapsedSectorHeaders = buildMatrixAccountColumnHeaderRows(
      columns,
      sectorsWithAliases,
      columnBadges,
      undefined,
      new Set(["sector:Households (H)"])
    );
    expect(collapsedSectorHeaders[0]?.[0]).toMatchObject({
      label: "H",
      fullLabel: "Households (H)",
      variableSymbol: "H",
      isCollapsedStub: true
    });

    const headerRows = buildMatrixAccountColumnHeaderRows(columns, sectors, columnBadges, undefined, new Set());
    expect(headerRows[0]?.[0]).toMatchObject({
      label: "Households",
      fullLabel: "Households",
      colSpan: 2,
      isSectorStart: true
    });
    expect(headerRows[1]?.map((cell) => cell.stockRole)).toEqual(["asset", "equity", "asset"]);
    expect(headerRows[1]?.map((cell) => cell.isSectorStart)).toEqual([true, false, true]);
    expect(headerRows[1]?.map((cell) => cell.label)).toEqual([
      "Households.Deposits",
      "Households.Net_Worth",
      "Firms.Deposits"
    ]);
    expect(headerRows[1]?.map((cell) => cell.variableSymbol)).toEqual(["Mh", "Vh", "Mf"]);
    expect(headerRows[1]?.map((cell) => cell.fullLabel)).toEqual([
      "Households.Households.Deposits",
      "Households.Households.Net_Worth",
      "Firms.Firms.Deposits"
    ]);
  });

  it("builds BMW-style split sector and account headers", () => {
    const bmwColumns = [
      "Deposits (Mh)",
      "Net_Worth (Vh)",
      "Deposits (Mf)",
      "Capital",
      "Loans",
      "Net_Worth (Vf)",
      "Firm.Loans",
      "HH.Deposits",
      "Firm.Deposits",
      "Net_Worth (Vb)",
      "Sum"
    ];
    const bmwSectors = [
      "Households(HH)",
      "Households(HH)",
      "Firms",
      "Firms",
      "Firms",
      "Firms",
      "Banks",
      "Banks",
      "Banks",
      "Banks",
      ""
    ];
    const bmwBadges = [
      "asset",
      "equity",
      "asset",
      "asset",
      "liability",
      "equity",
      "asset",
      "liability",
      "liability",
      "equity",
      ""
    ];
    const headerRows = buildMatrixAccountColumnHeaderRows(
      bmwColumns,
      bmwSectors,
      bmwBadges,
      undefined,
      new Set()
    );

    expect(headerRows[1]?.map((cell) => cell.label)).toEqual([
      "Deposits",
      "Net_Worth",
      "Deposits",
      "Capital",
      "Loans",
      "Net_Worth",
      "Firm.Loans",
      "HH.Deposits",
      "Firm.Deposits",
      "Net_Worth"
    ]);
    expect(headerRows[1]?.map((cell) => cell.fullLabel)).toEqual([
      "Households(HH).Deposits",
      "Households(HH).Net_Worth",
      "Firms.Deposits",
      "Firms.Capital",
      "Firms.Loans",
      "Firms.Net_Worth",
      "Banks.Firm.Loans",
      "Banks.HH.Deposits",
      "Banks.Firm.Deposits",
      "Banks.Net_Worth"
    ]);
  });

  it("supports sector collapse and per-column hide", () => {
    const sectorsWithAliases = ["Households (H)", "Households (H)", "Firms (F)", ""];
    const collapsedSector = buildMatrixAccountColumnDisplaySlots(
      columns,
      sectorsWithAliases,
      columnBadges,
      new Set(["sector:Households (H)"])
    );
    expect(collapsedSector).toEqual([
      {
        kind: "collapsed",
        nodeId: "sector:Households (H)",
        label: "H",
        fullLabel: "Households (H)"
      },
      { kind: "leaf", columnIndex: 2 }
    ]);

    const collapsedPlainSector = buildMatrixAccountColumnDisplaySlots(
      columns,
      sectors,
      columnBadges,
      new Set(["sector:Households"])
    );
    expect(collapsedPlainSector).toEqual([
      {
        kind: "collapsed",
        nodeId: "sector:Households",
        label: "H",
        fullLabel: "Households"
      },
      { kind: "leaf", columnIndex: 2 }
    ]);

    const hiddenLeaf = buildMatrixAccountColumnDisplaySlots(
      columns,
      sectors,
      columnBadges,
      new Set(["col:Households:Households.Deposits (Mh)"])
    );
    expect(hiddenLeaf[0]).toMatchObject({
      kind: "hiddenLeaf",
      columnIndex: 0,
      stockRole: "asset",
      nodeId: "col:Households:Households.Deposits (Mh)"
    });
  });

  it("collects unique sector collapse keys", () => {
    expect(collectMatrixAccountSectorCollapseKeys(sectors)).toEqual([
      "sector:Households",
      "sector:Firms"
    ]);
  });

  it("detects sector-only layouts for transactions-flow matrices", () => {
    expect(
      usesMatrixSectorColumnLayout(
        ["Households", "Firms current", "Sum"],
        ["Households", "Firms", ""],
        undefined,
        undefined
      )
    ).toBe(true);
    expect(
      usesMatrixSectorColumnLayout(columns, sectors, columnBadges, undefined)
    ).toBe(false);
  });

  it("disables sector layout when a non-Sum column has a blank sector", () => {
    const ioColumns = [
      "Agriculture (demand)",
      "Manufacturing (demand)",
      "Services (demand)",
      "Final demand",
      "Output"
    ];
    expect(
      usesMatrixSectorColumnLayout(
        ioColumns,
        ["Agriculture (demand)", "Manufacturing (demand)", "Services (demand)", "Final demand", ""],
        undefined,
        undefined
      )
    ).toBe(false);
    expect(
      usesMatrixSectorColumnLayout(
        ioColumns,
        ["Agriculture (demand)", "Manufacturing (demand)", "Services (demand)", "Final demand", "Output"],
        undefined,
        undefined
      )
    ).toBe(true);
  });

  it("migrates legacy column collapse ids to sector-qualified keys", () => {
    expect(migrateLegacyColumnCollapseNodeId("col:0", columns, sectors)).toBe(
      "col:Households:Households.Deposits (Mh)"
    );
    expect(migrateLegacyColumnCollapseNodeId("sector:Households", columns, sectors)).toBe(
      "sector:Households"
    );
  });

  it("builds sector-grouped slots for transactions-flow layouts without per-column hide", () => {
    const flowColumns = ["Households", "Firms current", "Firms capital", "Sum"];
    const flowSectors = ["Households", "Production firms", "Production firms", ""];
    const collapsedFirms = buildMatrixAccountColumnDisplaySlots(
      flowColumns,
      flowSectors,
      [],
      new Set(["sector:Production firms"]),
      { perColumnCollapse: false }
    );
    expect(collapsedFirms).toEqual([
      { kind: "leaf", columnIndex: 0 },
      {
        kind: "collapsed",
        nodeId: "sector:Production firms",
        label: "P",
        fullLabel: "Production firms"
      }
    ]);
  });
});
