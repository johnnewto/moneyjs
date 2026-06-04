import { describe, expect, it } from "vitest";

import { resolveStoredOrDerivedDescription } from "../src/lib/resolveRowDescription";

describe("resolveStoredOrDerivedDescription", () => {
  it("returns stored description when present", () => {
    const descriptions = new Map([["Y", "Income"]]);

    expect(resolveStoredOrDerivedDescription("Household wealth", "Hh", descriptions)).toBe(
      "Household wealth"
    );
  });

  it("falls back to catalog description when stored description is empty", () => {
    const descriptions = new Map([["Hh", "Household wealth"]]);

    expect(resolveStoredOrDerivedDescription("", "Hh", descriptions)).toBe("Household wealth");
    expect(resolveStoredOrDerivedDescription(undefined, "Hh", descriptions)).toBe("Household wealth");
  });

  it("returns empty string when neither stored nor derived description exists", () => {
    expect(resolveStoredOrDerivedDescription("", "Hh", new Map())).toBe("");
  });
});
