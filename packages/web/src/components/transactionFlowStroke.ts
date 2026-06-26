type TransactionFlowStrokeScale = "log" | "linear";

export interface TransactionFlowStrokePreset {
  strokeMin: number;
  strokeMax: number;
  scale: TransactionFlowStrokeScale;
  markerMin?: number;
  markerFactor?: number;
  markerMax?: number;
  /** When set, marker size is stroke width plus this offset (no cap). */
  markerOffset?: number;
}

export const SWIMLANE_FLOW_STROKE_PRESET: TransactionFlowStrokePreset = {
  strokeMin: 2.5,
  strokeMax: 9,
  scale: "log",
  markerMin: 8,
  markerFactor: 4
};

export const LIFELINES_FLOW_STROKE_PRESET: TransactionFlowStrokePreset = {
  strokeMin: 2.5,
  strokeMax: 10.5,
  scale: "linear",
  markerMin: 7,
  markerFactor: 2.1
};

export const MULTIPORT_FLOW_STROKE_PRESET: TransactionFlowStrokePreset = {
  strokeMin: 2.5,
  strokeMax: 10.5,
  scale: "linear",
  markerOffset: 5
};

/** Log- or linear-scaled line weight; dominant flows read thicker without huge arrows. */
export function computeTransactionFlowStrokeWidth(
  magnitude: number | undefined,
  maxMagnitude: number,
  preset: TransactionFlowStrokePreset
): number {
  if (magnitude == null || !Number.isFinite(magnitude) || maxMagnitude <= 0) {
    return preset.strokeMin;
  }
  const normalized =
    preset.scale === "log"
      ? Math.min(1, Math.log1p(Math.abs(magnitude)) / Math.log1p(maxMagnitude))
      : Math.min(1, Math.abs(magnitude) / maxMagnitude);
  return preset.strokeMin + normalized * (preset.strokeMax - preset.strokeMin);
}

/** React Flow ArrowClosed uses a ~5u-wide glyph in a 20u viewBox (see @xyflow/react Marker). */
const REACT_FLOW_ARROW_CLOSED_GLYPH_WIDTH_FRACTION = 5 / 20;

export function computeTransactionFlowMarkerSize(
  strokeWidth: number,
  preset: TransactionFlowStrokePreset
): number {
  if (preset.markerOffset != null) {
    return strokeWidth + preset.markerOffset;
  }
  const scaled = Math.max(preset.markerMin ?? 0, (preset.markerFactor ?? 1) * strokeWidth);
  return preset.markerMax == null ? scaled : Math.min(preset.markerMax, scaled);
}

/** Map desired arrowhead size to React Flow markerWidth/Height for ArrowClosed. */
export function computeReactFlowClosedMarkerSize(
  strokeWidth: number,
  preset: TransactionFlowStrokePreset
): number {
  const visualSize = computeTransactionFlowMarkerSize(strokeWidth, preset);
  return visualSize / REACT_FLOW_ARROW_CLOSED_GLYPH_WIDTH_FRACTION;
}
