import type { EquationRole } from "../parser/analyze";
import type { MatrixColumnSumLocations } from "../parser/dependencies";

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
  observed?: Record<string, number[]>;
  /** Maps sum(columnRef) keys to matrix cell expression strings summed at runtime. */
  matrixColumnSums?: Record<string, string[]>;
  /** Row/column labels parallel to each matrixColumnSums entry (same order). */
  matrixColumnSumLocations?: MatrixColumnSumLocations;
}

export type SimulationType = "DYNAMIC" | "STATIC";

export interface SimulationOptions {
  periods: number;
  solverMethod: SolverMethod;
  tolerance: number;
  maxIterations: number;
  defaultInitialValue?: number;
  simType?: SimulationType;
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
