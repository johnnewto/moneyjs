import { describe, expect, it } from "vitest";

import {
  cycleMatrixEntryDisplayMode,
  formatMatrixEntryDisplayMode
} from "../src/notebook/matrixEntryDisplay";

describe("matrixEntryDisplay", () => {
  it("cycles equation → value → both → equation", () => {
    expect(cycleMatrixEntryDisplayMode("equation")).toBe("value");
    expect(cycleMatrixEntryDisplayMode("value")).toBe("both");
    expect(cycleMatrixEntryDisplayMode("both")).toBe("equation");
  });

  it("formats display mode labels", () => {
    expect(formatMatrixEntryDisplayMode("equation")).toBe("Equation");
    expect(formatMatrixEntryDisplayMode("value")).toBe("Value");
    expect(formatMatrixEntryDisplayMode("both")).toBe("Equation = value");
  });
});
