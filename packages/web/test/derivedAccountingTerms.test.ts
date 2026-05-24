import { describe, expect, it } from "vitest";

import { buildDerivedAccountingTermsFromCells } from "../src/notebook/derivedAccountingTerms";
import type { NotebookCell } from "../src/notebook/types";

describe("derived accounting terms", () => {
  it("normalizes matrix reference labels for interest and change expressions", () => {
    const cells: NotebookCell[] = [
      {
        id: "tx",
        type: "matrix",
        title: "Transactions",
        sourceRunCellId: "run-1",
        columns: ["A"],
        rows: [
          { label: "Interest", band: "Interest", values: ["r * Bs"] },
          { label: "Change", band: "Change", values: ["Hs - lag(Hs)"] }
        ]
      }
    ];

    const terms = buildDerivedAccountingTermsFromCells(cells);
    const byVariable = new Map(terms.map((term) => [term.canonicalVariable, term.label]));

    expect(byVariable.get("Bs")).toBe("r*Bs");
    expect(byVariable.get("Hs")).toBe("dHs");
  });

  it("derives terms from non-empty matrix cells for the variable inspector", () => {
    const cells: NotebookCell[] = [
      {
        id: "balance",
        type: "matrix",
        title: "Balance sheet",
        sourceRunCellId: "run-1",
        columns: ["Households"],
        rows: [{ label: "Deposits", band: "Money deposits", values: ["+Mh"] }]
      }
    ];

    const terms = buildDerivedAccountingTermsFromCells(cells);
    expect(terms).toEqual([
      expect.objectContaining({
        canonicalVariable: "Mh",
        band: "Money deposits",
        source: "balance-row"
      })
    ]);
  });
});
