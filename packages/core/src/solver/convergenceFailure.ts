import type { EquationBlock } from "../graph/blocks";
import { ConvergenceError, type ConvergenceFailureDetails, type ConvergenceVariableDiagnostic } from "../model/schema";
import type { SolverRunOptions } from "./types";

export type { ConvergenceFailureDetails, ConvergenceVariableDiagnostic };

const MAX_WORST_VARIABLES = 8;

export function throwConvergenceError(args: {
  solverMethod: string;
  period: number;
  block: EquationBlock;
  options: SolverRunOptions;
  iterationsUsed: number;
  variables: ConvergenceVariableDiagnostic[];
}): never {
  const details = buildConvergenceFailureDetails(args);
  throw new ConvergenceError(formatConvergenceFailureMessage(details), details);
}

export function buildConvergenceFailureDetails(args: {
  solverMethod: string;
  period: number;
  block: EquationBlock;
  options: SolverRunOptions;
  iterationsUsed: number;
  variables: ConvergenceVariableDiagnostic[];
}): ConvergenceFailureDetails {
  const nonFiniteVariables = args.variables.filter((entry) => !entry.finite).map((entry) => entry.name);
  const worstVariables = [...args.variables]
    .sort((left, right) => convergenceScore(right) - convergenceScore(left))
    .slice(0, MAX_WORST_VARIABLES)
    .map((entry) => ({
      name: entry.name,
      value: entry.value,
      ...(entry.relativeChange !== undefined ? { relativeChange: entry.relativeChange } : {}),
      ...(entry.residual !== undefined ? { residual: entry.residual } : {})
    }));

  return {
    period: args.period,
    blockId: args.block.id,
    blockVariables: args.block.equationNames,
    solverMethod: args.solverMethod,
    tolerance: args.options.tolerance,
    maxIterations: args.options.maxIterations,
    iterationsUsed: args.iterationsUsed,
    variables: args.variables,
    nonFiniteVariables,
    worstVariables
  };
}

export function formatConvergenceFailureMessage(details: ConvergenceFailureDetails): string {
  const variableSummary =
    details.blockVariables.length <= 6
      ? details.blockVariables.join(", ")
      : `${details.blockVariables.length} variables (${details.blockVariables.slice(0, 5).join(", ")}, …)`;

  const lines = [
    `${details.solverMethod} failed to converge at period ${details.period}, block ${details.blockId} (${variableSummary}).`,
    `Reached ${details.iterationsUsed} iteration${details.iterationsUsed === 1 ? "" : "s"} without meeting tolerance ${formatNumber(details.tolerance)} (max ${details.maxIterations}).`
  ];

  if (details.nonFiniteVariables.length > 0) {
    lines.push(
      `Non-finite values for: ${details.nonFiniteVariables.join(", ")}. Check initial values and equations for division by zero or other invalid operations.`
    );
  }

  if (details.worstVariables.length > 0) {
    lines.push("Slowest to converge:");
    for (const entry of details.worstVariables) {
      const parts = [`${entry.name}=${formatNumber(entry.value)}`];
      if (entry.relativeChange !== undefined) {
        parts.push(`relative change ${formatNumber(entry.relativeChange)}`);
      }
      if (entry.residual !== undefined) {
        parts.push(`residual ${formatNumber(entry.residual)}`);
      }
      lines.push(`  ${parts.join(", ")}`);
    }
  }

  if (details.nonFiniteVariables.length === 0) {
    lines.push(
      "Try adjusting initial values, increasing max iterations, relaxing tolerance, or switching solver method."
    );
  }

  return lines.join("\n");
}

function convergenceScore(entry: ConvergenceVariableDiagnostic): number {
  if (!entry.finite) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(entry.relativeChange ?? 0, entry.residual ?? 0);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1e4 || absolute < 1e-4)) {
    return value.toExponential(3);
  }
  return value.toPrecision(6).replace(/\.?0+$/, "");
}
