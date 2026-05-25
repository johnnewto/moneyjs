import { describe, expect, it } from "vitest";

import { buildMultiportParticipantStocks } from "../src/components/multiportParticipantStocks";
import { buildTransactionFlowMultiportLayout } from "../src/components/transactionFlowMultiportLayout";
import { applyParticipantColumnOrder } from "../src/components/transactionFlowMultiportOrder";
import { buildSequenceDiagramFromMatrix } from "../src/notebook/sequence";
import type { MatrixCell } from "../src/notebook/types";

describe("transactionFlowMultiportLayout", () => {
  it("assigns rightward flows to right-to-left handles", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Payment", values: ["-a", "+b", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null, true);

    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({
      source: "A",
      target: "B",
      sourceHandle: "right-0",
      targetHandle: "left-0",
      animated: true
    });
    expect(layout.edges[0]?.label).toBeUndefined();
  });

  it("assigns leftward flows to left-to-right handles", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Refund", values: ["+a", "-b", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null, true);

    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({
      source: "B",
      target: "A",
      sourceHandle: "left-0",
      targetHandle: "right-0",
      animated: true
    });
  });

  it("does not animate edges by default", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Payment", values: ["-a", "+b", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null);

    expect(layout.edges[0]?.animated).toBe(false);
  });

  it("flips handle sides when view-local column order reverses participants", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Payment", values: ["-a", "+b", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const reordered = applyParticipantColumnOrder(diagram, ["B", "A"]);
    const layout = buildTransactionFlowMultiportLayout(reordered, reordered.steps.length, null);

    expect(layout.edges[0]).toMatchObject({
      source: "A",
      target: "B",
      sourceHandle: "left-0",
      targetHandle: "right-0"
    });
  });

  it("attaches stock footers to participant nodes", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Deposits", values: ["-d(Mh)", "+d(Ms)", "0"] },
        { label: "Payment", values: ["-a", "+b", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const stocks = buildMultiportParticipantStocks(matrixCell, null, null, 0);
    const layout = buildTransactionFlowMultiportLayout(
      diagram,
      diagram.steps.length,
      null,
      false,
      stocks
    );
    const nodeA = layout.nodes.find((node) => node.id === "A");
    const nodeData = nodeA?.data as { stocks?: Array<{ displayName: string }> };

    expect(nodeData?.stocks).toEqual([
      expect.objectContaining({ displayName: "-Mh" })
    ]);
  });

  it("renders note nodes instead of edges for ambiguous multi-party rows", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "C", "D"],
      rows: [
        { label: "Split", values: ["-a", "-b", "+c", "+d"] },
        { label: "Sum", values: ["0", "0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null);

    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes.some((node) => node.type === "matrixMultiportNote")).toBe(true);
  });
});
