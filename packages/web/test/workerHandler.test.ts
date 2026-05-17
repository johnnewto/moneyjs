import { describe, expect, it } from "vitest";

import type { ModelDefinition, SimulationOptions } from "@sfcr/core";
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
      type: "validateModel",
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

  it("returns validationSuccess for runnable models", () => {
    const model: ModelDefinition = {
      equations: [{ name: "Y", expression: "Gd" }],
      externals: { Gd: { kind: "constant", value: 20 } },
      initialValues: {}
    };

    expect(
      handleWorkerRequest({
        id: "validate-2",
        type: "validateModel",
        payload: { model, options }
      })
    ).toEqual({
      id: "validate-2",
      type: "validationSuccess"
    });
  });
});
