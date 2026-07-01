import { describe, expect, it } from "vitest";

import type { EquationBlock } from "@sfcr/core";

import { summarizeSolverBlocks } from "../src/lib/solverBlockSummary";

describe("summarizeSolverBlocks", () => {
  it("returns null for an empty block list", () => {
    expect(summarizeSolverBlocks([])).toBeNull();
  });

  it("summarizes acyclic-only models", () => {
    const blocks: EquationBlock[] = [
      { id: 0, equationNames: ["a"], cyclic: false },
      { id: 1, equationNames: ["b"], cyclic: false }
    ];

    expect(summarizeSolverBlocks(blocks)).toEqual({
      totalBlocks: 2,
      cyclicBlockCount: 0,
      ariaLabel: "2 blocks",
      tooltip: "Block 0: a\nBlock 1: b"
    });
  });

  it("includes cyclic block counts and tooltip markers", () => {
    const blocks: EquationBlock[] = [
      { id: 0, equationNames: ["a"], cyclic: false },
      { id: 1, equationNames: ["c", "d"], cyclic: true },
      { id: 2, equationNames: ["e"], cyclic: false }
    ];

    expect(summarizeSolverBlocks(blocks)).toEqual({
      totalBlocks: 3,
      cyclicBlockCount: 1,
      ariaLabel: "3 blocks, 1 cyclic",
      tooltip: "Block 0: a\nBlock 1: c, d (cyclic)\nBlock 2: e"
    });
  });
});
