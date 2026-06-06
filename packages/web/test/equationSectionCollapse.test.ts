import { describe, expect, it } from "vitest";

import {
  collectCollapsibleSectionCommentIds,
  isEquationRowHiddenBySectionCollapse,
  sectionCommentHasEquations
} from "../src/notebook/equationSectionCollapse";

describe("equation section collapse", () => {
  const equations = [
    { id: "c1", kind: "comment" as const, text: "Household credit" },
    { id: "eq-1", name: "Lhd", expression: "1" },
    { id: "eq-2", name: "nl", expression: "2" },
    { id: "c2", kind: "comment" as const, text: "Production Firms" },
    { id: "eq-3", name: "Y", expression: "3" }
  ];

  it("detects whether a section comment has following equations", () => {
    expect(sectionCommentHasEquations(equations, 0)).toBe(true);
    expect(sectionCommentHasEquations(equations, 3)).toBe(true);
    expect(sectionCommentHasEquations([equations[3]], 0)).toBe(false);
  });

  it("collects collapsible section comments that have boundary signatures", () => {
    const boundaries = new Map([
      ["c1", { functionName: "Household_credit", inputs: ["P"], outputs: ["Lhd"] }],
      ["c2", { functionName: "Production_Firms", inputs: ["Cs"], outputs: ["Y"] }]
    ]);

    expect(collectCollapsibleSectionCommentIds(equations, boundaries)).toEqual(["c1", "c2"]);
    expect(collectCollapsibleSectionCommentIds(equations, new Map())).toEqual([]);
  });

  it("hides equation rows under a collapsed section comment", () => {
    const collapsed = new Set(["c1"]);
    expect(isEquationRowHiddenBySectionCollapse(equations, collapsed, 1)).toBe(true);
    expect(isEquationRowHiddenBySectionCollapse(equations, collapsed, 2)).toBe(true);
    expect(isEquationRowHiddenBySectionCollapse(equations, collapsed, 4)).toBe(false);
    expect(isEquationRowHiddenBySectionCollapse(equations, new Set(), 1)).toBe(false);
  });
});
