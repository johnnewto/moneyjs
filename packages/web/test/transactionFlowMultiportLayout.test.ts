import { describe, expect, it } from "vitest";

import { buildTransactionFlowMultiportLayout } from "../src/components/transactionFlowMultiportLayout";
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
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null);

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
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null);

    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({
      source: "B",
      target: "A",
      sourceHandle: "left-0",
      targetHandle: "right-0",
      animated: true
    });
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
