import { describe, expect, it } from "vitest";

import { ConvergenceError } from "../src/model/schema";
import { runBaseline } from "../src/engine/runBaseline";
import {
  buildConvergenceFailureDetails,
  formatConvergenceFailureMessage
} from "../src/solver/convergenceFailure";

describe("convergence failure diagnostics", () => {
  it("throws ConvergenceError with actionable diagnostics for non-converging blocks", () => {
    const model = {
      equations: [
        { name: "x", expression: "y + 1" },
        { name: "y", expression: "x + 1" }
      ],
      externals: {},
      initialValues: { x: 1, y: 1 }
    };
    const options = {
      periods: 2,
      solverMethod: "GAUSS_SEIDEL" as const,
      tolerance: 1e-8,
      maxIterations: 3
    };

    expect(() => runBaseline(model, options)).toThrow(ConvergenceError);

    try {
      runBaseline(model, options);
    } catch (error) {
      expect(error).toBeInstanceOf(ConvergenceError);
      if (!(error instanceof ConvergenceError)) {
        return;
      }

      expect(error.details.period).toBe(1);
      expect(error.details.blockVariables).toEqual(["x", "y"]);
      expect(error.details.iterationsUsed).toBe(3);
      expect(error.details.worstVariables.length).toBeGreaterThan(0);
      expect(error.message).toContain("Gauss-Seidel failed to converge at period 1");
      expect(error.message).toContain("Slowest to converge:");
      expect(error.message).toContain("x=");
    }
  });

  it("formats large blocks without listing every variable in the summary", () => {
    const details = buildConvergenceFailureDetails({
      solverMethod: "Gauss-Seidel",
      period: 1,
      block: {
        id: 5,
        equationNames: ["a", "b", "c", "d", "e", "f", "g"],
        cyclic: true
      },
      options: {
        tolerance: 1e-8,
        maxIterations: 50
      },
      iterationsUsed: 50,
      variables: [
        { name: "a", value: 10, relativeChange: 0.2, finite: true },
        { name: "b", value: 20, relativeChange: 0.05, finite: true }
      ]
    });

    expect(formatConvergenceFailureMessage(details)).toContain("7 variables (a, b, c, d, e, …)");
  });
});
