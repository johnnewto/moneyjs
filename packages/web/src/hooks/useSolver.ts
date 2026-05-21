import { useEffect, useState } from "react";

import type {
  ModelDefinition,
  ScenarioDefinition,
  SimulationOptions,
  SimulationResult
} from "@sfcr/core";

import { createWorkerClient } from "../lib/workerClient";

export interface UseSolverState {
  status: "idle" | "validating" | "running" | "success" | "error";
  result: SimulationResult | null;
  error: Error | null;
}

export interface UseSolverApi extends UseSolverState {
  runBaseline(model: ModelDefinition, options: SimulationOptions): Promise<SimulationResult>;
  runScenario(
    baseline: SimulationResult,
    scenario: ScenarioDefinition,
    options: SimulationOptions
  ): Promise<SimulationResult>;
  validate(model: ModelDefinition, options: SimulationOptions): Promise<void>;
}

export function useSolver(): UseSolverApi {
  const [client] = useState(() => createWorkerClient());
  const [state, setState] = useState<UseSolverState>({
    status: "idle",
    result: null,
    error: null
  });

  useEffect(() => () => client.dispose(), [client]);

  return {
    ...state,
    async runBaseline(model, options) {
      setState((current) => ({ ...current, status: "running", error: null }));
      try {
        const result = await client.runBaseline(model, options);
        setState({ status: "success", result, error: null });
        return result;
      } catch (error) {
        setState({
          status: "error",
          result: null,
          error: error instanceof Error ? error : new Error("Unknown error")
        });
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    async runScenario(baseline, scenario, options) {
      setState((current) => ({ ...current, status: "running", error: null }));
      try {
        const result = await client.runScenario(baseline, scenario, options);
        setState({ status: "success", result, error: null });
        return result;
      } catch (error) {
        setState({
          status: "error",
          result: null,
          error: error instanceof Error ? error : new Error("Unknown error")
        });
        throw error instanceof Error ? error : new Error("Unknown error");
      }
    },
    async validate(model, options) {
      setState((current) => ({ ...current, status: "validating", error: null }));
      try {
        await client.validateRunnable(model, options);
        setState((current) => ({ ...current, status: "idle", error: null }));
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error("Unknown error");
        setState((current) => ({
          ...current,
          status: "error",
          error: nextError
        }));
        throw nextError;
      }
    }
  };
}
