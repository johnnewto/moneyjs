import { runBaseline, runScenario } from "@sfcr/core";

import type { WorkerRequest, WorkerResponse } from "./protocol";

export function handleWorkerRequest(request: WorkerRequest): WorkerResponse {
  try {
    switch (request.type) {
      case "runBaseline":
        return {
          id: request.id,
          type: "success",
          payload: runBaseline(request.payload.model, request.payload.options)
        };
      case "runScenario":
        return {
          id: request.id,
          type: "success",
          payload: runScenario(
            request.payload.baseline,
            request.payload.scenario,
            request.payload.options
          )
        };
      case "validateModel":
        runBaseline(request.payload.model, request.payload.options);
        return {
          id: request.id,
          type: "validationSuccess"
        };
    }
  } catch (error) {
    return toErrorResponse(request.id, error);
  }
}

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
