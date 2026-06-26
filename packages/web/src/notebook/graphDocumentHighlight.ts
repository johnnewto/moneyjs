import type { MatrixGraphSliceKind } from "./matrixSliceGraph";

export interface MatrixGraphSliceHighlight {
  index: number;
  kind: MatrixGraphSliceKind;
  matrixCellId: string;
}

export function matrixRowMatchesGraphSlice(
  matrixCellId: string,
  rowIndex: number,
  slice: MatrixGraphSliceHighlight | null | undefined
): boolean {
  if (slice == null || slice.matrixCellId !== matrixCellId) {
    return false;
  }

  return slice.kind === "row" && slice.index === rowIndex;
}

export function matrixColumnMatchesGraphSlice(
  matrixCellId: string,
  columnIndex: number,
  slice: MatrixGraphSliceHighlight | null | undefined
): boolean {
  if (slice == null || slice.matrixCellId !== matrixCellId) {
    return false;
  }

  return slice.kind === "column" && slice.index === columnIndex;
}

export function matrixSliceRowClassName(
  matrixCellId: string,
  rowIndex: number,
  slice: MatrixGraphSliceHighlight | null | undefined
): string | undefined {
  return matrixRowMatchesGraphSlice(matrixCellId, rowIndex, slice)
    ? "notebook-matrix-slice-highlight-row"
    : undefined;
}

export function matrixSliceColumnClassName(
  matrixCellId: string,
  columnIndex: number,
  slice: MatrixGraphSliceHighlight | null | undefined
): string | undefined {
  return matrixColumnMatchesGraphSlice(matrixCellId, columnIndex, slice)
    ? "notebook-matrix-slice-highlight-column"
    : undefined;
}

export function matrixSliceHeaderClassName(
  matrixCellId: string,
  kind: "row" | "column",
  index: number,
  slice: MatrixGraphSliceHighlight | null | undefined
): string | undefined {
  if (kind === "row") {
    return matrixRowMatchesGraphSlice(matrixCellId, index, slice)
      ? "notebook-matrix-slice-highlight-header"
      : undefined;
  }

  return matrixColumnMatchesGraphSlice(matrixCellId, index, slice)
    ? "notebook-matrix-slice-highlight-header"
    : undefined;
}

export function matrixGraphSliceHighlightsEqual(
  left: MatrixGraphSliceHighlight | null | undefined,
  right: MatrixGraphSliceHighlight | null | undefined
): boolean {
  if (left == null || right == null) {
    return left === right;
  }

  return (
    left.matrixCellId === right.matrixCellId &&
    left.kind === right.kind &&
    left.index === right.index
  );
}
