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
        model: ModelDefinition;
        baseline: SimulationResult;
        scenario: ScenarioDefinition;
        options: SimulationOptions;
      };
    }
  | {
      id: string;
      type: "validateModel";
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
      type: "progress";
      payload: { period: number; totalPeriods: number };
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
