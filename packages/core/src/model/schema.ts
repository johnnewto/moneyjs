import type { SimulationResult } from "../result/result";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly equationName?: string,
    public readonly source?: string
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export interface ConvergenceVariableDiagnostic {
  name: string;
  value: number;
  previous?: number;
  relativeChange?: number;
  residual?: number;
  finite: boolean;
}

export interface ConvergenceFailureDetails {
  period: number;
  blockId: number;
  blockVariables: string[];
  solverMethod: string;
  tolerance: number;
  maxIterations: number;
  iterationsUsed: number;
  variables: ConvergenceVariableDiagnostic[];
  nonFiniteVariables: string[];
  worstVariables: Array<{
    name: string;
    value: number;
    relativeChange?: number;
    residual?: number;
  }>;
}

export class ConvergenceError extends Error {
  constructor(
    message: string,
    public readonly details: ConvergenceFailureDetails,
    public readonly partialResult?: SimulationResult
  ) {
    super(message);
    this.name = "ConvergenceError";
  }
}

export class ModelValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ModelValidationError";
  }
}
