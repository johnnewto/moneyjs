import { describe, expect, it } from "vitest";

import {
  computeReactFlowClosedMarkerSize,
  computeTransactionFlowMarkerSize,
  computeTransactionFlowStrokeWidth,
  LIFELINES_FLOW_STROKE_PRESET,
  MULTIPORT_FLOW_STROKE_PRESET,
  SWIMLANE_FLOW_STROKE_PRESET
} from "../src/components/transactionFlowStroke";

describe("transactionFlowStroke", () => {
  it("uses log-scaled swimlane stroke width with a capped maximum", () => {
    expect(computeTransactionFlowStrokeWidth(undefined, 100, SWIMLANE_FLOW_STROKE_PRESET)).toBe(2.5);
    expect(computeTransactionFlowStrokeWidth(0, 100, SWIMLANE_FLOW_STROKE_PRESET)).toBeCloseTo(2.5, 5);
    expect(
      computeTransactionFlowStrokeWidth(1, 100, SWIMLANE_FLOW_STROKE_PRESET)
    ).toBeLessThan(computeTransactionFlowStrokeWidth(100, 100, SWIMLANE_FLOW_STROKE_PRESET));
    expect(computeTransactionFlowStrokeWidth(100, 100, SWIMLANE_FLOW_STROKE_PRESET)).toBe(9);
  });

  it("sizes swimlane arrowheads as max(8px, 4× stroke width)", () => {
    expect(computeTransactionFlowMarkerSize(1, SWIMLANE_FLOW_STROKE_PRESET)).toBe(8);
    expect(computeTransactionFlowMarkerSize(3, SWIMLANE_FLOW_STROKE_PRESET)).toBe(12);
    expect(computeTransactionFlowMarkerSize(9, SWIMLANE_FLOW_STROKE_PRESET)).toBe(36);
  });

  it("uses stroke plus 5 for multiport markers", () => {
    expect(computeTransactionFlowMarkerSize(2.5, MULTIPORT_FLOW_STROKE_PRESET)).toBe(7.5);
    expect(computeTransactionFlowMarkerSize(6.5, MULTIPORT_FLOW_STROKE_PRESET)).toBe(11.5);
    expect(computeTransactionFlowMarkerSize(10.5, MULTIPORT_FLOW_STROKE_PRESET)).toBe(15.5);
  });

  it("scales React Flow ArrowClosed markers to match visual stroke-plus-5 size", () => {
    expect(computeReactFlowClosedMarkerSize(10.5, MULTIPORT_FLOW_STROKE_PRESET)).toBe(62);
    expect(computeReactFlowClosedMarkerSize(2.5, MULTIPORT_FLOW_STROKE_PRESET)).toBe(30);
  });

  it("uses linear-scaled lifelines stroke width", () => {
    expect(computeTransactionFlowStrokeWidth(undefined, 100, LIFELINES_FLOW_STROKE_PRESET)).toBe(2.5);
    expect(computeTransactionFlowStrokeWidth(50, 100, LIFELINES_FLOW_STROKE_PRESET)).toBeCloseTo(6.5, 5);
    expect(computeTransactionFlowStrokeWidth(100, 100, LIFELINES_FLOW_STROKE_PRESET)).toBe(10.5);
  });

  it("sizes lifelines arrowheads as max(7px, 2.1× stroke width)", () => {
    expect(computeTransactionFlowMarkerSize(2, LIFELINES_FLOW_STROKE_PRESET)).toBe(7);
    expect(computeTransactionFlowMarkerSize(5, LIFELINES_FLOW_STROKE_PRESET)).toBeCloseTo(10.5, 5);
  });
});
