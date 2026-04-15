import type { EquationRole } from "../parser/analyze";

export type SolverMethod = "GAUSS_SEIDEL" | "BROYDEN" | "NEWTON";

export interface EquationDef {
  name: string;
  expression: string;
  role?: EquationRole;
}

export type ExternalDef =
  | { kind: "constant"; value: number }
  | { kind: "series"; values: number[] };

export interface HiddenEquationDef {
  leftVariable: string;
  rightVariable: string;
  tolerance: number;
  relative?: boolean;
}

export interface ModelDefinition {
  equations: EquationDef[];
  externals: Record<string, ExternalDef>;
  initialValues: Record<string, number>;
}

export interface SimulationOptions {
  periods: number;
  solverMethod: SolverMethod;
  tolerance: number;
  maxIterations: number;
  defaultInitialValue?: number;
  hiddenEquation?: HiddenEquationDef;
}

export type ShockVariableDef =
  | { kind: "constant"; value: number }
  | { kind: "series"; values: number[] };

export interface ShockDef {
  startPeriodInclusive: number;
  endPeriodInclusive: number;
  variables: Record<string, ShockVariableDef>;
}

export interface ScenarioDefinition {
  shocks: ShockDef[];
}
