import { afterEach, describe, expect, it, vi } from "vitest";
import { clampFixedMenuPosition } from "../src/lib/clampFixedMenuPosition";

describe("clampFixedMenuPosition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the menu inside the viewport with padding", () => {
    vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 });

    expect(clampFixedMenuPosition(400, 300, 160, 200)).toEqual({ x: 400, y: 300 });
    expect(clampFixedMenuPosition(760, 520, 160, 200)).toEqual({ x: 632, y: 392 });
    expect(clampFixedMenuPosition(0, 0, 160, 200)).toEqual({ x: 8, y: 8 });
  });

  it("clamps menus taller than the viewport to the top padding", () => {
    vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 });

    expect(clampFixedMenuPosition(100, 500, 160, 700)).toEqual({ x: 100, y: 8 });
  });
});
