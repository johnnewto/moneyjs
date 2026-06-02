import { describe, expect, it } from "vitest";

import { buildCldFromEditor } from "../src/notebook/cld";

describe("buildCldFromEditor", () => {
  it("builds signed links from notebook equation rows", () => {
    const result = buildCldFromEditor({
      equations: [
        { id: "eq-k", name: "K", expression: "lag(K) + I - AF", unitMeta: { stockFlow: "stock" } },
        { id: "eq-af", name: "AF", expression: "delta * lag(K)" },
        { id: "eq-y", name: "Y", expression: "lag(K) / kappa", unitMeta: { stockFlow: "flow" } },
        { id: "eq-p", name: "P", expression: "Y - WB - AF - rL * lag(L)" },
        { id: "eq-i", name: "I", expression: "gamma0 + gamma1 * P", unitMeta: { stockFlow: "aux" } },
        { id: "eq-l", name: "L", expression: "lag(L) + I - P" }
      ]
    });

    expect(result.errors).toEqual([]);
    expect(result.links).toEqual(
      expect.arrayContaining([
        { from: "I", to: "K", polarity: "+", lagged: false },
        { from: "P", to: "I", polarity: "+", lagged: false },
        { from: "K", to: "AF", polarity: "+", lagged: true }
      ])
    );
    expect(result.mermaid).toContain("I -->|+| K");
    expect(result.mermaid).toContain("K[K]");
    expect(result.mermaid).toContain("Y(Y)");
    expect(result.mermaid).toContain("I(I)");
    expect(result.loops.some((loop) => loop.polarity === "R")).toBe(true);
    expect(result.loops.some((loop) => loop.polarity === "B")).toBe(true);
  });

  it("expands sum(column) refs using linked account-transactions matrices", () => {
    const result = buildCldFromEditor(
      {
        equations: [
          { id: "eq-a", name: "A", expression: "1" },
          { id: "eq-b", name: "B", expression: "1" },
          { id: "eq-y", name: "Y", expression: "sum(Households.Deposits)" }
        ]
      },
      {
        modelId: "m1",
        notebookCells: [
          {
            type: "run",
            id: "run-1",
            title: "run",
            metadata: { version: 1 },
            mode: "baseline",
            sourceModelId: "m1",
            periods: 5,
            resultKey: "r"
          },
          {
            type: "matrix",
            id: "mx-1",
            title: "Account transactions",
            metadata: { version: 1 },
            accountingKind: "account-transactions",
            sourceRunCellId: "run-1",
            columns: ["Households.Deposits", "Sum"],
            sectors: ["", ""],
            rows: [
              { label: "Row 1", values: ["+A", "0"] },
              { label: "Row 2", values: ["-B", "0"] },
              { label: "Sum", values: ["0", "0"] }
            ]
          }
        ]
      }
    );

    expect(result.errors).toEqual([]);
    expect(result.links).toEqual(
      expect.arrayContaining([
        { from: "A", to: "Y", polarity: "+", lagged: false },
        { from: "B", to: "Y", polarity: "-", lagged: false }
      ])
    );
  });
});
