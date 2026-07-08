import type { SimulationResult } from "@sfcr/core";

import { isBareVariableName } from "./chartSeries";
import { buildMatrixEntryTimeSeries } from "./matrixSliceGraph";

export function isTableVariableExpression(source: string): boolean {
  return !isBareVariableName(source);
}

export function resolveTableVariableTimeSeries(
  source: string,
  result: SimulationResult
): number[] {
  return buildMatrixEntryTimeSeries(source.trim(), result);
}
