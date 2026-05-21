import { describe, expect, it } from "vitest";

import { ModelValidationError, type ModelDefinition, type SimulationOptions } from "@sfcr/core";
import { handleWorkerRequest } from "@sfcr/core-worker";

const options: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50
};

describe("core worker handler", () => {
  it("validates by running the model enough to catch solver-time errors", () => {
    const model: ModelDefinition = {
      equations: [{ name: "Y", expression: "missingExternal" }],
      externals: {},
      initialValues: {}
    };

    const response = handleWorkerRequest({
      id: "validate-1",
      type: "validateRunnable",
      payload: { model, options }
    });

    expect(response).toMatchObject({
      id: "validate-1",
      type: "error",
      payload: {
        message: "Unknown variable: missingExternal"
      }
    });
  });

  it("includes structured details for ModelValidationError", () => {
    const model: ModelDefinition = {
      equations: [],
      externals: {},
      initialValues: {}
    };

    const response = handleWorkerRequest({
      id: "validate-3",
      type: "validateRunnable",
      payload: { model, options }
    });

    expect(response).toMatchObject({
      id: "validate-3",
      type: "error",
      payload: {
        name: ModelValidationError.name,
        message: "Model must contain at least one equation",
        details: { field: "equations" }
      }
    });
  });

  it("returns validationSuccess for runnable models", () => {
    const model: ModelDefinition = {
      equations: [{ name: "Y", expression: "Gd" }],
      externals: { Gd: { kind: "constant", value: 20 } },
      initialValues: {}
    };

    expect(
      handleWorkerRequest({
        id: "validate-2",
        type: "validateRunnable",
        payload: { model, options }
      })
    ).toEqual({
      id: "validate-2",
      type: "validationSuccess"
    });
  });
});
