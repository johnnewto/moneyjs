import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../src/notebook/dependencyGraph";
import { buildAccountingProxyNodes, buildDependencyRowTopology } from "../src/notebook/dependencyRows";
import type { NotebookCell, SequenceCell } from "../src/notebook/types";

describe("dependency row topology", () => {
  it("builds accounting-row memberships from BMW transaction and balance matrices", () => {
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
    const topology = buildDependencyRowTopology({ cells, dependencyCell, graph });

    expect(topology.bands.slice(0, 4)).toEqual([
      "Consumption",
      "Investment",
      "Wages",
      "Depreciation"
    ]);
    expect(topology.variables.Cd?.primaryBand).toBe("Consumption");
    expect(topology.variables.Mh?.memberships.map((membership) => membership.band).sort()).toEqual([
      "Ch. deposits",
      "Interest on deposits",
      "Money deposits"
    ]);
    expect(topology.variables.Ld?.memberships.map((membership) => membership.band).sort()).toEqual([
      "Ch. loans",
      "Interest loans",
      "Loans"
    ]);
    expect(topology.variables.YD?.memberships.map((membership) => membership.band)).toEqual([
      "Wages",
      "Interest on deposits"
    ]);
    expect(topology.variables.rl?.primaryBand).toBe("Interest loans");
    expect(topology.variables.rl?.memberships.map((membership) => membership.band)).toContain(
      "Exogenous"
    );
    expect(topology.variables.K?.primaryBand).toBe("Fixed capital");

    const proxies = buildAccountingProxyNodes(topology);
    expect(proxies.filter((proxy) => proxy.canonicalVariable === "Mh").map((proxy) => proxy.label).sort()).toEqual([
      "Mh",
      "dMh",
      "rm*Mh"
    ]);
    expect(proxies.filter((proxy) => proxy.canonicalVariable === "Ld").map((proxy) => proxy.label).sort()).toEqual([
      "Ld",
      "dLd",
      "rl*Ld"
    ]);
  });
});
