import { describe, expect, it } from "vitest";

import { canonicalVariableName, variableMatchesHighlight } from "../src/lib/variableHighlight";

describe("variableHighlight", () => {
  it("matches exact variable names", () => {
    expect(variableMatchesHighlight("Y", "Y")).toBe(true);
    expect(variableMatchesHighlight("Y", "Cd")).toBe(false);
  });

  it("matches lag bracket references to the base variable", () => {
    expect(variableMatchesHighlight("Y[-1]", "Y")).toBe(true);
    expect(variableMatchesHighlight("Ms[-1]", "Ms")).toBe(true);
    expect(canonicalVariableName("Y[-1]")).toBe("Y");
  });

  it("matches prime lag references to the base variable", () => {
    expect(variableMatchesHighlight("Y'", "Y")).toBe(true);
    expect(variableMatchesHighlight("Ms'", "Ms")).toBe(true);
    expect(canonicalVariableName("Y'")).toBe("Y");
  });

  it("matches derivative balance equation names to the stock variable", () => {
    expect(variableMatchesHighlight("d(Mh)", "Mh")).toBe(true);
  });

  it("returns false when no variable is highlighted", () => {
    expect(variableMatchesHighlight("Y", null)).toBe(false);
    expect(variableMatchesHighlight("Y", "")).toBe(false);
  });
});
