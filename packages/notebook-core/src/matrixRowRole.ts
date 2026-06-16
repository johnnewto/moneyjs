import type { MatrixCell } from "./types";

export type MatrixRowRole = "flow" | "initial";

function normalizeMatrixRowLabelKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function inferMatrixRowRoleFromLabels(band?: string, label?: string): MatrixRowRole | undefined {
  const bandKey = band ? normalizeMatrixRowLabelKey(band) : "";
  const labelKey = label ? normalizeMatrixRowLabelKey(label) : "";
  if (bandKey === "initial" || labelKey === "initialvalues" || labelKey === "initialvalue") {
    return "initial";
  }
  return undefined;
}

export function normalizeMatrixRowRole(input: unknown): MatrixRowRole | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const key = input.trim().toLowerCase();
  if (key === "initial" || key === "initialvalue" || key === "initialvalues") {
    return "initial";
  }
  if (key === "flow") {
    return "flow";
  }
  return undefined;
}

export function isMatrixInitialRow(row: {
  role?: MatrixRowRole;
  band?: string;
  label?: string;
}): boolean {
  return row.role === "initial" || inferMatrixRowRoleFromLabels(row.band, row.label) === "initial";
}

export function isMatrixFlowRowIndex(cell: MatrixCell, rowIndex: number, sumRowIndex: number): boolean {
  if (rowIndex < 0 || rowIndex >= sumRowIndex) {
    return false;
  }
  const row = cell.rows[rowIndex];
  return row != null && !isMatrixInitialRow(row);
}

export function listMatrixFlowRowIndices(cell: MatrixCell, sumRowIndex: number): number[] {
  const indices: number[] = [];
  for (let rowIndex = 0; rowIndex < sumRowIndex; rowIndex += 1) {
    if (isMatrixFlowRowIndex(cell, rowIndex, sumRowIndex)) {
      indices.push(rowIndex);
    }
  }
  return indices;
}

export function findMatrixInitialRowIndex(cell: MatrixCell, sumRowIndex: number): number | null {
  for (let rowIndex = 0; rowIndex < sumRowIndex; rowIndex += 1) {
    if (isMatrixInitialRow(cell.rows[rowIndex] ?? { label: "" })) {
      return rowIndex;
    }
  }
  return null;
}
