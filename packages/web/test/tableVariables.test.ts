import { runBaseline } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { evaluateMatrixEntryNumber } from "../src/notebook/matrixAccountSumRow";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import {
  isTableVariableExpression,
  resolveTableVariableTimeSeries
} from "../src/notebook/tableVariables";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";

describe("table variables", () => {
  it("detects bare names vs expressions", () => {
    expect(isTableVariableExpression("y")).toBe(false);
    expect(isTableVariableExpression("gd_y")).toBe(false);
    expect(isTableVariableExpression("t/y")).toBe(true);
    expect(isTableVariableExpression("100 * WBd / Y")).toBe(true);
  });

  it("evaluates expressions from godley fiscal baseline run", () => {
    const document = getNotebookTemplateDocument("godley-fiscal-sfc");
    const runCell = document.cells.find((cell) => cell.id === "baseline-run");
    expect(runCell?.type).toBe("run");
    if (!runCell || runCell.type !== "run") {
      throw new Error("Missing baseline run");
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
    const periodIndex = 79;

    const evaluate = (expression: string) =>
      evaluateMatrixEntryNumber(expression, result, periodIndex);

    const t = evaluate("t");
    const y = evaluate("y");
    const ratio = evaluate("t/y");
    expect(t).toBeTypeOf("number");
    expect(y).toBeTypeOf("number");
    expect(ratio).toBeCloseTo((t ?? 0) / (y ?? 1), 8);

    const values = resolveTableVariableTimeSeries("t/y", result);
    expect(values[periodIndex]).toBeCloseTo(ratio ?? NaN, 8);
  });
});
