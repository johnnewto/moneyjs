import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../src/notebook/dependencyGraph";
import {
  buildAccountingProxyNodes,
  buildAccountingReferenceLabel,
  buildCompactProxyLabel,
  buildDependencyRowTopology
} from "../src/notebook/dependencyRows";
import type { NotebookCell, SequenceCell } from "../src/notebook/types";

describe("dependency row topology", () => {
  it("compacts current-minus-lag stock expressions into change and interest proxy labels", () => {
    expect(buildCompactProxyLabel("Bs", "r * Bs", "interest")).toBe("r*Bs");
    expect(buildAccountingReferenceLabel("Bs", "lag(r) * lag(Bs)", "interest")).toBe("r*Bs");
    expect(buildCompactProxyLabel("Hs", "Hs - lag(Hs)", "change")).toBe("dHs");
    expect(buildAccountingReferenceLabel("Hs", "Hs - Hs[-1]", "change")).toBe("dHs");
  });

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
    expect(topology.variables.Mh?.memberships.map((membership) => membership.band)).toEqual(["Money deposits"]);
    expect(topology.variables.Ld?.memberships.map((membership) => membership.band)).toEqual(["Loans"]);
    expect(topology.variables.YD?.memberships.map((membership) => membership.band)).toEqual([
      "Wages",
      "Interest on deposits"
    ]);
    expect(topology.variables.rl?.primaryBand).toBe("Exogenous");
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

    const groupedTopology = buildDependencyRowTopology({
      bandGrouping: "family",
      cells,
      dependencyCell,
      graph
    });

    expect(groupedTopology.variables.Mh?.primaryBand).toBe("Money deposits");
    expect(new Set(groupedTopology.variables.Mh?.memberships.map((membership) => membership.band))).toEqual(
      new Set(["Money deposits"])
    );
    expect(
      groupedTopology.variables.Mh?.memberships.map((membership) => membership.originalBand).sort()
    ).toEqual(["Money deposits"]);
    expect(groupedTopology.variables.Ld?.primaryBand).toBe("Loans");
    expect(new Set(groupedTopology.variables.Ld?.memberships.map((membership) => membership.band))).toEqual(
      new Set(["Loans"])
    );
    expect(
      groupedTopology.variables.Ld?.memberships.map((membership) => membership.originalBand).sort()
    ).toEqual(["Loans"]);

    const groupedProxies = buildAccountingProxyNodes(groupedTopology);
    expect(
      groupedProxies
        .filter((proxy) => proxy.canonicalVariable === "Ld")
        .map((proxy) => proxy.band)
    ).toEqual(["Loans", "Interest loans", "Ch. loans"]);

    const gl6Cells: NotebookCell[] = [
      {
        id: "balance-sheet-dis",
        type: "matrix",
        title: "DIS balance sheet",
        columns: ["Households", "Production firms", "Banks", "Sum"],
        rows: [
          { label: "Money", values: ["+Mh", "", "-Ms", "0"] },
          { label: "Loans", values: ["", "-Ld", "+Ls", "0"] },
          { label: "Inventories", values: ["", "+INV", "", "+INV"] }
        ]
      },
      {
        id: "transaction-flow-dis",
        type: "matrix",
        title: "DIS transactions-flow matrix",
        columns: ["Households", "Firms_current", "Firms_capital", "Banks_current", "Banks_capital"],
        rows: [
          { label: "Consumption", values: ["-C", "+C", "", "", ""] },
          { label: "Ch. Inventories", values: ["", "+d(INV)", "-d(INV)", "", ""] },
          { label: "Entrepreneurial Profits", values: ["+EF", "-EF", "", "", ""] },
          { label: "Banks profits", values: ["+EFb", "", "", "-EFb", ""] }
        ]
      },
      {
        id: "equations-dis",
        type: "equations",
        title: "DIS model",
        modelId: "equations-dis",
        equations: [
          { id: "eq-inv-level", name: "INV", expression: "inv * UC" },
          { id: "eq-inv-stock", name: "inv", expression: "lag(inv) + (y - s)" },
          { id: "eq-ef", name: "EF", expression: "S - WB" },
          { id: "eq-efb", name: "EFb", expression: "lag(rl) * lag(Ls) - lag(rm) * lag(Mh)" }
        ]
      }
    ];
    const gl6DependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph-dis",
      type: "sequence",
      title: "DIS equation dependency graph",
      source: { kind: "dependency", modelId: "equations-dis" }
    };
    const gl6Graph = buildDependencyGraph({
      equations: gl6Cells.find((cell) => cell.id === "equations-dis" && cell.type === "equations")!.equations,
      externals: [],
      initialValues: []
    });

    const groupedDisTopology = buildDependencyRowTopology({
      bandGrouping: "family",
      cells: gl6Cells,
      dependencyCell: gl6DependencyCell,
      graph: gl6Graph
    });

    expect(groupedDisTopology.variables.INV?.primaryBand).toBe("Inventories");
    expect(
      new Set(groupedDisTopology.variables.INV?.memberships.map((membership) => membership.band))
    ).toEqual(new Set(["Inventories"]));
    expect(
      groupedDisTopology.variables.INV?.memberships.map((membership) => membership.originalBand).sort()
    ).toEqual(["Inventories"]);
    expect(groupedDisTopology.variables.EF?.primaryBand).toBe("Entrepreneurial Profits");
    expect(groupedDisTopology.variables.EFb?.primaryBand).toBe("Banks profits");
    expect(
      groupedDisTopology.variables.EF?.memberships.map((membership) => membership.originalBand)
    ).toEqual(["Entrepreneurial Profits"]);
    expect(
      groupedDisTopology.variables.EFb?.memberships.map((membership) => membership.originalBand)
    ).toEqual(["Banks profits"]);
  });

  it("prefers row.band over row.label for authoritative accounting bands", () => {
    const cells: NotebookCell[] = [
      {
        id: "transaction-flow-band-authority",
        type: "matrix",
        title: "Band authority matrix",
        columns: ["Households", "Banks", "Sum"],
        rows: [{ band: "Funding", label: "Money deposits", values: ["+Mh", "-Ms", "0"] }]
      },
      {
        id: "equations-band-authority",
        type: "equations",
        title: "Band authority model",
        modelId: "band-authority-model",
        equations: [
          { id: "eq-mh", name: "Mh", expression: "lag(Mh)" },
          { id: "eq-ms", name: "Ms", expression: "lag(Ms)" }
        ]
      }
    ];
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph-band-authority",
      type: "sequence",
      title: "Band authority dependency graph",
      source: { kind: "dependency", modelId: "band-authority-model" }
    };

    const graph = buildDependencyGraph({
      equations: cells.find((cell) => cell.id === "equations-band-authority" && cell.type === "equations")!
        .equations,
      externals: [],
      initialValues: []
    });

    const rawTopology = buildDependencyRowTopology({
      bandGrouping: "none",
      cells,
      dependencyCell,
      graph
    });

    expect(rawTopology.variables.Mh?.primaryBand).toBe("Funding");
    expect(rawTopology.variables.Ms?.primaryBand).toBe("Funding");
    expect(new Set(rawTopology.variables.Mh?.memberships.map((membership) => membership.originalBand))).toEqual(
      new Set(["Funding"])
    );
  });

  it("treats an empty row.band as unmapped instead of falling back to the label", () => {
    const cells: NotebookCell[] = [
      {
        id: "transaction-flow-empty-band",
        type: "matrix",
        title: "Empty band matrix",
        columns: ["Households", "Banks", "Sum"],
        rows: [{ band: "", label: "Money deposits", values: ["+Mh", "-Ms", "0"] }]
      },
      {
        id: "equations-empty-band",
        type: "equations",
        title: "Empty band model",
        modelId: "empty-band-model",
        equations: [
          { id: "eq-mh", name: "Mh", expression: "lag(Mh)" },
          { id: "eq-ms", name: "Ms", expression: "lag(Ms)" }
        ]
      }
    ];
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph-empty-band",
      type: "sequence",
      title: "Empty band dependency graph",
      source: { kind: "dependency", modelId: "empty-band-model" }
    };

    const graph = buildDependencyGraph({
      equations: cells.find((cell) => cell.id === "equations-empty-band" && cell.type === "equations")!
        .equations,
      externals: [],
      initialValues: []
    });

    const topology = buildDependencyRowTopology({
      bandGrouping: "none",
      cells,
      dependencyCell,
      graph
    });

    expect(topology.variables.Mh?.primaryBand).toBe("Unmapped");
    expect(topology.variables.Ms?.primaryBand).toBe("Unmapped");
    expect(new Set(topology.variables.Mh?.memberships.map((membership) => membership.originalBand))).toEqual(
      new Set(["Unmapped"])
    );
  });
});
