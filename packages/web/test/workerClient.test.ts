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

  it("resolves validation requests without payload", async () => {
    const client = createWorkerClient();
    const pending = client.validateModel(model, options);

    const worker = MockWorker.instances[0];
    expect(worker?.messages[0]).toMatchObject({
      id: "test-id",
      type: "validateModel"
    });

    worker?.emit({
      id: "test-id",
      type: "validationSuccess"
    });

    await expect(pending).resolves.toBeUndefined();
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

  it("terminates the worker on dispose", () => {
    const client = createWorkerClient();
    void client.runBaseline(model, options);

    const worker = MockWorker.instances[0];
    client.dispose();

    expect(worker?.terminated).toBe(true);
  });
});
