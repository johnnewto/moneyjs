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

export class ConvergenceError extends Error {
  constructor(
    message: string,
    public readonly period: number,
    public readonly blockId: number
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
