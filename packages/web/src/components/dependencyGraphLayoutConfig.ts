import type { DerivedAccountingTerm } from "../notebook/dependencyRows";

export const SIDE_PADDING = 54;
export const TOP_PADDING = 72;
export const BOTTOM_PADDING = 40;
export const NODE_WIDTH = 56;
export const NODE_HEIGHT = 40;
export const COLUMN_GAP = 188;
export const MATRIX_SURFACE_GAP = 268;
export const MATRIX_SURFACE_CELL_HALF_WIDTH = 96;
export const ROW_GAP = 84;
export const STRIP_INNER_GAP = 34;
export const STRIP_PADDING_X = 24;
export const STRIP_MIN_WIDTH = 212;
export const HORIZONTAL_BAND_HEIGHT = 148;
export const HORIZONTAL_BAND_GAP = 18;
export const HORIZONTAL_LABEL_X = 22;
export const RELAXATION_ITERATIONS = 48;
export const DIAGNOSTIC_BOX_INSET_X = 6;
export const DIAGNOSTIC_BOX_INSET_Y = 5;

export const BAND_COLORS = [
  { fill: "rgba(236, 253, 245, 0.7)", stroke: "rgba(16, 185, 129, 0.28)" },
  { fill: "rgba(239, 246, 255, 0.74)", stroke: "rgba(59, 130, 246, 0.24)" },
  { fill: "rgba(255, 247, 237, 0.8)", stroke: "rgba(249, 115, 22, 0.24)" },
  { fill: "rgba(248, 250, 252, 0.9)", stroke: "rgba(100, 116, 139, 0.24)" }
] as const;

export const PROXY_KIND_PRIORITY: Record<DerivedAccountingTerm["proxyKind"], number> = {
  stock: 0,
  change: 1,
  "row-expression": 2,
  interest: 3
};
