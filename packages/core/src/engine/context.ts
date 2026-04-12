export interface SolverContext {
  currentValue(variable: string): number;
  lagValue(variable: string): number;
  diffValue(variable: string): number;
  setCurrentValue(variable: string, value: number): void;
  hasSeries(variable: string): boolean;
}
