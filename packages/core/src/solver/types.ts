import type { SolverContext } from "../engine/context";
import type { EquationBlock } from "../graph/blocks";
import type { ParsedEquation } from "../parser/parse";

export interface SolverRunOptions {
  tolerance: number;
  maxIterations: number;
}

export interface BlockSolver {
  solveBlock(
    period: number,
    block: EquationBlock,
    equationsByName: Map<string, ParsedEquation>,
    context: SolverContext,
    options: SolverRunOptions
  ): void;
}
