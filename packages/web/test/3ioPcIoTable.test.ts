import { runBaseline } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import { evaluateMatrixEntryNumber } from "../src/notebook/matrixAccountSumRow";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";

describe("3io-pc input-output table", () => {
  it("matches 4_IO_Table.R at period 10", () => {
    const document = getNotebookTemplateDocument("3io-pc");
    const matrixCell = document.cells.find((cell) => cell.id === "input-output-table");
    const runCell = document.cells.find((cell) => cell.id === "baseline-run");
    expect(matrixCell?.type).toBe("matrix");
    expect(runCell?.type).toBe("run");
    if (!matrixCell || matrixCell.type !== "matrix" || !runCell || runCell.type !== "run") {
      throw new Error("Missing IO table or baseline run");
    }

    const editor = buildEditorStateForNotebookModel(document, runCell);
    expect(editor).not.toBeNull();
    if (!editor) {
      throw new Error("Missing editor");
    }

    const modelKey = resolveRunCellModelKey(document.cells, runCell);
    const runtime = buildRuntimeConfig(editor, {
      notebookCells: document.cells,
      modelId: resolveModelIdFromRunCellKey(modelKey) ?? undefined,
      runCellId: runCell.id
    });
    const result = runBaseline(runtime.model, { ...runtime.options, periods: runCell.periods });
    const periodIndex = 9;

    const evaluate = (expression: string) =>
      evaluateMatrixEntryNumber(expression, result, periodIndex);

    const k1 = evaluate("x1 * (a11 * p1 + a21 * p2 + a31 * p3)");
    const k2 = evaluate("x2 * (a12 * p1 + a22 * p2 + a32 * p3)");
    const k3 = evaluate("x3 * (a13 * p1 + a23 * p2 + a33 * p3)");

    expect(k1).toBeCloseTo(14.05, 2);
    expect(k2).toBeCloseTo(32.99, 2);
    expect(k3).toBeCloseTo(27.64, 2);

    expect(evaluate("x1 * p1")).toBeCloseTo(29.7, 1);
    expect(evaluate("d1 * p1 + d2 * p2 + d3 * p3")).toBeCloseTo(85.95, 2);
    expect(evaluate("p1 * x1 + p2 * x2 + p3 * x3")).toBeCloseTo(160.63, 1);

    const agricultureColumnOutput = evaluate("x1 * p1");
    const agricultureOutputColumn = evaluate(
      "x1 * a11 * p1 + x2 * a12 * p1 + x3 * a13 * p1 + d1 * p1"
    );
    expect(agricultureOutputColumn).toBeCloseTo(agricultureColumnOutput!, 2);

    for (const row of matrixCell.rows) {
      for (const value of row.values) {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "0") {
          continue;
        }
        expect(evaluate(trimmed)).toBeTypeOf("number");
      }
    }
  });
});
