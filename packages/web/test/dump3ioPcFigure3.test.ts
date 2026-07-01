import { runBaseline } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";
import { buildMatrixEntryTimeSeries } from "../src/notebook/sequence";

describe("3io-pc figure 3 nominal final demand", () => {
  it("matches R reference at checkpoints", () => {
    const document = getNotebookTemplateDocument("3io-pc");
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

    const checkpoints: Record<number, { y: number; nom: number[] }> = {
      5: { y: 63.109700054849, nom: [8.576, 22.589, 31.945] },
      50: { y: 105.69066381053, nom: [15.026, 38.507, 52.157] },
      100: { y: 105.733345252891, nom: [15.033, 38.523, 52.178] }
    };

    for (const [periodText, expected] of Object.entries(checkpoints)) {
      const periodIndex = Number(periodText) - 1;
      const y = result.series.y?.[periodIndex];
      const nom = ["d1 * p1", "d2 * p2", "d3 * p3"].map((expression) => {
        const values = buildMatrixEntryTimeSeries(expression, result);
        return values[periodIndex];
      });
      const sum = nom.reduce((total, value) => total + value, 0);

      expect(y).toBeTypeOf("number");
      expect(Math.abs((y ?? NaN) - expected.y)).toBeLessThan(0.01);
      nom.forEach((value, index) => {
        expect(Math.abs(value - expected.nom[index]!)).toBeLessThan(0.02);
      });
      expect(Math.abs(sum - expected.y)).toBeLessThan(0.05);
    }
  });
});
