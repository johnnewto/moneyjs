import { describe, expect, it } from "vitest";

import type { SimulationResult } from "@sfcr/core";

import { buildMultiportParticipantStocks } from "../src/components/multiportParticipantStocks";
import {
  buildTransactionFlowMultiportLayout,
  type MatrixMultiportEdgeData
} from "../src/components/transactionFlowMultiportLayout";
import {
  computeReactFlowClosedMarkerSize,
  computeTransactionFlowMarkerSize,
  computeTransactionFlowStrokeWidth,
  MULTIPORT_FLOW_STROKE_PRESET
} from "../src/components/transactionFlowStroke";
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
      animated: true,
      markerEnd: expect.objectContaining({
        width: computeReactFlowClosedMarkerSize(2.5, MULTIPORT_FLOW_STROKE_PRESET),
        height: computeReactFlowClosedMarkerSize(2.5, MULTIPORT_FLOW_STROKE_PRESET),
        markerUnits: "userSpaceOnUse"
      })
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

  it("uses log-scaled stroke width from runtime magnitudes", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      sourceRunCellId: "run-1",
      columns: ["Households", "Firms", "Banks", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "", "0"] },
        { label: "Interest", values: ["", "-IntD", "+IntS", "0"] },
        { label: "Sum", values: ["0", "0", "0", "0"] }
      ]
    };
    const result: SimulationResult = {
      series: {
        Cd: new Float64Array([10]),
        Cs: new Float64Array([10]),
        IntD: new Float64Array([100]),
        IntS: new Float64Array([100])
      },
      blocks: [],
      model: { equations: [], externals: {}, initialValues: {} },
      options: {
        periods: 1,
        solverMethod: "NEWTON",
        tolerance: 1e-6,
        maxIterations: 40
      }
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, result, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null);

    expect(layout.edges).toHaveLength(2);
    const consumption = layout.edges.find((edge) => edge.source === "Households");
    const interest = layout.edges.find((edge) => edge.source === "Firms");
    const consumptionData = consumption?.data as MatrixMultiportEdgeData | undefined;
    const interestData = interest?.data as MatrixMultiportEdgeData | undefined;

    expect(consumptionData?.strokeWidth).toBeLessThan(interestData?.strokeWidth ?? 0);
    expect(interestData?.strokeWidth).toBe(
      computeTransactionFlowStrokeWidth(100, 100, MULTIPORT_FLOW_STROKE_PRESET)
    );
    expect(consumption?.style).toMatchObject({
      strokeWidth: computeTransactionFlowStrokeWidth(10, 100, MULTIPORT_FLOW_STROKE_PRESET)
    });
    expect(interest?.markerEnd).toMatchObject({
      width: computeReactFlowClosedMarkerSize(
        computeTransactionFlowStrokeWidth(100, 100, MULTIPORT_FLOW_STROKE_PRESET),
        MULTIPORT_FLOW_STROKE_PRESET
      ),
      height: computeReactFlowClosedMarkerSize(
        computeTransactionFlowStrokeWidth(100, 100, MULTIPORT_FLOW_STROKE_PRESET),
        MULTIPORT_FLOW_STROKE_PRESET
      )
    });
  });

  it("falls back to minimum stroke width when magnitudes are unavailable", () => {
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
    const edgeData = layout.edges[0]?.data as MatrixMultiportEdgeData | undefined;

    expect(edgeData?.strokeWidth).toBe(
      computeTransactionFlowStrokeWidth(undefined, 0, MULTIPORT_FLOW_STROKE_PRESET)
    );
    expect(layout.edges[0]?.style).toMatchObject({ strokeWidth: 2.5 });
  });

  it("bumps stroke width when a flow is highlighted", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      sourceRunCellId: "run-1",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Payment", values: ["-a", "+b", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const result: SimulationResult = {
      series: { a: new Float64Array([50]), b: new Float64Array([50]) },
      blocks: [],
      model: { equations: [], externals: {}, initialValues: {} },
      options: {
        periods: 1,
        solverMethod: "NEWTON",
        tolerance: 1e-6,
        maxIterations: 40
      }
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, result, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, 0);
    const edgeData = layout.edges[0]?.data as MatrixMultiportEdgeData | undefined;

    expect(edgeData?.strokeWidth).toBe(
      computeTransactionFlowStrokeWidth(50, 50, MULTIPORT_FLOW_STROKE_PRESET) + 1
    );
  });

  it("scales capital-flow dash patterns with stroke width", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      sourceRunCellId: "run-1",
      columns: ["A", "B", "Sum"],
      rows: [
        { label: "Investment", values: ["-inv", "+cap", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const result: SimulationResult = {
      series: { inv: new Float64Array([25]), cap: new Float64Array([25]) },
      blocks: [],
      model: { equations: [], externals: {}, initialValues: {} },
      options: {
        periods: 1,
        solverMethod: "NEWTON",
        tolerance: 1e-6,
        maxIterations: 40
      }
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, result, 0);
    const layout = buildTransactionFlowMultiportLayout(diagram, diagram.steps.length, null);
    const strokeWidth = (layout.edges[0]?.style as { strokeWidth?: number } | undefined)?.strokeWidth;

    expect(strokeWidth).toBeGreaterThan(2.5);
    expect(layout.edges[0]?.style).toMatchObject({
      strokeDasharray: `${Math.round(8 * (strokeWidth! / MULTIPORT_FLOW_STROKE_PRESET.strokeMin))} ${Math.round(5 * (strokeWidth! / MULTIPORT_FLOW_STROKE_PRESET.strokeMin))}`
    });
  });
});
