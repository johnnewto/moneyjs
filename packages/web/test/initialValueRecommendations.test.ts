import { describe, expect, it } from "vitest";

import { isInitialValueEnabled } from "@sfcr/notebook-core";

import {
  applyInitialValueRecommendations,
  buildInitialValueRecommendations,
  formatInitialValueRecommendationMessage
} from "../src/notebook/initialValueRecommendations";
import type { MatrixCell, NotebookCell } from "../src/notebook/types";

describe("initialValueRecommendations", () => {
  it("recommends lagged, stock, denominator, and balance-sheet variables", () => {
    const equations = [
      { id: "eq-mh", name: "Mh", expression: "Mh' + (YD - Cd) * dt" },
      { id: "eq-y", name: "Y", expression: "C + G" },
      { id: "eq-l", name: "L", expression: "100" },
      { id: "eq-r", name: "R", expression: "interest / L" }
    ];
    const cells: NotebookCell[] = [
      {
        id: "balance-sheet",
        type: "matrix",
        title: "Balance sheet",
        accountingKind: "balance-sheet",
        columns: ["Households", "Banks", "Sum"],
        rows: [
          { label: "Deposits", values: ["+Mh", "-Mh", "0"] },
          { label: "Loans", values: ["", "+L", "0"] }
        ]
      } satisfies MatrixCell
    ];

    const summary = buildInitialValueRecommendations({ equations, cells });

    expect(summary.recommendedNames).toEqual(new Set(["L", "Mh"]));
    expect(summary.recommendations.find((entry) => entry.name === "Mh")?.reasons).toEqual(
      expect.arrayContaining(["lagged", "stock", "balance-sheet"])
    );
    expect(summary.recommendations.find((entry) => entry.name === "L")?.reasons).toEqual(
      expect.arrayContaining(["denominator", "balance-sheet"])
    );
    expect(summary.recommendedNames.has("Y")).toBe(false);
  });

  it("enables recommended rows, disables others, and adds missing rows", () => {
    const summary = buildInitialValueRecommendations({
      equations: [{ id: "eq-mh", name: "Mh", expression: "Mh' + YD - Cd" }]
    });

    const next = applyInitialValueRecommendations(
      [
        { id: "init-mh", name: "Mh", valueText: "80", enabled: false },
        { id: "init-y", name: "Y", valueText: "100" }
      ],
      summary.recommendedNames
    );

    expect(
      isInitialValueEnabled(next.find((row) => !("kind" in row) && row.name === "Mh")!)
    ).toBe(true);
    expect(isInitialValueEnabled(next.find((row) => !("kind" in row) && row.name === "Y")!)).toBe(
      false
    );
  });

  it("filters recommendations by selected checklist criteria", () => {
    const equations = [
      { id: "eq-mh", name: "Mh", expression: "Mh' + (YD - Cd) * dt" },
      { id: "eq-l", name: "L", expression: "100" },
      { id: "eq-r", name: "R", expression: "interest / L" }
    ];

    const summary = buildInitialValueRecommendations({
      equations,
      criteria: {
        lagged: true,
        stock: false,
        denominator: false,
        balanceSheet: false
      }
    });

    expect(summary.recommendedNames).toEqual(new Set(["Mh"]));
    expect(summary.recommendations[0]?.reasons).toEqual(["lagged"]);
  });

  it("formats a summary message from recommendation counts", () => {
    const message = formatInitialValueRecommendationMessage({
      recommendations: [
        { name: "Mh", reasons: ["lagged", "stock"] },
        { name: "L", reasons: ["denominator"] }
      ],
      recommendedNames: new Set(["Mh", "L"]),
      counts: {
        lagged: 1,
        stock: 1,
        denominator: 1,
        "balance-sheet": 0
      }
    });

    expect(message).toContain("Enabled 2 initial values");
    expect(message).toContain("1 lagged");
    expect(message).toContain("1 stock");
    expect(message).toContain("1 denominator");
  });
});
