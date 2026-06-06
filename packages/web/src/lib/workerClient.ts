import type {
  ModelDefinition,
  ScenarioDefinition,
  SimulationOptions,
  SimulationResult,
  StabilityAnalysis
} from "@sfcr/core";
import type { WorkerRequest, WorkerResponse } from "@sfcr/core-worker";

export interface SolverClient {
  runBaseline(model: ModelDefinition, options: SimulationOptions): Promise<SimulationResult>;
  runScenario(
    baseline: SimulationResult,
    scenario: ScenarioDefinition,
    options: SimulationOptions
  ): Promise<SimulationResult>;
  validateRunnable(model: ModelDefinition, options: SimulationOptions): Promise<void>;
  computeStabilityMetrics(result: SimulationResult, period: number): Promise<StabilityAnalysis>;
  dispose(): void;
}

type PendingRequest =
  | {
      type: "success";
      resolve: (result: SimulationResult) => void;
      reject: (error: Error) => void;
    }
  | {
      type: "stabilitySuccess";
      resolve: (analysis: StabilityAnalysis) => void;
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
        const error = new Error(response.payload.message);
        error.name = response.payload.name;
        if (response.payload.details) {
          Object.assign(error, { details: response.payload.details });
        }
        pending.reject(error);
        return;
      }

      this.pending.delete(response.id);

      if (response.type === "success" && pending.type === "success") {
        pending.resolve(response.payload);
        return;
      }

      if (response.type === "stabilitySuccess" && pending.type === "stabilitySuccess") {
        pending.resolve(response.payload);
        return;
      }

      if (response.type === "validationSuccess" && pending.type === "validationSuccess") {
        pending.resolve();
        return;
      }

      pending.reject(
        new Error(`Unexpected worker response type "${response.type}" for pending "${pending.type}" request.`)
      );
    };
    worker.onerror = () => {
      this.rejectAll(new Error("Solver worker failed."));
      this.worker = null;
    };
    worker.onmessageerror = () => {
      this.rejectAll(new Error("Solver worker sent an unreadable response."));
      this.worker = null;
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
    baseline: SimulationResult,
    scenario: ScenarioDefinition,
    options: SimulationOptions
  ): Promise<SimulationResult> {
    return this.request({
      type: "runScenario",
      payload: { baseline, scenario, options }
    });
  }

  async validateRunnable(model: ModelDefinition, options: SimulationOptions): Promise<void> {
    return this.requestVoid({
      type: "validateRunnable",
      payload: { model, options }
    });
  }

  async computeStabilityMetrics(
    result: SimulationResult,
    period: number
  ): Promise<StabilityAnalysis> {
    return this.requestStability({
      type: "computeStabilityMetrics",
      payload: { result, period }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error("Solver worker was disposed before the request completed."));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
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
    message: Omit<Extract<WorkerRequest, { type: "validateRunnable" }>, "id">
  ): Promise<void> {
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { type: "validationSuccess", resolve, reject });
      this.ensureWorker().postMessage({ id, ...message });
    });
  }

  private requestStability(
    message: Omit<Extract<WorkerRequest, { type: "computeStabilityMetrics" }>, "id">
  ): Promise<StabilityAnalysis> {
    const id = crypto.randomUUID();
    return new Promise<StabilityAnalysis>((resolve, reject) => {
      this.pending.set(id, { type: "stabilitySuccess", resolve, reject });
      this.ensureWorker().postMessage({ id, ...message });
    });
  }
}

export function createWorkerClient(): SolverClient {
  return new BrowserWorkerClient();
}

export type { WorkerRequest, WorkerResponse };
