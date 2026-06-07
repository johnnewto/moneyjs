import { describe, expect, it } from "vitest";

import {
  formatModelInitialValueDisplay,
  lookupInitialValueByName,
  MODEL_INITIAL_VALUE_PLACEHOLDER
} from "../src/notebook/modelInitialValueDisplay";

describe("modelInitialValueDisplay", () => {
  it("shows --- when no initial value is defined", () => {
    expect(formatModelInitialValueDisplay(null)).toBe(MODEL_INITIAL_VALUE_PLACEHOLDER);
    expect(formatModelInitialValueDisplay({ valueText: "  " })).toBe(
      MODEL_INITIAL_VALUE_PLACEHOLDER
    );
  });

  it("shows stored initial value text", () => {
    expect(formatModelInitialValueDisplay({ valueText: "100" })).toBe("100");
  });

  it("looks up initial values by variable name", () => {
    const match = lookupInitialValueByName(
      [
        { id: "init-1", name: "Hh", valueText: "80" },
        { id: "comment-1", text: "section", kind: "comment" }
      ],
      "Hh"
    );

    expect(match?.valueText).toBe("80");
    expect(lookupInitialValueByName([], "Hh")).toBeNull();
  });
});
