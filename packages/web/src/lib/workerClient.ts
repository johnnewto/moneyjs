import type {
  ModelDefinition,
  ScenarioDefinition,
  SimulationOptions,
  SimulationResult
} from "@sfcr/core";
import type { WorkerRequest, WorkerResponse } from "@sfcr/core-worker";

export interface SolverClient {
  runBaseline(model: ModelDefinition, options: SimulationOptions): Promise<SimulationResult>;
  runScenario(
    model: ModelDefinition,
    baseline: SimulationResult,
    scenario: ScenarioDefinition,
    options: SimulationOptions
  ): Promise<SimulationResult>;
  validateModel(model: ModelDefinition, options: SimulationOptions): Promise<void>;
  dispose(): void;
}

type PendingRequest =
  | {
      type: "success";
      resolve: (result: SimulationResult) => void;
      reject: (error: Error) => void;
    }
  | {
      type: "validationSuccess";
      resolve: () => void;
      reject: (error: Error) => void;
    };

class BrowserWorkerClient implements SolverClient {
  private readonly pending = new Map<string, PendingRequest>();
  private worker: Worker | null = null;

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
      type: "module"
    });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      if (response.type === "error") {
        this.pending.delete(response.id);
        pending.reject(new Error(response.payload.message));
        return;
      }

      if (response.type === "progress") {
        return;
      }

      this.pending.delete(response.id);

      if (response.type === "success" && pending.type === "success") {
        pending.resolve(response.payload);
        return;
      }

      if (response.type === "validationSuccess" && pending.type === "validationSuccess") {
        pending.resolve();
      }
    };

    this.worker = worker;
    return worker;
  }

  async runBaseline(model: ModelDefinition, options: SimulationOptions): Promise<SimulationResult> {
    return this.request({
      type: "runBaseline",
      payload: { model, options }
    });
  }

  async runScenario(
    model: ModelDefinition,
    baseline: SimulationResult,
    scenario: ScenarioDefinition,
    options: SimulationOptions
  ): Promise<SimulationResult> {
    return this.request({
      type: "runScenario",
      payload: { model, baseline, scenario, options }
    });
  }

  async validateModel(model: ModelDefinition, options: SimulationOptions): Promise<void> {
    return this.requestVoid({
      type: "validateModel",
      payload: { model, options }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  private request(
    message: Omit<Extract<WorkerRequest, { type: "runBaseline" | "runScenario" }>, "id">
  ): Promise<SimulationResult> {
    const id = crypto.randomUUID();
    return new Promise<SimulationResult>((resolve, reject) => {
      this.pending.set(id, { type: "success", resolve, reject });
      this.ensureWorker().postMessage({ id, ...message });
    });
  }

  private requestVoid(
    message: Omit<Extract<WorkerRequest, { type: "validateModel" }>, "id">
  ): Promise<void> {
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { type: "validationSuccess", resolve, reject });
      this.ensureWorker().postMessage({ id, ...message });
    });
  }
}

export function createWorkerClient(): SolverClient {
  return new BrowserWorkerClient();
}

export type { WorkerRequest, WorkerResponse };
