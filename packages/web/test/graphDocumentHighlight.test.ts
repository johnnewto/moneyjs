import { describe, expect, it } from "vitest";

import {
  matrixColumnMatchesGraphSlice,
  matrixGraphSliceHighlightsEqual,
  matrixRowMatchesGraphSlice,
  matrixSliceColumnClassName,
  matrixSliceHeaderClassName,
  matrixSliceRowClassName,
  type MatrixGraphSliceHighlight
} from "../src/notebook/graphDocumentHighlight";

const rowSlice: MatrixGraphSliceHighlight = {
  matrixCellId: "matrix-1",
  kind: "row",
  index: 2
};

const columnSlice: MatrixGraphSliceHighlight = {
  matrixCellId: "matrix-1",
  kind: "column",
  index: 4
};

describe("graphDocumentHighlight", () => {
  it("matches row slices only for the same matrix and index", () => {
    expect(matrixRowMatchesGraphSlice("matrix-1", 2, rowSlice)).toBe(true);
    expect(matrixRowMatchesGraphSlice("matrix-1", 1, rowSlice)).toBe(false);
    expect(matrixRowMatchesGraphSlice("matrix-2", 2, rowSlice)).toBe(false);
    expect(matrixRowMatchesGraphSlice("matrix-1", 2, columnSlice)).toBe(false);
  });

  it("matches column slices only for the same matrix and index", () => {
    expect(matrixColumnMatchesGraphSlice("matrix-1", 4, columnSlice)).toBe(true);
    expect(matrixColumnMatchesGraphSlice("matrix-1", 3, columnSlice)).toBe(false);
    expect(matrixColumnMatchesGraphSlice("matrix-2", 4, columnSlice)).toBe(false);
    expect(matrixColumnMatchesGraphSlice("matrix-1", 4, rowSlice)).toBe(false);
  });

  it("returns highlight class names for matching slices", () => {
    expect(matrixSliceRowClassName("matrix-1", 2, rowSlice)).toBe(
      "notebook-matrix-slice-highlight-row"
    );
    expect(matrixSliceColumnClassName("matrix-1", 4, columnSlice)).toBe(
      "notebook-matrix-slice-highlight-column"
    );
    expect(matrixSliceHeaderClassName("matrix-1", "row", 2, rowSlice)).toBe(
      "notebook-matrix-slice-highlight-header"
    );
    expect(matrixSliceHeaderClassName("matrix-1", "column", 4, columnSlice)).toBe(
      "notebook-matrix-slice-highlight-header"
    );
    expect(matrixSliceRowClassName("matrix-1", 0, null)).toBeUndefined();
  });

  it("compares slice highlights by matrix cell, kind, and index", () => {
    expect(matrixGraphSliceHighlightsEqual(rowSlice, { ...rowSlice })).toBe(true);
    expect(matrixGraphSliceHighlightsEqual(rowSlice, columnSlice)).toBe(false);
    expect(matrixGraphSliceHighlightsEqual(null, null)).toBe(true);
  });
});
