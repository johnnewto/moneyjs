import { describe, expect, it } from "vitest";

import { resolveVariableTooltip } from "../src/lib/unitMeta";

describe("resolveVariableTooltip", () => {
  it("shows lagged values for lagged variable references", () => {
    const tooltip = resolveVariableTooltip({
      name: "Cr",
      valueReference: "lagged",
      laggedCurrentValues: { Cr: 120 },
      laggedPeriodLabel: "period 4"
    });

    expect(tooltip).toBe("Cr' = 120 (period 4)");
  });

  it("shows current-period values for non-lagged references", () => {
    const tooltip = resolveVariableTooltip({
      name: "Cr",
      currentValues: { Cr: 150 }
    });

    expect(tooltip).toBe("Cr = 150");
  });
});
