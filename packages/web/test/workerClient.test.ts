import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelDefinition, SimulationOptions, SimulationResult } from "@sfcr/core";

import { createWorkerClient, type WorkerRequest, type WorkerResponse } from "../src/lib/workerClient";

const model: ModelDefinition = {
  equations: [{ name: "Y", expression: "Gd" }],
  externals: { Gd: { kind: "constant", value: 20 } },
  initialValues: {}
};

const options: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50,
  defaultInitialValue: 1e-15
};

const result: SimulationResult = {
  series: {
    Y: new Float64Array([0, 20, 20, 20, 20]),
    Gd: new Float64Array([20, 20, 20, 20, 20])
  },
  blocks: [],
  model,
  options
};

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: WorkerRequest[] = [];
  terminated = false;

  constructor(_url: URL, _options: WorkerOptions) {
    MockWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }

  emitError(): void {
    this.onerror?.({ message: "Worker failed" } as ErrorEvent);
  }
}

describe("worker client", () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
    vi.stubGlobal("crypto", { randomUUID: () => "test-id" } satisfies Pick<Crypto, "randomUUID">);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a baseline request and resolves the worker response", async () => {
    const client = createWorkerClient();
    const pending = client.runBaseline(model, options);

    const worker = MockWorker.instances[0];
    expect(worker).toBeDefined();
    expect(worker?.messages[0]).toMatchObject({
      id: "test-id",
      type: "runBaseline"
    });

    worker?.emit({
      id: "test-id",
      type: "success",
      payload: result
    });

    await expect(pending).resolves.toBe(result);
  });

  it("sends a stability request and resolves the worker response", async () => {
    const client = createWorkerClient();
    const pending = client.computeStabilityMetrics(result, 2);

    const worker = MockWorker.instances[0];
    expect(worker?.messages[0]).toMatchObject({
      id: "test-id",
      type: "computeStabilityMetrics",
      payload: { result, period: 2 }
    });

    worker?.emit({
      id: "test-id",
      type: "stabilitySuccess",
      payload: {
        period: 2,
        variables: ["y"],
        residual: [0],
        residualNorm: 0,
        A0: [[-1]],
        A1: [[0.8]],
        T: [[0.8]],
        eigenvalues: [{ re: 0.8, im: 0, abs: 0.8 }],
        spectralRadius: 0.8,
        classification: "stable",
        dominantMode: {
          eigenvalue: { re: 0.8, im: 0, abs: 0.8 },
          eigenpairResidualNorm: 0,
          eigenpairResidualRelative: 0,
          reliable: true,
          participation: [{ variable: "y", weight: 1 }]
        },
        nearUnitRootModes: []
      }
    });

    await expect(pending).resolves.toMatchObject({
      spectralRadius: 0.8,
      classification: "stable"
    });
  });

  it("resolves validation requests without payload", async () => {
    const client = createWorkerClient();
    const pending = client.validateRunnable(model, options);

    const worker = MockWorker.instances[0];
    expect(worker?.messages[0]).toMatchObject({
      id: "test-id",
      type: "validateRunnable"
    });

    worker?.emit({
      id: "test-id",
      type: "validationSuccess"
    });

    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects mismatched success responses for validation requests", async () => {
    const client = createWorkerClient();
    const pending = client.validateRunnable(model, options);

    MockWorker.instances[0]?.emit({
      id: "test-id",
      type: "success",
      payload: result
    });

    await expect(pending).rejects.toThrow(
      'Unexpected worker response type "success" for pending "validationSuccess" request.'
    );
  });

  it("rejects worker error responses", async () => {
    const client = createWorkerClient();
    const pending = client.runBaseline(model, options);

    const worker = MockWorker.instances[0];
    worker?.emit({
      id: "test-id",
      type: "error",
      payload: {
        name: "ModelValidationError",
        message: "Broken model"
      }
    });

    await expect(pending).rejects.toThrow("Broken model");
  });

  it("rejects pending requests when the worker fails", async () => {
    const client = createWorkerClient();
    const pending = client.runBaseline(model, options);

    MockWorker.instances[0]?.emitError();

    await expect(pending).rejects.toThrow("Solver worker failed.");
  });

  it("terminates the worker and rejects pending requests on dispose", async () => {
    const client = createWorkerClient();
    const pending = client.runBaseline(model, options);

    const worker = MockWorker.instances[0];
    client.dispose();

    expect(worker?.terminated).toBe(true);
    await expect(pending).rejects.toThrow("Solver worker was disposed");
  });
});
