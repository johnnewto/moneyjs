import { runBaseline, runScenario, validateModel } from "@sfcr/core";

import type { WorkerRequest, WorkerResponse } from "@sfcr/core-worker";

function toErrorResponse(id: string, error: unknown): WorkerResponse {
  if (error instanceof Error) {
    return {
      id,
      type: "error",
      payload: {
        name: error.name,
        message: error.message
      }
    };
  }

  return {
    id,
    type: "error",
    payload: {
      name: "UnknownError",
      message: "An unknown worker error occurred"
    }
  };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case "runBaseline":
        self.postMessage({
          id: request.id,
          type: "success",
          payload: runBaseline(request.payload.model, request.payload.options)
        } satisfies WorkerResponse);
        break;
      case "runScenario":
        self.postMessage({
          id: request.id,
          type: "success",
          payload: runScenario(
            request.payload.baseline,
            request.payload.scenario,
            request.payload.options
          )
        } satisfies WorkerResponse);
        break;
      case "validateModel":
        validateModel(request.payload.model);
        self.postMessage({
          id: request.id,
          type: "validationSuccess"
        } satisfies WorkerResponse);
        break;
    }
  } catch (error) {
    self.postMessage(toErrorResponse(request.id, error));
  }
};

export {};
