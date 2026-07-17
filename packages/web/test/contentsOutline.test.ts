import { describe, expect, it } from "vitest";

import { resolveContentsOutlineLevel } from "../src/notebook/contentsOutline";

describe("resolveContentsOutlineLevel", () => {
  it("keeps markdown cells at the top level", () => {
    expect(resolveContentsOutlineLevel({ type: "markdown" })).toBe(0);
  });

  it("nests non-markdown cells", () => {
    expect(resolveContentsOutlineLevel({ type: "matrix" })).toBe(1);
    expect(resolveContentsOutlineLevel({ type: "run" })).toBe(1);
    expect(resolveContentsOutlineLevel({ type: "chart" })).toBe(1);
    expect(resolveContentsOutlineLevel({ type: "equations" })).toBe(1);
  });
});
