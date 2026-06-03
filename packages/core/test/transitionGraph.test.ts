import { describe, expect, it } from "vitest";

import {
  buildModeTransitionGraph,
  buildTransitionGraph,
  buildTransitionEffectsForVariable
} from "../src/analysis/transitionGraph";
import { computeTransitionMatrix } from "../src/analysis/transitionMatrix";
import { computeStabilityMetrics } from "../src/analysis/stability";
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

describe("buildTransitionGraph", () => {
  it("returns a self-loop for a one-variable lag model", () => {
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
    const edges = buildTransitionGraph(analysis);

    expect(edges).toHaveLength(1);
    expect(edges[0]?.from).toBe("y");
    expect(edges[0]?.to).toBe("y");
    expectClose(edges[0]?.weight ?? NaN, 0.8, 1e-5);
  });

  it("returns four edges for a two-variable linear model", () => {
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
    const edges = buildTransitionGraph(analysis);

    expect(edges).toHaveLength(4);
    expect(edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual([
      "x->x",
      "x->y",
      "y->x",
      "y->y"
    ]);
    expectClose(edges.find((edge) => edge.from === "x" && edge.to === "x")?.weight ?? NaN, 0.5, 1e-5);
    expectClose(edges.find((edge) => edge.from === "y" && edge.to === "x")?.weight ?? NaN, 0.1, 1e-5);
    expectClose(edges.find((edge) => edge.from === "x" && edge.to === "y")?.weight ?? NaN, 0.2, 1e-5);
    expectClose(edges.find((edge) => edge.from === "y" && edge.to === "y")?.weight ?? NaN, 0.7, 1e-5);
  });

  it("omits edges below the absolute weight threshold", () => {
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
    const edges = buildTransitionGraph(analysis, { minAbsWeight: 0.25 });

    expect(edges.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual(["x->x", "y->y"]);
  });

  it("respects maxEdges after sorting by magnitude", () => {
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
    const edges = buildTransitionGraph(analysis, { maxEdges: 2 });

    expect(edges).toHaveLength(2);
    expect(edges[0]?.from).toBe("y");
    expect(edges[0]?.to).toBe("y");
    expect(edges[1]?.from).toBe("x");
    expect(edges[1]?.to).toBe("x");
  });

  it("returns all thresholded edges when maxEdges is unlimited", () => {
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
    const edges = buildTransitionGraph(analysis, { maxEdges: Number.POSITIVE_INFINITY });

    expect(edges).toHaveLength(4);
  });
});

describe("buildTransitionEffectsForVariable", () => {
  it("returns incoming and outgoing edges for a variable", () => {
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
    const effects = buildTransitionEffectsForVariable(analysis, "x");

    expect(effects.inTransitionState).toBe(true);
    expect(effects.incoming.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual([
      "x->x",
      "y->x"
    ]);
    expect(effects.outgoing.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual([
      "x->x",
      "x->y"
    ]);
    expectClose(effects.incoming.find((edge) => edge.from === "y")?.weight ?? NaN, 0.1, 1e-5);
    expectClose(effects.outgoing.find((edge) => edge.to === "y")?.weight ?? NaN, 0.2, 1e-5);
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
    const effects = buildTransitionEffectsForVariable(analysis, "g");

    expect(effects.inTransitionState).toBe(false);
    expect(effects.incoming).toHaveLength(0);
    expect(effects.outgoing).toHaveLength(0);
  });
});

describe("buildModeTransitionGraph", () => {
  it("keeps only edges among dominant-mode participants", () => {
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
    const analysis = computeStabilityMetrics(result, 2);
    const edges = buildModeTransitionGraph(analysis, analysis.dominantMode, {
      minParticipation: 0.5
    });

    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(["x", "y"]).toContain(edge.from);
      expect(["x", "y"]).toContain(edge.to);
    }
  });
});
