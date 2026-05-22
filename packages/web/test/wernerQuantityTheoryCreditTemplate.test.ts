import { describe, expect, it } from "vitest";

import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import { validateNotebookDocument } from "../src/notebook/validation";

describe("Werner quantity-theory-of-credit notebook template", () => {
  it("validates and exposes runnable editor state for all run cells", () => {
    const document = NOTEBOOK_TEMPLATES["werner-quantity-theory-credit"].document;

    expect(validateNotebookDocument(document)).toEqual([]);

    const runCells = document.cells.filter((cell) => cell.type === "run");
    expect(runCells.length).toBeGreaterThanOrEqual(3);

    for (const runCell of runCells) {
      expect(Number.isInteger(runCell.periods)).toBe(true);
      expect(runCell.periods).toBeGreaterThanOrEqual(1);
      expect(buildEditorStateForNotebookModel(document, runCell)).not.toBeNull();
    }
  });
});
