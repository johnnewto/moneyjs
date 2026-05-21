import type { ModelDefinition, SimulationOptions } from "../model/types";
import { runBaseline } from "./runBaseline";

/** Periods used for worker/UI validation (capped for responsiveness). */
export const VALIDATION_MAX_PERIODS = 5;

/**
 * Runs a shortened baseline simulation to catch parse and solver-time errors.
 * Uses at most {@link VALIDATION_MAX_PERIODS} periods (never fewer than 2).
 */
export function validateRunnable(model: ModelDefinition, options: SimulationOptions): void {
  const periods = Math.max(2, Math.min(options.periods, VALIDATION_MAX_PERIODS));
  runBaseline(model, { ...options, periods });
}
