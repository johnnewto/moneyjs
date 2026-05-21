import type {
  ModelDefinition,
  ScenarioDefinition,
  SimulationOptions,
  SimulationResult
} from "@sfcr/core";

export type WorkerRequest =
  | {
      id: string;
      type: "runBaseline";
      payload: { model: ModelDefinition; options: SimulationOptions };
    }
  | {
      id: string;
      type: "runScenario";
      payload: {
        baseline: SimulationResult;
        scenario: ScenarioDefinition;
        options: SimulationOptions;
      };
    }
  | {
      id: string;
      /** Shortened baseline via @sfcr/core validateRunnable (not a full simulation). */
      type: "validateRunnable";
      payload: { model: ModelDefinition; options: SimulationOptions };
    };

export type WorkerResponse =
  | {
      id: string;
      type: "success";
      payload: SimulationResult;
    }
  | {
      id: string;
      type: "validationSuccess";
    }
  | {
      id: string;
      type: "error";
      payload: {
        name: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };
