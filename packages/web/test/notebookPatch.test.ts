import { describe, expect, it } from "vitest";

import {
  applyNotebookPatch,
  previewNotebookPatch,
  validateNotebookPatch,
  type NotebookPatch
} from "../src/notebook/notebookPatch";
import { createNotebookFromTemplate } from "../src/notebook/templates";
import type { MatrixCell, NotebookDocument } from "../src/notebook/types";

function buildDocument(): NotebookDocument {
  return createNotebookFromTemplate("bmw");
}

function findCellIndex(document: NotebookDocument, cellId: string): number {
  const index = document.cells.findIndex((cell) => cell.id === cellId);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("notebook patch", () => {
  it("previews a valid chart insertion without mutating the source document", () => {
    const document = buildDocument();
    const patch: NotebookPatch = {
      description: "Add a disposable income chart.",
      operations: [
        {
          op: "add",
          path: "/cells/-",
          value: {
            id: "chart-disposable-income",
            type: "chart",
            title: "Disposable income",
            sourceRunCellId: "baseline-newton",
            variables: ["YD", "Cd"]
          }
        }
      ]
    };

    const result = previewNotebookPatch(document, patch);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues[0]?.message ?? "Expected valid patch.");
    }
    expect(result.summary).toEqual({
      addedCells: 1,
      changedCells: 0,
      operationCount: 1,
      removedCells: 0
    });
    expect(result.document.cells.at(-1)).toEqual(
      expect.objectContaining({
        id: "chart-disposable-income",
        sourceRunCellId: "baseline-newton",
        type: "chart",
        variables: ["YD", "Cd"]
      })
    );
    expect(document.cells.some((cell) => cell.id === "chart-disposable-income")).toBe(false);
  });

  it("applies valid replacements and reports changed cells", () => {
    const document = buildDocument();
    const chartIndex = findCellIndex(document, "baseline-chart");

    const result = applyNotebookPatch(document, {
      operations: [
        {
          op: "replace",
          path: "/cells/by-id/baseline-chart/variables",
          value: ["Y", "YD", "Mh"]
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues[0]?.message ?? "Expected valid patch.");
    }
    expect(result.summary.changedCells).toBe(1);
    expect(result.document.cells[chartIndex]).toEqual(
      expect.objectContaining({
        id: "baseline-chart",
        variables: ["Y", "YD", "Mh"]
      })
    );
  });

  it("rejects numeric cell-property paths", () => {
    const document = buildDocument();
    const chartIndex = findCellIndex(document, "baseline-chart");

    const result = applyNotebookPatch(document, {
      operations: [
        {
          op: "replace",
          path: `/cells/${chartIndex}/variables`,
          value: ["W"]
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("unsupported notebook path");
  });

  it("rejects unsupported paths before applying", () => {
    const result = validateNotebookPatch(buildDocument(), {
      operations: [
        {
          op: "replace",
          path: "/metadata/template",
          value: "custom"
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("unsupported notebook path");
  });

  it("rejects duplicate cell ids", () => {
    const document = buildDocument();
    const originalLength = document.cells.length;

    const result = previewNotebookPatch(document, {
      operations: [
        {
          op: "add",
          path: "/cells/-",
          value: {
            id: "baseline-chart",
            type: "chart",
            title: "Duplicate chart",
            sourceRunCellId: "baseline-newton",
            variables: ["Y"]
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "Duplicate notebook cell id 'baseline-chart'"
    );
    expect(document.cells).toHaveLength(originalLength);
  });

  it("rejects dangling run references", () => {
    const result = previewNotebookPatch(buildDocument(), {
      operations: [
        {
          op: "add",
          path: "/cells/-",
          value: {
            id: "chart-missing-run",
            type: "chart",
            title: "Missing run chart",
            sourceRunCellId: "missing-run",
            variables: ["Y"]
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "references missing run cell 'missing-run'"
    );
  });

  it("rejects matrix row width errors", () => {
    const document = buildDocument();
    const matrixIndex = findCellIndex(document, "transaction-flow");
    expect(document.cells[matrixIndex]?.type).toBe("matrix");

    const result = previewNotebookPatch(document, {
      operations: [
        {
          op: "add",
          path: `/cells/${matrixIndex}/rows/-`,
          value: {
            label: "Bad row",
            values: ["+Y"]
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join("\n")).toContain(
      "has 1 values for 6 columns"
    );
  });

  it("rejects invalid batches atomically", () => {
    const document = buildDocument();
    const chartIndex = findCellIndex(document, "baseline-chart");
    const originalTitle = document.cells[chartIndex]?.title;

    const result = previewNotebookPatch(document, {
      operations: [
        {
          op: "replace",
          path: `/cells/${chartIndex}/title`,
          value: "Edited title"
        },
        {
          op: "add",
          path: "/cells/-",
          value: {
            id: "bad-chart",
            type: "chart",
            title: "Bad chart",
            sourceRunCellId: "missing-run",
            variables: ["Y"]
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    expect(document.cells[chartIndex]?.title).toBe(originalTitle);
  });

  it("removes cells when references remain valid", () => {
    const document = buildDocument();
    const noteIndex = findCellIndex(document, "scenario-1-note");

    const result = applyNotebookPatch(document, {
      operations: [
        {
          op: "remove",
          path: `/cells/${noteIndex}`
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues[0]?.message ?? "Expected valid patch.");
    }
    expect(result.summary.removedCells).toBe(1);
    expect(result.document.cells.some((cell) => cell.id === "scenario-1-note")).toBe(false);
  });

  it("supports JSON Pointer escaping", () => {
    const document = buildDocument();
    const matrixIndex = findCellIndex(document, "transaction-flow");
    const matrix = document.cells[matrixIndex] as MatrixCell;
    const sectorsIndex = matrix.sectors?.findIndex((sector) => sector === "Firms") ?? -1;
    expect(sectorsIndex).toBeGreaterThanOrEqual(0);

    const result = applyNotebookPatch(document, {
      operations: [
        {
          op: "replace",
          path: `/cells/${matrixIndex}/sectors/${sectorsIndex}`,
          value: "Firms/Capital"
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues[0]?.message ?? "Expected valid patch.");
    }
    expect((result.document.cells[matrixIndex] as MatrixCell).sectors?.[sectorsIndex]).toBe(
      "Firms/Capital"
    );
  });
});
