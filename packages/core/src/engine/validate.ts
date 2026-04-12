import type { ModelDefinition, ShockDef, SimulationOptions } from "../model/types";
import type { SimulationResult } from "../result/result";
import { ModelValidationError } from "../model/schema";

export function validateModel(model: ModelDefinition): void {
  if (model.equations.length === 0) {
    throw new ModelValidationError("Model must contain at least one equation", "equations");
  }

  const names = new Set<string>();
  for (const equation of model.equations) {
    if (names.has(equation.name)) {
      throw new ModelValidationError(`Duplicate equation name: ${equation.name}`, equation.name);
    }
    names.add(equation.name);
  }
}

export function validateOptions(options: SimulationOptions): void {
  if (options.periods < 2) {
    throw new ModelValidationError("periods must be at least 2", "periods");
  }
  if (options.maxIterations < 1) {
    throw new ModelValidationError("maxIterations must be positive", "maxIterations");
  }
  if (options.tolerance <= 0) {
    throw new ModelValidationError("tolerance must be positive", "tolerance");
  }
  if (options.hiddenEquation && options.hiddenEquation.tolerance <= 0) {
    throw new ModelValidationError(
      "hiddenEquation tolerance must be positive",
      "hiddenEquation.tolerance"
    );
  }
}

export function validateShock(model: ModelDefinition, shock: ShockDef, periods: number): void {
  if (shock.startPeriodInclusive < 1) {
    throw new ModelValidationError("Shock start period must be at least 1", "shock.startPeriodInclusive");
  }
  if (shock.endPeriodInclusive > periods) {
    throw new ModelValidationError("Shock end period must be <= scenario periods", "shock.endPeriodInclusive");
  }
  if (shock.endPeriodInclusive < shock.startPeriodInclusive) {
    throw new ModelValidationError(
      "Shock end period must be >= start period",
      "shock.endPeriodInclusive"
    );
  }

  for (const variable of Object.keys(shock.variables)) {
    if (!(variable in model.externals)) {
      throw new ModelValidationError(
        `Shocked variable is not an external variable: ${variable}`,
        variable
      );
    }
  }
}

export function validateHiddenEquation(result: SimulationResult): void {
  const hidden = result.options.hiddenEquation;
  if (!hidden) {
    return;
  }

  const left = result.series[hidden.leftVariable];
  const right = result.series[hidden.rightVariable];
  if (!left || !right) {
    throw new ModelValidationError("Hidden equation variables must exist in the model");
  }

  for (let period = 0; period < result.options.periods; period += 1) {
    const discrepancy = Math.abs((left[period] ?? 0) - (right[period] ?? 0));
    const valid = hidden.relative
      ? discrepancy / (Math.abs(left[period] ?? 0) + 1e-15) < hidden.tolerance
      : discrepancy < hidden.tolerance;

    if (!valid) {
      throw new ModelValidationError(
        `Hidden equation is not fulfilled at period ${period + 1} for ${hidden.leftVariable} and ${hidden.rightVariable}`
      );
    }
  }
}
