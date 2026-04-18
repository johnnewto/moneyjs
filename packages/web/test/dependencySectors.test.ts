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

  it("groups whitelisted sector families and aliases when requested", () => {
    const cells: NotebookCell[] = [
      {
        id: "transaction-flow",
        type: "matrix",
        title: "Alias sectors flow matrix",
        columns: ["CB", "Central bank", "Treasury", "Banks_current", "Banks_capital", "Sum"],
        rows: [
          { label: "Reserves", values: ["+Rcb", "+Rb", "", "", "", "0"] },
          { label: "Bills", values: ["", "+Bcb", "+Bt", "", "", "0"] },
          { label: "Deposits", values: ["", "", "", "+Ms", "+Ls", "0"] }
        ]
      },
      {
        id: "equations",
        type: "equations",
        title: "Grouped sectors model",
        modelId: "grouped-sectors-model",
        equations: [
          { id: "eq-rcb", name: "Rcb", expression: "lag(Rcb)" },
          { id: "eq-rb", name: "Rb", expression: "lag(Rb)" },
          { id: "eq-bcb", name: "Bcb", expression: "lag(Bcb)" },
          { id: "eq-bt", name: "Bt", expression: "lag(Bt)" },
          { id: "eq-ms", name: "Ms", expression: "lag(Ms)" },
          { id: "eq-ls", name: "Ls", expression: "lag(Ls)" }
        ]
      }
    ];
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      id: "equation-dependency-graph",
      type: "sequence",
      title: "Grouped sectors dependency graph",
      source: { kind: "dependency", modelId: "grouped-sectors-model", sectorGrouping: "family" }
    };

    const graph = buildDependencyGraph({
      equations: cells.find((cell) => cell.id === "equations" && cell.type === "equations")!.equations,
      externals: [],
      initialValues: []
    });
    const topology = buildDependencySectorTopology({ cells, dependencyCell, graph });

    expect(topology.variables.Rcb?.sector).toBe("Central bank");
    expect(topology.variables.Rb?.sector).toBe("Central bank");
    expect(topology.variables.Bcb?.sector).toBe("Central bank");
    expect(topology.variables.Bt?.sector).toBe("Treasury");
    expect(topology.variables.Ms?.sector).toBe("Banks");
    expect(topology.variables.Ls?.sector).toBe("Banks");
  });
});
