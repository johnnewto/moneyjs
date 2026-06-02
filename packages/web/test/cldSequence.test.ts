import { describe, expect, it } from "vitest";

import { buildCldFromEditor } from "../src/notebook/cld";

describe("buildCldFromEditor", () => {
  it("builds signed links from notebook equation rows", () => {
    const result = buildCldFromEditor({
      equations: [
        { id: "eq-k", name: "K", expression: "lag(K) + I - AF" },
        { id: "eq-af", name: "AF", expression: "delta * lag(K)" },
        { id: "eq-y", name: "Y", expression: "lag(K) / kappa" },
        { id: "eq-p", name: "P", expression: "Y - WB - AF - rL * lag(L)" },
        { id: "eq-i", name: "I", expression: "gamma0 + gamma1 * P" },
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
    expect(result.loops.some((loop) => loop.polarity === "R")).toBe(true);
    expect(result.loops.some((loop) => loop.polarity === "B")).toBe(true);
  });
});
