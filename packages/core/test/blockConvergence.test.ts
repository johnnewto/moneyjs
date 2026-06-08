import { describe, expect, it } from "vitest";

import {
  analyzeAllBlockConvergence,
  analyzeBlockConvergence,
  probeInitialValuesForPeriod1
} from "../src/analysis/blockConvergence";
import { simBaselineModel, simBaselineOptions } from "../src/fixtures/sim";

describe("analyzeBlockConvergence", () => {
  it("marks acyclic blocks as acyclic", () => {
    const report = analyzeAllBlockConvergence(simBaselineModel, simBaselineOptions, 1);
    const gsBlock = report.blocks.find((entry) => entry.block.equationNames.includes("Gs"));
    expect(gsBlock?.status).toBe("acyclic");
    expect(gsBlock?.iterationsUsed).toBe(0);
  });

  it("converges the SIM cyclic block with reasonable initial values", () => {
    const report = analyzeAllBlockConvergence(simBaselineModel, simBaselineOptions, 1, {
      lagOverrides: {
        Y: 80,
        Hh: 48,
        Cd: 28,
        Hs: 20
      }
    });
    const cyclic = report.blocks.find((entry) => entry.block.cyclic);
    expect(cyclic?.status).toBe("converged");
    expect(cyclic?.seedSource).toBe("lag");
    expect(cyclic?.iterationsUsed).toBeGreaterThan(0);
  });

  it("reports max_iterations for a divergent cyclic probe", () => {
    const model = {
      equations: [
        { name: "x", expression: "y + 1" },
        { name: "y", expression: "x + 1" }
      ],
      externals: {},
      initialValues: { x: 1, y: 1 }
    };
    const options = {
      periods: 3,
      solverMethod: "GAUSS_SEIDEL" as const,
      tolerance: 1e-8,
      maxIterations: 3
    };

    const analysis = analyzeBlockConvergence(model, options, 1, 0);
    expect(analysis.block.cyclic).toBe(true);
    expect(analysis.status).toBe("max_iterations");
    expect(analysis.iterationsUsed).toBe(3);
  });

  it("probes period-1 initial value candidates", () => {
    const options = { ...simBaselineOptions, periods: 5 };
    const results = probeInitialValuesForPeriod1(simBaselineModel, options, [
      {
        label: "inconsistent",
        initialValues: { Y: 1e6, Hh: -1e6, Cd: 1e6, Hs: -1e6 }
      },
      {
        label: "steady-ish",
        initialValues: { Y: 80, Hh: 48, Cd: 28, Hs: 20 }
      }
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.label).toBe("inconsistent");
    expect(results[1]?.allCyclicConverged).toBe(true);
    expect(results[1]?.report.blocks.some((entry) => entry.block.cyclic)).toBe(true);
  });
});
