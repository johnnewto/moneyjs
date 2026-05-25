import { describe, expect, it } from "vitest";

import {
  buildMultiportParticipantStocks,
  findCompanionBalanceMatrixCell
} from "../src/components/multiportParticipantStocks";
import type { VariableUnitMetadata } from "../src/lib/unitMeta";
import type { MatrixCell, NotebookCell } from "../src/notebook/types";

describe("multiportParticipantStocks", () => {
  const transactionMatrix: MatrixCell = {
    id: "transaction-flow",
    type: "matrix",
    title: "Transactions",
    columns: ["Households", "Firms", "Banks", "Sum"],
    sectors: ["Households", "Firms", "Banks", ""],
    rows: [
      { band: "Deposits", label: "Ch. deposits", values: ["-d(Mh)", "", "+d(Ms)", "0"] },
      { band: "Loans", label: "Ch. loans", values: ["", "-d(Ld)", "+d(Ls)", "0"] },
      { label: "Sum", values: ["0", "0", "0", "0"] }
    ]
  };

  const balanceMatrix: MatrixCell = {
    id: "balance-sheet",
    type: "matrix",
    title: "Balance sheet",
    columns: ["Households", "Firms", "Banks", "Sum"],
    sectors: ["Households", "Firms", "Banks", ""],
    rows: [
      { band: "Deposits", label: "Money deposits", values: ["+Mh", "", "-Ms", "0"] },
      { band: "Loans", label: "Loans", values: ["", "-Ld", "+Ls", "0"] },
      { label: "Sum", values: ["0", "0", "0", "0"] }
    ]
  };

  it("collects derivative-balance stocks per participant", () => {
    const stocks = buildMultiportParticipantStocks(transactionMatrix, balanceMatrix, null, 0);

    expect(stocks.get("Households")).toEqual([
      expect.objectContaining({
        variableName: "Mh",
        displayName: "-Mh",
        role: "asset",
        formattedValue: "--"
      })
    ]);
    expect(stocks.get("Firms")).toEqual([
      expect.objectContaining({
        variableName: "Ld",
        displayName: "-Ld",
        role: "liability"
      })
    ]);
    expect(stocks.get("Banks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          variableName: "Ms",
          displayName: "+Ms",
          role: "liability"
        }),
        expect.objectContaining({
          variableName: "Ls",
          displayName: "+Ls",
          role: "asset"
        })
      ])
    );
  });

  it("formats stock values with units to two decimal places", () => {
    const unitMetadata: VariableUnitMetadata = new Map([
      ["Mh", { stockFlow: "stock", signature: { money: 1 } }],
      ["Ld", { stockFlow: "stock", signature: { money: 1 } }]
    ]);
    const result = {
      series: {
        Mh: [999.987],
        Ld: [1200]
      },
      model: { externals: {} }
    } as const;

    const stocks = buildMultiportParticipantStocks(
      transactionMatrix,
      balanceMatrix,
      result,
      0,
      unitMetadata
    );

    expect(stocks.get("Households")?.[0]?.formattedValue).toBe("$999.99");
    expect(stocks.get("Firms")?.[0]?.formattedValue).toBe("$1,200.00");
  });

  it("finds the balance-sheet matrix companion", () => {
    const cells: NotebookCell[] = [transactionMatrix, balanceMatrix];
    expect(findCompanionBalanceMatrixCell(cells, transactionMatrix)?.id).toBe("balance-sheet");
  });
});
