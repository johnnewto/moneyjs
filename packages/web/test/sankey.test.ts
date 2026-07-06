import { runBaseline } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import type { SimulationResult } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import {
  balanceSankeyIntermediateNodes,
  buildSankeyFromIoMatrix,
  buildSankeyFromTransactionFlowMatrix,
  isInputOutputMatrix,
  pruneUnusedSankeyNodes,
  resolveSankeyDiagram
} from "../src/notebook/sankey";
import { computeLayeredSankeyLayout } from "../src/components/sankeyLayout";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";
import type { MatrixCell, SankeyCell } from "../src/notebook/types";

function assertIntermediateNodesBalance(
  nodes: { id: string; group?: string; label: string }[],
  links: { sourceId: string; targetId: string; value: number }[]
): void {
  const intermediateIds = new Set(
    nodes.filter((node) => node.group === "flow" || node.group === "market").map((node) => node.id)
  );

  for (const nodeId of intermediateIds) {
    const incoming = links.filter((link) => link.targetId === nodeId);
    const outgoing = links.filter((link) => link.sourceId === nodeId);
    const inSum = incoming.reduce((total, link) => total + link.value, 0);
    const outSum = outgoing.reduce((total, link) => total + link.value, 0);
    expect(Math.abs(inSum - outSum)).toBeLessThan(1e-6 * Math.max(inSum, outSum, 1));
  }
}

function findLink(
  links: { sourceId: string; targetId: string; value: number }[],
  sourceId: string,
  targetId: string
): { value: number } | undefined {
  return links.find((link) => link.sourceId === sourceId && link.targetId === targetId);
}

describe("sankey diagrams", () => {
  it("auto-generates TFM links from signed matrix entries", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      accountingKind: "transaction-flow",
      columns: ["Households", "Firms", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };

    const diagram = buildSankeyFromTransactionFlowMatrix(matrixCell, null, 0);

    expect(diagram.errors).toEqual([]);
    expect(diagram.links).toEqual([
      expect.objectContaining({
        sourceId: "sector-out:Households",
        targetId: "flow:Consumption",
        value: 1
      }),
      expect.objectContaining({
        sourceId: "flow:Consumption",
        targetId: "sector-in:Firms",
        value: 1
      })
    ]);
  });

  it("auto-generates IO links from intermediate rows", () => {
    const matrixCell: MatrixCell = {
      id: "io",
      type: "matrix",
      title: "IO table",
      accountingKind: "input-output",
      columns: ["Industry 1 demand", "Industry 2 demand", "Final demand", "Output"],
      rows: [
        {
          band: "Intermediate",
          label: "Industry 1 production",
          values: ["x1 * a11 * p1", "x2 * a12 * p1", "d1 * p1", "x1 * p1"]
        },
        {
          band: "Intermediate",
          label: "Industry 2 production",
          values: ["x1 * a21 * p2", "x2 * a22 * p2", "d2 * p2", "x2 * p2"]
        },
        {
          band: "Output",
          label: "Output",
          values: ["x1 * p1", "x2 * p2", "", "x1 * p1 + x2 * p2"]
        }
      ]
    };

    expect(isInputOutputMatrix(matrixCell)).toBe(true);

    const result: SimulationResult = {
      periods: 1,
      series: {
        x1: [10],
        x2: [20],
        p1: [2],
        p2: [3],
        a11: [0.1],
        a12: [0.2],
        a21: [0.3],
        a22: [0.4],
        d1: [5],
        d2: [6]
      },
      metadata: {}
    };

    const diagram = buildSankeyFromIoMatrix(matrixCell, result, 0);

    expect(diagram.errors).toEqual([]);
    expect(diagram.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "io-output:0",
          targetId: "io-market:0",
          value: 20
        }),
        expect.objectContaining({
          sourceId: "io-market:0",
          targetId: "io-inputs:0",
          value: 2
        }),
        expect.objectContaining({
          sourceId: "io-market:0",
          targetId: "io-final-demand:0",
          value: 10
        })
      ])
    );
  });

  it("resolves a sankey cell from the referenced matrix", () => {
    const matrixCell: MatrixCell = {
      id: "transaction-flow",
      type: "matrix",
      title: "TFM",
      accountingKind: "transaction-flow",
      sourceRunCellId: "baseline-run",
      columns: ["Households", "Firms", "Sum"],
      rows: [{ label: "Consumption", values: ["-cons", "+cons", "0"] }]
    };
    const sankeyCell: SankeyCell = {
      id: "tfm-sankey",
      type: "sankey",
      title: "TFM Sankey",
      source: { kind: "matrix", matrixCellId: "transaction-flow" }
    };

    const diagram = resolveSankeyDiagram(
      sankeyCell,
      (cellId) => (cellId === "transaction-flow" ? matrixCell : null),
      () => null,
      0
    );

    expect(diagram.errors).toEqual([]);
    expect(diagram.links.length).toBeGreaterThan(0);
  });

  it("balances imbalanced flow nodes and prunes unused sector nodes", () => {
    const nodes = [
      { id: "sector-out:Households", label: "Households", layer: 0, group: "sector-out" },
      { id: "sector-in:Households", label: "Households", layer: 2, group: "sector-in" },
      { id: "sector-out:Central bank", label: "Central bank", layer: 0, group: "sector-out" },
      { id: "flow:Change in cash", label: "Change in cash", layer: 1, group: "flow" }
    ];
    const links = [
      {
        sourceId: "sector-out:Households",
        targetId: "flow:Change in cash",
        value: 10
      },
      {
        sourceId: "flow:Change in cash",
        targetId: "sector-in:Households",
        value: 7
      }
    ];

    const balanced = balanceSankeyIntermediateNodes(nodes, links);
    const pruned = pruneUnusedSankeyNodes(nodes, balanced);

    expect(balanced[1]?.value).toBeCloseTo(10, 6);
    expect(pruned.nodes.map((node) => node.id)).toEqual([
      "sector-out:Households",
      "sector-in:Households",
      "flow:Change in cash"
    ]);
  });

  it("builds a balanced 3IO-PC TFM sankey at period 5", () => {
    const document = getNotebookTemplateDocument("3io-pc");
    const runCell = document.cells.find((cell) => cell.id === "baseline-run");
    const matrixCell = document.cells.find((cell) => cell.id === "transaction-flow");
    expect(runCell?.type).toBe("run");
    expect(matrixCell?.type).toBe("matrix");
    if (!runCell || runCell.type !== "run" || !matrixCell || matrixCell.type !== "matrix") {
      throw new Error("Missing 3IO-PC baseline run or transaction-flow matrix");
    }

    const editor = buildEditorStateForNotebookModel(document, runCell);
    expect(editor).not.toBeNull();
    if (!editor) {
      throw new Error("Missing editor");
    }

    const modelKey = resolveRunCellModelKey(document.cells, runCell);
    const runtime = buildRuntimeConfig(editor, {
      notebookCells: document.cells,
      modelId: resolveModelIdFromRunCellKey(modelKey) ?? undefined,
      runCellId: runCell.id
    });
    const result = runBaseline(runtime.model, { ...runtime.options, periods: runCell.periods });
    const periodIndex = 4;

    const diagram = buildSankeyFromTransactionFlowMatrix(matrixCell, result, periodIndex);

    expect(diagram.errors).toEqual([]);
    expect(diagram.links.length).toBeGreaterThan(0);
    expect(diagram.nodes.every((node) => diagram.links.some(
      (link) => link.sourceId === node.id || link.targetId === node.id
    ))).toBe(true);
    assertIntermediateNodesBalance(diagram.nodes, diagram.links);

    const consumption = findLink(
      diagram.links,
      "sector-out:Households",
      "flow:Consumption"
    );
    const governmentExpenditure = findLink(
      diagram.links,
      "sector-out:Government",
      "flow:Government expenditure"
    );
    const incomeOut = findLink(diagram.links, "sector-out:Firms", "flow:GDP (income)");
    const incomeIn = findLink(diagram.links, "flow:GDP (income)", "sector-in:Households");
    expect(consumption).toBeDefined();
    expect(governmentExpenditure).toBeDefined();
    expect(incomeOut?.value).toBeCloseTo(
      (consumption?.value ?? 0) + (governmentExpenditure?.value ?? 0),
      6
    );
    expect(incomeIn?.value).toBeCloseTo(incomeOut?.value ?? NaN, 6);

    expect(diagram.nodes.some((node) => node.id === "flow:CB profit")).toBe(false);
    expect(
      findLink(diagram.links, "flow:Interest payments", "sector-in:Central bank")
    ).toBeUndefined();
    expect(
      findLink(diagram.links, "flow:Interest payments", "sector-in:Households")
    ).toBeDefined();

    const layout = computeLayeredSankeyLayout(diagram.nodes, diagram.links, 960, 480);
    expect(layout.links.every((link) => link.path.length > 0)).toBe(true);
    expect(layout.links.every((link) => link.strokeWidth > 0)).toBe(true);
    expect(layout.nodes.every((node) => node.height >= 0)).toBe(true);
  });
});
