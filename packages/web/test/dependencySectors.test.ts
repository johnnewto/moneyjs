import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../src/notebook/dependencyGraph";
import { buildDependencySectorTopology } from "../src/notebook/dependencySectors";
import type { NotebookCell, SequenceCell } from "../src/notebook/types";

describe("dependency sector topology", () => {
  it("autodiscovers transaction and balance matrices to map BMW sectors", () => {
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
          { id: "eq-cd", name: "Cd", expression: "Y" },
          { id: "eq-is", name: "Is", expression: "Id" },
          { id: "eq-ls", name: "Ls", expression: "lag(Ls) + d(Ld) * dt" },
          { id: "eq-y", name: "Y", expression: "Cs + Is" },
          { id: "eq-ld", name: "Ld", expression: "lag(Ld) + Id * dt" },
          { id: "eq-mh", name: "Mh", expression: "lag(Mh) + (Y - Cd) * dt" },
          { id: "eq-ms", name: "Ms", expression: "lag(Ms) + d(Ls) * dt" },
          { id: "eq-rm", name: "rm", expression: "spread" }
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
        { id: "ext-spread", name: "spread", kind: "constant", valueText: "0.01" }
      ],
      initialValues: []
    });
    const topology = buildDependencySectorTopology({ cells, dependencyCell, graph });

    expect(topology.variables.rl).toMatchObject({ sector: "Exogenous", source: "explicit" });
    expect(topology.variables.rm?.sector).toBe("Unmapped");
    expect(topology.variables.Cd?.sector).toBe("Firms");
    expect(topology.variables.Mh?.sector).toBe("Households");
    expect(topology.variables.Ls).toMatchObject({
      sector: "Banks",
      source: "balance-matrix",
      accountKind: "stock"
    });
  });

  it("treats an empty sector entry as unmapped instead of falling back to the column label", () => {
    const cells: NotebookCell[] = [
      {
        id: "transaction-flow-empty-sector",
        type: "matrix",
        title: "Empty sector flow matrix",
        columns: ["Households", "Banks_current", "Sum"],
        sectors: ["Households", "", ""],
        rows: [{ label: "Flow", values: ["-Hh", "+Xs", "0"] }]
      },
      {
        id: "equations-empty-sector",
        type: "equations",
        title: "Empty sector model",
        modelId: "empty-sector-model",
        equations: [
          { id: "eq-hh", name: "Hh", expression: "lag(Hh)" },
          { id: "eq-xs", name: "Xs", expression: "lag(Xs)" }
        ]
      }
    ];
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph-empty-sector",
      type: "sequence",
      title: "Empty sector dependency graph",
      source: { kind: "dependency", modelId: "empty-sector-model" }
    };

    const graph = buildDependencyGraph({
      equations: cells.find((cell) => cell.id === "equations-empty-sector" && cell.type === "equations")!
        .equations,
      externals: [],
      initialValues: []
    });
    const topology = buildDependencySectorTopology({ cells, dependencyCell, graph });

    expect(topology.variables.Hh?.sector).toBe("Households");
    expect(topology.variables.Xs?.sector).toBe("Unmapped");
  });

  it("can map strips directly from columns instead of sectors", () => {
    const cells: NotebookCell[] = [
      {
        id: "transaction-flow-columns",
        type: "matrix",
        title: "Columns flow matrix",
        columns: ["Households", "Custom_current", "Custom_capital", "Sum"],
        sectors: ["Households", "Custom", "Custom", ""],
        rows: [{ label: "Flow", values: ["-Hh", "+Xc", "+Xk", "0"] }]
      },
      {
        id: "equations-columns",
        type: "equations",
        title: "Columns sectors model",
        modelId: "columns-sectors-model",
        equations: [
          { id: "eq-hh", name: "Hh", expression: "lag(Hh)" },
          { id: "eq-xc", name: "Xc", expression: "lag(Xc)" },
          { id: "eq-xk", name: "Xk", expression: "lag(Xk)" }
        ]
      }
    ];
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph-columns",
      type: "sequence",
      title: "Columns dependency graph",
      source: { kind: "dependency", modelId: "columns-sectors-model", stripSectorSource: "columns" }
    };

    const graph = buildDependencyGraph({
      equations: cells.find((cell) => cell.id === "equations-columns" && cell.type === "equations")!
        .equations,
      externals: [],
      initialValues: []
    });
    const topology = buildDependencySectorTopology({ cells, dependencyCell, graph });

    expect(topology.variables.Xc?.sector).toBe("Custom current");
    expect(topology.variables.Xk?.sector).toBe("Custom capital");
  });

  it("can map strips directly from sectors without falling back to columns", () => {
    const cells: NotebookCell[] = [
      {
        id: "transaction-flow-sectors",
        type: "matrix",
        title: "Sectors flow matrix",
        columns: ["Households", "Custom_current", "Custom_capital", "Sum"],
        sectors: ["Households", "Custom", "", ""],
        rows: [{ label: "Flow", values: ["-Hh", "+Xc", "+Xk", "0"] }]
      },
      {
        id: "equations-sectors",
        type: "equations",
        title: "Direct sectors model",
        modelId: "direct-sectors-model",
        equations: [
          { id: "eq-hh", name: "Hh", expression: "lag(Hh)" },
          { id: "eq-xc", name: "Xc", expression: "lag(Xc)" },
          { id: "eq-xk", name: "Xk", expression: "lag(Xk)" }
        ]
      }
    ];
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph-sectors",
      type: "sequence",
      title: "Sectors dependency graph",
      source: { kind: "dependency", modelId: "direct-sectors-model", stripSectorSource: "sectors" }
    };

    const graph = buildDependencyGraph({
      equations: cells.find((cell) => cell.id === "equations-sectors" && cell.type === "equations")!
        .equations,
      externals: [],
      initialValues: []
    });
    const topology = buildDependencySectorTopology({ cells, dependencyCell, graph });

    expect(topology.variables.Xc?.sector).toBe("Custom");
    expect(topology.variables.Xk?.sector).toBe("Unmapped");
  });
});
