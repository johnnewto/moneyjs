import {
  ConvergenceError,
  ModelValidationError,
  ParseError,
  runBaseline,
  runScenario,
  validateRunnable
} from "@sfcr/core";

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
      case "validateRunnable":
        validateRunnable(request.payload.model, request.payload.options);
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
  if (error instanceof ModelValidationError) {
    return {
      id,
      type: "error",
      payload: {
        name: error.name,
        message: error.message,
        ...(error.field ? { details: { field: error.field } } : {})
      }
    };
  }

  if (error instanceof ParseError) {
    const details: Record<string, unknown> = {};
    if (error.equationName) {
      details.equationName = error.equationName;
    }
    if (error.source) {
      details.source = error.source;
    }
    return {
      id,
      type: "error",
      payload: {
        name: error.name,
        message: error.message,
        ...(Object.keys(details).length > 0 ? { details } : {})
      }
    };
  }

  if (error instanceof ConvergenceError) {
    return {
      id,
      type: "error",
      payload: {
        name: error.name,
        message: error.message,
        details: { period: error.period, blockId: error.blockId }
      }
    };
  }

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
