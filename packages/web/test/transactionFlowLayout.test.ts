import { describe, expect, it } from "vitest";

import {
  buildTransactionFlowLayout,
  computeFlowArrowMarkerSize,
  computeFlowStrokeWidth,
  FLOW_ARROW_MARKER_MIN,
  FLOW_ARROW_MARKER_STROKE_FACTOR
} from "../src/components/transactionFlowLayout";
import {
  computeTransactionFlowStrokeWidth,
  SWIMLANE_FLOW_STROKE_PRESET
} from "../src/components/transactionFlowStroke";
import { buildSequenceDiagramFromMatrix } from "../src/notebook/sequence";
import type { MatrixCell } from "../src/notebook/types";

describe("transactionFlowLayout", () => {
  it("uses log-scaled stroke width with a capped maximum", () => {
    expect(computeFlowStrokeWidth(undefined, 100)).toBe(2.5);
    expect(computeFlowStrokeWidth(0, 100)).toBeCloseTo(2.5, 5);
    expect(computeFlowStrokeWidth(1, 100)).toBeLessThan(computeFlowStrokeWidth(100, 100));
    expect(computeFlowStrokeWidth(100, 100)).toBe(9);
    expect(computeFlowStrokeWidth(1000, 100)).toBe(9);
    expect(computeTransactionFlowStrokeWidth(100, 100, SWIMLANE_FLOW_STROKE_PRESET)).toBe(9);
  });

  it("sizes arrowheads as max(8px, 4× stroke width)", () => {
    expect(computeFlowArrowMarkerSize(1)).toBe(FLOW_ARROW_MARKER_MIN);
    expect(computeFlowArrowMarkerSize(2)).toBe(FLOW_ARROW_MARKER_MIN);
    expect(computeFlowArrowMarkerSize(3)).toBe(4 * 3);
    expect(computeFlowArrowMarkerSize(9)).toBe(4 * 9);
  });

  it("places hub-row flows on the matching swimlane row", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["Households", "Firms", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };

    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const layout = buildTransactionFlowLayout(diagram, diagram.steps.length, null);

    expect(diagram.steps[0]).toMatchObject({ type: "message", rowIndex: 0 });
    expect(layout.nodes.filter((node) => node.type === "matrixColumn")).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]?.source).toBe("Households");
    expect(layout.edges[0]?.target).toBe("Firms");
    const rowLane = layout.nodes.find((node) => node.type === "matrixRowLane");
    expect(rowLane?.width).toBeLessThanOrEqual(layout.width);
    expect(rowLane?.width).toBe(layout.width);
    expect(rowLane?.data).toMatchObject({ rowLabel: "Consumption" });
    const edgeData = layout.edges[0]?.data as { sourceX?: number; targetX?: number };
    expect(edgeData?.sourceX).toBe(120 + 72);
    expect(edgeData?.targetX).toBe(120 + 190 + 72);
  });

  it("renders a note lane for multi-source multi-target rows", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "C", "D"],
      rows: [
        { label: "Split", values: ["-a", "-b", "+c", "+d"] },
        { label: "Sum", values: ["0", "0", "0", "0", "0"] }
      ]
    };

    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const layout = buildTransactionFlowLayout(diagram, diagram.steps.length, null);

    expect(diagram.steps[0]?.type).toBe("note");
    expect(layout.nodes.some((node) => node.type === "matrixNote")).toBe(true);
    expect(layout.edges).toHaveLength(0);
  });

  it("reveals flows incrementally with visibleStepCount", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["Households", "Firms", "Banks", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "", "0"] },
        { label: "Interest", values: ["", "-rl * Ld", "+rl * Ls", "0"] },
        { label: "Sum", values: ["0", "0", "0", "0"] }
      ]
    };

    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const partial = buildTransactionFlowLayout(diagram, 1, null);
    const full = buildTransactionFlowLayout(diagram, diagram.steps.length, null);

    expect(partial.edges).toHaveLength(1);
    expect(full.edges).toHaveLength(2);
  });
});
