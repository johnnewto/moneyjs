import { describe, expect, it } from "vitest";

import { buildDependencyGraphLayoutSnapshot } from "../src/components/DependencyGraphCanvas";
import { buildDependencyGraph } from "../src/notebook/dependencyGraph";
import { buildDependencyRowTopology } from "../src/notebook/dependencyRows";
import { buildDependencySectorTopology } from "../src/notebook/dependencySectors";
import type { NotebookCell, SequenceCell } from "../src/notebook/types";

describe("dependency graph viewer", () => {
  it("builds layered nodes from equations, externals, and initial values", () => {
    const graph = buildDependencyGraph({
      equations: [
        { id: "eq-a", name: "a", expression: "a_level" },
        { id: "eq-b", name: "b", expression: "a + b_offset" },
        { id: "eq-c", name: "c", expression: "b + c_offset" },
        { id: "eq-d", name: "d", expression: "c + d_offset" },
        { id: "eq-e", name: "e", expression: "I(d)" }
      ],
      externals: [
        { id: "ext-a", name: "a_level", kind: "constant", valueText: "1" },
        { id: "ext-b", name: "b_offset", kind: "constant", valueText: "2" },
        { id: "ext-c", name: "c_offset", kind: "constant", valueText: "3" },
        { id: "ext-d", name: "d_offset", kind: "constant", valueText: "4" }
      ],
      initialValues: [{ id: "init-e", name: "e", valueText: "10" }]
    });

    expect(graph.errors).toEqual([]);

    const nodeByName = new Map(graph.nodes.map((node) => [node.name, node]));
    expect(nodeByName.get("a_level")?.layer).toBe(0);
    expect(nodeByName.get("a")?.layer).toBe(1);
    expect(nodeByName.get("b")?.layer).toBe(2);
    expect(nodeByName.get("c")?.layer).toBe(3);
    expect(nodeByName.get("d")?.layer).toBe(4);
    expect(nodeByName.get("e")).toMatchObject({
      variableType: "stock",
      equationRole: "accumulation",
      layer: 5,
      hasSelfLag: true,
      isCyclic: false,
      initialValue: 10
    });
    expect(nodeByName.get("d")?.variableType).toBe("flow");
    expect(nodeByName.get("d")?.equationRole).toBe("identity");

    expect(graph.edges.map((edge) => edge.id)).toContain("d->e");
    expect(graph.layerCount).toBe(6);
  });

  it("keeps lag edges distinct from current edges and reports parse failures", () => {
    const graph = buildDependencyGraph({
      equations: [
        { id: "eq-c", name: "c", expression: "alpha1 * yd + alpha2 * lag(v)" },
        { id: "eq-v", name: "v", expression: "lag(v) + (yd - c) * dt" },
        { id: "eq-bad", name: "broken", expression: "if (" }
      ],
      externals: [
        { id: "ext-a1", name: "alpha1", kind: "constant", valueText: "0.6" },
        { id: "ext-a2", name: "alpha2", kind: "constant", valueText: "0.4" },
        { id: "ext-yd", name: "yd", kind: "series", valueText: "10, 11" }
      ],
      initialValues: [{ id: "init-v", name: "v", valueText: "80" }]
    });

    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]).toContain("broken");

    const cToV = graph.edges.find((edge) => edge.id === "c->v");
    const ydToC = graph.edges.find((edge) => edge.id === "yd->c");
    const vNode = graph.nodes.find((node) => node.name === "v");

    expect(cToV).toMatchObject({ current: true, lagged: false });
    expect(ydToC).toMatchObject({ current: true, lagged: false });
    expect(vNode).toMatchObject({
      variableType: "stock",
      equationRole: "accumulation",
      hasSelfLag: true,
      isCyclic: false,
      initialValue: 80
    });
    expect(vNode?.lagDependencyNames).toContain("v");
  });

  it("keeps algebraic self-cycles separate from stock classification", () => {
    const graph = buildDependencyGraph({
      equations: [
        { id: "eq-x", name: "x", expression: "x + shock" },
        { id: "eq-y", name: "y", expression: "x + 1" }
      ],
      externals: [{ id: "ext-shock", name: "shock", kind: "constant", valueText: "1" }],
      initialValues: []
    });

    expect(graph.errors).toEqual([]);

    const xNode = graph.nodes.find((node) => node.name === "x");
    const yNode = graph.nodes.find((node) => node.name === "y");

    expect(xNode).toMatchObject({
      variableType: "auxiliary",
      equationRole: "identity",
      hasSelfLag: false,
      isCyclic: true
    });
    expect(yNode).toMatchObject({
      variableType: "auxiliary",
      equationRole: "definition",
      isCyclic: false
    });
  });

  it("prefers explicit equation roles over structural inference", () => {
    const graph = buildDependencyGraph({
      equations: [
        {
          id: "eq-kt",
          name: "KT",
          expression: "kappa * lag(Y)",
          role: "target"
        }
      ],
      externals: [
        { id: "ext-kappa", name: "kappa", kind: "constant", valueText: "1" },
        { id: "ext-y", name: "Y", kind: "constant", valueText: "100" }
      ],
      initialValues: []
    });

    expect(graph.nodes.find((node) => node.name === "KT")).toMatchObject({
      equationRole: "target"
    });
  });

  it("produces reusable layout diagnostics for BMW accounting strips", () => {
    const { cells, dependencyCell, graph } = buildBmwDependencyScenario();
    const sectorTopology = buildDependencySectorTopology({ cells, dependencyCell, graph });
    const rowTopology = buildDependencyRowTopology({ cells, dependencyCell, graph });
    const snapshot = buildDependencyGraphLayoutSnapshot({
      availableWidth: 1440,
      graph,
      rowTopology,
      sectorTopology,
      showAccountingStrips: true,
      viewMode: "strips"
    });

    if (process.env.SHOW_DEPENDENCY_DEBUG === "1") {
      const overlapSummary = snapshot.diagnostics.overlapPairs
        .slice()
        .sort((left, right) => right.overlapRatio - left.overlapRatio)
        .slice(0, 12)
        .map((pair) => ({
          left: snapshot.layout.nodes.find((node) => node.id === pair.leftId)?.label ?? pair.leftId,
          right: snapshot.layout.nodes.find((node) => node.id === pair.rightId)?.label ?? pair.rightId,
          overlapRatio: Number(pair.overlapRatio.toFixed(3)),
          overlapX: Number(pair.overlapX.toFixed(1)),
          overlapY: Number(pair.overlapY.toFixed(1))
        }));
      const exogenousSummary = snapshot.diagnostics.exogenousPlacements
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => ({
          name: entry.name,
          finalX: Number(entry.finalX.toFixed(1)),
          finalY: Number(entry.finalY.toFixed(1)),
          targetX: Number(entry.targetX.toFixed(1)),
          targetY: Number(entry.targetY.toFixed(1)),
          saturated: entry.isBoundSaturated,
          outgoingTargets: entry.outgoingTargetIds
            .map((targetId) => snapshot.layout.nodes.find((node) => node.id === targetId)?.label ?? targetId)
            .sort()
        }));
      // Intentionally env-gated so developers can inspect layout numbers without noisy normal test output.
      console.log(
        JSON.stringify(
          {
            maxOverlapRatio: Number(snapshot.diagnostics.maxOverlapRatio.toFixed(3)),
            overlapPairCount: snapshot.diagnostics.overlapPairs.length,
            overlapSummary,
            exogenousSummary
          },
          null,
          2
        )
      );
    }

    expect(snapshot.diagnostics.nodeBoxes.length).toBe(snapshot.layout.nodes.length);
    expect(snapshot.diagnostics.exogenousPlacements.map((entry) => entry.name).sort()).toEqual([
      "Ns",
      "alpha0",
      "alpha1",
      "alpha2",
      "delta",
      "gamma",
      "kappa",
      "pr",
      "rl"
    ]);
    expect(snapshot.diagnostics.maxOverlapRatio).toBeLessThan(0.75);
    expect(
      snapshot.diagnostics.exogenousPlacements.every(
        (entry) =>
          Number.isFinite(entry.targetX) &&
          Number.isFinite(entry.targetY) &&
          Number.isFinite(entry.finalX) &&
          Number.isFinite(entry.finalY)
      )
    ).toBe(true);
  });
});

function buildBmwDependencyScenario(): {
  cells: NotebookCell[];
  dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  graph: ReturnType<typeof buildDependencyGraph>;
} {
  const cells: NotebookCell[] = [
    {
      id: "balance-sheet",
      type: "matrix",
      title: "BMW balance sheet",
      sourceRunCellId: "baseline-newton",
      columns: ["Households", "Production firms", "Banks", "Sum"],
      sectors: ["Households", "Firms", "Banks", ""],
      rows: [
        { label: "Money deposits", values: ["+Mh", "", "-Ms", "0"] },
        { label: "Loans", values: ["", "-Ld", "+Ls", "0"] },
        { label: "Fixed capital", values: ["", "+K", "", "+K"] },
        { label: "Balance (net worth)", values: ["-Vh", "-V", "0", "0"] },
        { label: "Sum", values: ["0", "0", "0", "0"] }
      ]
    },
    {
      id: "transaction-flow",
      type: "matrix",
      title: "BMW transactions-flow matrix",
      sourceRunCellId: "baseline-newton",
      columns: ["Households", "Firms_current", "Firms_capital", "Banks_current", "Banks_capital"],
      sectors: ["Households", "Firms", "Firms", "Banks", "Banks"],
      rows: [
        { label: "Consumption", values: ["-Cs", "+Cd", "", "", ""] },
        { label: "Investment", values: ["", "+Is", "-Id", "", ""] },
        { label: "Wages", values: ["+WBs", "-WBd", "", "", ""] },
        { label: "Depreciation", values: ["", "-AF", "+AF", "", ""] },
        { label: "Interest loans", values: ["", "-rl[-1] * Ld[-1]", "", "+rl[-1] * Ls[-1]", ""] },
        { label: "Interest on deposits", values: ["+rm[-1] * Mh[-1]", "", "", "-rm[-1] * Ms[-1]", ""] },
        { label: "Ch. loans", values: ["", "", "+d(Ld)", "", "-d(Ls)"] },
        { label: "Ch. deposits", values: ["-d(Mh)", "", "", "", "+d(Ms)"] }
      ]
    },
    {
      id: "equations-newton",
      type: "equations",
      title: "BMW model",
      modelId: "equations-newton",
      equations: [
        { id: "eq-cs", name: "Cs", expression: "Cd" },
        { id: "eq-cd", name: "Cd", expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh)" },
        { id: "eq-is", name: "Is", expression: "Id" },
        { id: "eq-wbd", name: "WBd", expression: "Y - lag(rl) * lag(Ld) - AF" },
        { id: "eq-af", name: "AF", expression: "delta * lag(K)" },
        { id: "eq-ld", name: "Ld", expression: "lag(Ld) + (Id - AF) * dt" },
        { id: "eq-yd", name: "YD", expression: "WBs + lag(rm) * lag(Mh)" },
        { id: "eq-mh", name: "Mh", expression: "lag(Mh) + (YD - Cd) * dt" },
        { id: "eq-rm", name: "rm", expression: "rl" },
        { id: "eq-wbs", name: "WBs", expression: "W * Ns" },
        { id: "eq-nd", name: "Nd", expression: "Y / pr" },
        { id: "eq-w", name: "W", expression: "WBd / Nd" },
        { id: "eq-k", name: "K", expression: "lag(K) + (Id - DA) * dt" },
        { id: "eq-da", name: "DA", expression: "delta * lag(K)" },
        { id: "eq-kt", name: "KT", expression: "kappa * lag(Y)" },
        { id: "eq-id", name: "Id", expression: "gamma * (KT - lag(K)) + DA" }
      ]
    },
    {
      id: "solver-newton",
      type: "solver",
      title: "Solver options",
      modelId: "equations-newton",
      options: {
        periods: 20,
        solverMethod: "NEWTON",
        toleranceText: "1e-10",
        maxIterations: 100,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "1e-5",
        relativeHiddenTolerance: false
      }
    },
    {
      id: "baseline-newton",
      type: "run",
      title: "Baseline run",
      mode: "baseline",
      resultKey: "bmw",
      sourceModelId: "equations-newton"
    }
  ];
  const dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  } = {
    id: "equation-dependency-graph",
    type: "sequence",
    title: "BMW equation dependency graph",
    source: { kind: "dependency", modelId: "equations-newton" }
  };
  const graph = buildDependencyGraph({
    equations: cells.find((cell) => cell.id === "equations-newton" && cell.type === "equations")!.equations,
    externals: [
      { id: "ext-rl", name: "rl", kind: "constant", valueText: "0.025" },
      { id: "ext-alpha0", name: "alpha0", kind: "constant", valueText: "20" },
      { id: "ext-alpha1", name: "alpha1", kind: "constant", valueText: "0.75" },
      { id: "ext-alpha2", name: "alpha2", kind: "constant", valueText: "0.1" },
      { id: "ext-delta", name: "delta", kind: "constant", valueText: "0.1" },
      { id: "ext-gamma", name: "gamma", kind: "constant", valueText: "0.15" },
      { id: "ext-kappa", name: "kappa", kind: "constant", valueText: "1" },
      { id: "ext-pr", name: "pr", kind: "constant", valueText: "1" },
      { id: "ext-ns", name: "Ns", kind: "constant", valueText: "1" }
    ],
    initialValues: []
  });

  return { cells, dependencyCell, graph };
}
