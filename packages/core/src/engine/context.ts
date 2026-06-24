import type { MatrixColumnSumBindings, MatrixColumnSumLocations } from "../parser/dependencies";

export interface SolverContext {
  currentValue(variable: string): number;
  lagValue(variable: string, offset?: number): number;
  diffValue(variable: string): number;
  setCurrentValue(variable: string, value: number): void;
  hasSeries(variable: string): boolean;
  shifted?(offset: number): SolverContext;
  evaluateMatrixColumnSum?(columnRef: string): number;
  matrixColumnSums?: MatrixColumnSumBindings;
  matrixColumnSumLocations?: MatrixColumnSumLocations;
}
