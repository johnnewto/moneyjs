import { parseEquation } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import { explainEquationExpression } from "../src/lib/equationExplanation";

describe("equation explanation", () => {
  it("verbalizes lagged rate times lagged stock as an interest term", () => {
    const parsed = parseEquation("Fh", "WBs + rm[-1] * Mh[-1]");

    const explanation = explainEquationExpression(
      "Fh",
      parsed.sourceExpression,
      new Map([
        ["Fh", "Household income"],
        ["WBs", "wage bill"],
        ["rm", "rate of interest on bank deposits"],
        ["Mh", "bank deposits held by households"]
      ])
    );

    expect(explanation).toContain("Household income equals");
    expect(explanation).toContain("wage bill plus");
    expect(explanation).toContain("interest on last period's bank deposits held by households");
    expect(explanation).toContain(
      "last period's rate of interest on bank deposits multiplied by last period's bank deposits held by households"
    );
  });
});
