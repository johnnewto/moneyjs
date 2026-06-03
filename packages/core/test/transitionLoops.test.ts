import { describe, expect, it } from "vitest";

import {
  buildTransitionLoopsThroughVariable,
  formatTransitionLoopPath
} from "../src/analysis/transitionLoops";
import { computeTransitionMatrix } from "../src/analysis/transitionMatrix";
import { runBaseline } from "../src/engine/runBaseline";
import type { ModelDefinition, SimulationOptions } from "../src/model/types";

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

const defaultOptions: SimulationOptions = {
  periods: 5,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-9,
  maxIterations: 50
};

describe("buildTransitionLoopsThroughVariable", () => {
  it("returns a self-loop with gain for a one-variable lag model", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 0.8 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);
    const loopsResult = buildTransitionLoopsThroughVariable(analysis, "y");

    expect(loopsResult.inTransitionState).toBe(true);
    expect(loopsResult.loops).toHaveLength(1);
    expect(formatTransitionLoopPath(loopsResult.loops[0]!)).toBe("y → y");
    expectClose(loopsResult.loops[0]?.gain ?? NaN, 0.8, 1e-5);
  });

  it("finds a two-step loop through x in a linear two-variable model", () => {
    const model: ModelDefinition = {
      equations: [
        { name: "x", expression: "a * lag(x) + b * lag(y)" },
        { name: "y", expression: "c * lag(x) + d * lag(y)" }
      ],
      externals: {
        a: { kind: "constant", value: 0.5 },
        b: { kind: "constant", value: 0.1 },
        c: { kind: "constant", value: 0.2 },
        d: { kind: "constant", value: 0.7 }
      },
      initialValues: { x: 1, y: 2 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);
    const loopsResult = buildTransitionLoopsThroughVariable(analysis, "x");

    expect(loopsResult.inTransitionState).toBe(true);
    expect(loopsResult.loops.some((loop) => loop.nodes.join("→") === "x→x")).toBe(true);
    const xyx = loopsResult.loops.find((loop) => formatTransitionLoopPath(loop) === "x → y → x");
    expect(xyx).toBeDefined();
    expectClose(xyx?.gain ?? NaN, 0.1 * 0.2, 1e-5);
  });

  it("reports when the variable is not in the transition state", () => {
    const model: ModelDefinition = {
      equations: [{ name: "y", expression: "a * lag(y) + g" }],
      externals: {
        a: { kind: "constant", value: 0.8 },
        g: { kind: "constant", value: 10 }
      },
      initialValues: { y: 100 }
    };

    const result = runBaseline(model, defaultOptions);
    const analysis = computeTransitionMatrix(result, 2);
    const loopsResult = buildTransitionLoopsThroughVariable(analysis, "g");

    expect(loopsResult.inTransitionState).toBe(false);
    expect(loopsResult.loops).toHaveLength(0);
  });
});
