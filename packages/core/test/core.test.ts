import { describe, expect, it } from "vitest";

import { bmwBaselineModel, bmwBaselineOptions } from "../src/fixtures/bmw";
import { graphOrderingFixture } from "../src/fixtures/graph";
import {
  simBaselineModel,
  simBaselineOptions,
  simGovernmentSpendingShock
} from "../src/fixtures/sim";
import { validateShock } from "../src/engine/validate";
import { buildOrderedBlocks } from "../src/graph/blocks";
import {
  classifySectorEdge,
  createSectorTopology,
  mergeSectorTopologies
} from "../src/graph/sectors";
import { analyzeParsedEquation } from "../src/parser/analyze";
import { parseEquation, parseExpression } from "../src/parser/parse";
import { runBaseline } from "../src/engine/runBaseline";
import { runScenario } from "../src/engine/runScenario";

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("parser", () => {
  it("tracks lag and arithmetic dependencies", () => {
    const expression = parseExpression("a + 2 * lag(b) - diff(c)");
    const equation = parseEquation("x", "a + 2 * lag(b) - diff(c)");

    expect(expression.type).toBe("Binary");
    expect(new Set(equation.currentDependencies)).toEqual(new Set(["a", "c"]));
    expect(new Set(equation.lagDependencies)).toEqual(new Set(["b", "c"]));
  });

  it("parses functions and conditionals", () => {
    const equation = parseEquation(
      "x",
      "if (ER <= (1 + BANDt)) {exp(v)} else {log(v)}"
    );

    expect(new Set(equation.currentDependencies)).toEqual(new Set(["ER", "BANDt", "v"]));
  });

  it("preserves operator precedence", () => {
    const equation = parseEquation("x", "a + b * c ^ d");
    expect(equation.expression.type).toBe("Binary");
    expect(new Set(equation.currentDependencies)).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("normalizes R-style lag and diff syntax", () => {
    const equation = parseEquation("x", "a[-1] + d(b)");
    expect(new Set(equation.currentDependencies)).toEqual(new Set(["b"]));
    expect(new Set(equation.lagDependencies)).toEqual(new Set(["a", "b"]));
  });

  it("treats dt as a built-in constant, not a model dependency", () => {
    const equation = parseEquation("x", "dt * a + lag(dt) + d(dt)");

    expect(new Set(equation.currentDependencies)).toEqual(new Set(["a"]));
    expect(new Set(equation.lagDependencies)).toEqual(new Set());
  });

  it("parses I(...) and lowers it against the equation lhs", () => {
    const expression = parseExpression("I(G - TX)");
    const equation = parseEquation("Bs", "I(G - TX)");

    expect(expression.type).toBe("Integral");
    expect(equation.sourceExpression.type).toBe("Integral");
    expect(equation.expression).toEqual({
      type: "Binary",
      op: "+",
      left: { type: "Lag", name: "Bs" },
      right: {
        type: "Binary",
        op: "*",
        left: {
          type: "Binary",
          op: "-",
          left: { type: "Variable", name: "G" },
          right: { type: "Variable", name: "TX" }
        },
        right: { type: "Variable", name: "dt" }
      }
    });
    expect(new Set(equation.currentDependencies)).toEqual(new Set(["G", "TX"]));
    expect(new Set(equation.lagDependencies)).toEqual(new Set(["Bs"]));
  });

  it("rejects nested I(...) usage", () => {
    expect(() => parseEquation("Bs", "lag(Bs) + I(G - TX)")).toThrow(
      "I(...) is only supported as the outermost RHS form"
    );
  });

  it("throws on unsupported functions", () => {
    expect(() => parseExpression("sin(x)")).toThrow("Unsupported function");
  });

  it("classifies accumulation, identity, definition, and target roles", () => {
    expect(analyzeParsedEquation(parseEquation("Bs", "I(G - TX)")).role).toBe("accumulation");
    expect(analyzeParsedEquation(parseEquation("Y", "C + I + G")).role).toBe("identity");
    expect(analyzeParsedEquation(parseEquation("YD", "Y")).role).toBe("definition");
    expect(
      analyzeParsedEquation(parseEquation("KT", "kappa * lag(Y)"), {
        description: "desired capital target"
      }).role
    ).toBe("target");
  });

  it("lets explicit analysis hints override inferred equation role", () => {
    const equation = parseEquation("C", "alpha1 * YD + alpha2 * lag(V)");

    expect(analyzeParsedEquation(equation).role).toBe("behavioral");
    expect(analyzeParsedEquation(equation, { explicitRole: "definition" }).role).toBe("definition");
  });
});

describe("graph", () => {
  it("orders blocks and preserves cyclic groups", () => {
    const ordered = buildOrderedBlocks(
      graphOrderingFixture.map((equation) => parseEquation(equation.name, equation.expression))
    );

    expect(ordered.blocks).toHaveLength(4);
    expect(ordered.blocks.some((block) => block.cyclic && block.equationNames.includes("c"))).toBe(true);
  });

  it("groups self-referential equations into a single noncyclic block in current model semantics", () => {
    const ordered = buildOrderedBlocks([
      parseEquation("x", "x + a"),
      parseEquation("y", "x + 1")
    ]);

    expect(ordered.blocks).toHaveLength(2);
    expect(ordered.blocks[0]?.equationNames).toContain("x");
  });

  it("ignores exogenous dependencies during block ordering", () => {
    const ordered = buildOrderedBlocks([
      parseEquation("x", "g + 1"),
      parseEquation("y", "x + 1")
    ]);

    expect(ordered.blocks).toHaveLength(2);
    expect(ordered.blocks[0]?.equationNames).toEqual(["x"]);
    expect(ordered.blocks[1]?.equationNames).toEqual(["y"]);
  });
});

describe("sector topology", () => {
  it("merges matrix-derived assignments into reusable sector metadata", () => {
    const transaction = createSectorTopology([
      {
        variable: "Cd",
        sector: "Production firms",
        source: "transaction-matrix",
        confidence: "high",
        accountKind: "flow"
      },
      {
        variable: "Mh",
        sector: "Households",
        source: "transaction-matrix",
        confidence: "high",
        accountKind: "stock"
      }
    ]);
    const balance = createSectorTopology([
      {
        variable: "Mh",
        sector: "Households",
        source: "balance-matrix",
        confidence: "high",
        accountKind: "stock"
      },
      {
        variable: "Ls",
        sector: "Banks",
        source: "balance-matrix",
        confidence: "high",
        accountKind: "stock"
      }
    ]);

    const topology = mergeSectorTopologies([transaction, balance]);

    expect(topology.variables.Mh).toMatchObject({
      sector: "Households",
      source: "balance-matrix",
      confidence: "high",
      accountKind: "stock"
    });
    expect(topology.variables.Cd?.sector).toBe("Production firms");
    expect(topology.variables.Ls?.sector).toBe("Banks");
    expect(classifySectorEdge(topology, "Mh", "Ls")).toEqual({
      sourceSector: "Households",
      targetSector: "Banks",
      crossSector: true
    });
  });
});

describe("simulation", () => {
  it("matches SIM baseline checkpoints with Gauss-Seidel", () => {
    const result = runBaseline(simBaselineModel, {
      ...simBaselineOptions,
      solverMethod: "GAUSS_SEIDEL"
    });

    expectClose(result.series.Y[1] ?? NaN, 38.4615384615, 1e-6);
    expectClose(result.series.Cd[1] ?? NaN, 18.4615384615, 1e-6);
    expectClose(result.series.Hh[9] ?? NaN, 62.2117189463669, 1e-5);
    expectClose(result.series.Hs[9] ?? NaN, 62.21171894636689, 1e-5);
  });

  it("matches SIM baseline checkpoints with Newton", () => {
    const result = runBaseline(simBaselineModel, {
      ...simBaselineOptions,
      solverMethod: "NEWTON",
      tolerance: 1e-10
    });

    expectClose(result.series.Y[9] ?? NaN, 83.82883540578808, 1e-4);
    expectClose(result.series.Cd[9] ?? NaN, 63.82883540578808, 1e-4);
  });

  it("matches SIM baseline checkpoints with Broyden", () => {
    const result = runBaseline(simBaselineModel, simBaselineOptions);

    expectClose(result.series.Y[9] ?? NaN, 83.82883540578808, 1e-4);
    expectClose(result.series.Cd[9] ?? NaN, 63.82883540578808, 1e-4);
    expectClose(result.series.TXd[9] ?? NaN, 16.76576708115762, 1e-4);
  });

  it("matches SIM scenario checkpoints", () => {
    const baseline = runBaseline(simBaselineModel, simBaselineOptions);
    const result = runScenario(baseline, simGovernmentSpendingShock, simBaselineOptions);

    expectClose(result.series.Gd[4] ?? NaN, 30, 1e-9);
    expectClose(result.series.Y[4] ?? NaN, 110.94107274679271, 1e-4);
    expectClose(result.series.Cd[9] ?? NaN, 103.05791032826815, 1e-4);
  });

  it("matches BMW baseline checkpoints with Newton", () => {
    const result = runBaseline(bmwBaselineModel, bmwBaselineOptions);

    expectClose(result.series.Y[1] ?? NaN, 80.00002211998407, 1e-3);
    expectClose(result.series.Cd[1] ?? NaN, 80.00002211998407, 1e-3);
    expectClose(result.series.W[1] ?? NaN, 1.0000000195603564, 1e-5);

    expectClose(result.series.Y[11] ?? NaN, 171.2118829672477, 1e-3);
    expectClose(result.series.Cd[11] ?? NaN, 151.62233983563468, 1e-3);
    expectClose(result.series.Id[11] ?? NaN, 19.589543131613034, 1e-3);
    expectClose(result.series.K[11] ?? NaN, 135.27289254136974, 1e-3);
    expectClose(result.series.Mh[11] ?? NaN, 135.2729032243398, 1e-3);
    expectClose(result.series.W[11] ?? NaN, 0.9061564443779875, 1e-4);
  });

  it("evaluates built-in dt inside equations", () => {
    const result = runBaseline(
      {
        equations: [{ name: "x", expression: "2 * dt" }],
        externals: {},
        initialValues: {}
      },
      {
        periods: 3,
        solverMethod: "GAUSS_SEIDEL",
        tolerance: 1e-9,
        maxIterations: 20
      }
    );

    expectClose(result.series.x[1] ?? NaN, 2, 1e-12);
    expectClose(result.series.x[2] ?? NaN, 2, 1e-12);
  });

  it("evaluates I(flow) as lag(stock) + flow * dt", () => {
    const result = runBaseline(
      {
        equations: [
          { name: "flow", expression: "2" },
          { name: "Bs", expression: "I(flow)" }
        ],
        externals: {},
        initialValues: { Bs: 10 }
      },
      {
        periods: 4,
        solverMethod: "GAUSS_SEIDEL",
        tolerance: 1e-9,
        maxIterations: 20
      }
    );

    expectClose(result.series.Bs[0] ?? NaN, 10, 1e-12);
    expectClose(result.series.Bs[1] ?? NaN, 12, 1e-12);
    expectClose(result.series.Bs[2] ?? NaN, 14, 1e-12);
    expectClose(result.series.Bs[3] ?? NaN, 16, 1e-12);
  });

  it("applies a multi-period series shock", () => {
    const baseline = runBaseline(simBaselineModel, simBaselineOptions);
    const result = runScenario(
      baseline,
      {
        shocks: [
          {
            startPeriodInclusive: 2,
            endPeriodInclusive: 4,
            variables: {
              Gd: { kind: "series", values: [25, 26, 27] }
            }
          }
        ]
      },
      simBaselineOptions
    );

    expectClose(result.series.Gd[1] ?? NaN, 25, 1e-9);
    expectClose(result.series.Gd[2] ?? NaN, 26, 1e-9);
    expectClose(result.series.Gd[3] ?? NaN, 27, 1e-9);
  });

  it("rejects shocks on non-external variables", () => {
    expect(() =>
      validateShock(
        simBaselineModel,
        {
          startPeriodInclusive: 1,
          endPeriodInclusive: 2,
          variables: {
            Y: { kind: "constant", value: 99 }
          }
        },
        simBaselineOptions.periods
      )
    ).toThrow("Shocked variable is not an external variable");
  });

  it("rejects invalid shock ranges", () => {
    expect(() =>
      validateShock(
        simBaselineModel,
        {
          startPeriodInclusive: 0,
          endPeriodInclusive: 2,
          variables: {
            Gd: { kind: "constant", value: 30 }
          }
        },
        simBaselineOptions.periods
      )
    ).toThrow("Shock start period must be at least 1");
  });

  it("fails hidden-equation validation when configured incorrectly", () => {
    expect(() =>
      runBaseline(simBaselineModel, {
        ...simBaselineOptions,
        hiddenEquation: {
          leftVariable: "Y",
          rightVariable: "Cd",
          tolerance: 1e-12
        }
      })
    ).toThrow("Hidden equation is not fulfilled");
  });
});
