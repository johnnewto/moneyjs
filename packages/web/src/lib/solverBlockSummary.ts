import type { EquationBlock } from "@sfcr/core";

export interface SolverBlockSummary {
  totalBlocks: number;
  cyclicBlockCount: number;
  ariaLabel: string;
  tooltip: string;
}

export function summarizeSolverBlocks(blocks: EquationBlock[]): SolverBlockSummary | null {
  if (blocks.length === 0) {
    return null;
  }

  const cyclicBlockCount = blocks.filter((block) => block.cyclic).length;
  const blockWord = blocks.length === 1 ? "block" : "blocks";
  const ariaLabel =
    cyclicBlockCount > 0
      ? `${blocks.length} ${blockWord}, ${cyclicBlockCount} cyclic`
      : `${blocks.length} ${blockWord}`;

  const tooltip = blocks
    .map((block) => {
      const equations = block.equationNames.join(", ");
      return block.cyclic ? `Block ${block.id}: ${equations} (cyclic)` : `Block ${block.id}: ${equations}`;
    })
    .join("\n");

  return {
    totalBlocks: blocks.length,
    cyclicBlockCount,
    ariaLabel,
    tooltip
  };
}
