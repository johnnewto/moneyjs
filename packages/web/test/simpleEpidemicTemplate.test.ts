import { describe, expect, it } from "vitest";

import { runBaseline } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("simple-epidemic notebook template", () => {
  it("builds and runs the baseline cell", () => {
    const document = NOTEBOOK_TEMPLATES["simple-epidemic"].document;
    const baselineRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "baseline-run"
    );

    expect(baselineRunCell).toBeDefined();

    if (!baselineRunCell) {
      throw new Error("Expected simple-epidemic baseline run cell to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(200);
    expect(baselineResult.series.susceptible.length).toBe(200);
    expect(baselineResult.series.sick.length).toBe(200);
    expect(baselineResult.series.recovered.length).toBe(200);
    expect(baselineResult.series.infections.length).toBe(200);
    expect(baselineResult.series.cure.length).toBe(200);

    expect(baselineResult.series.susceptible[1]).toBeLessThan(988);
    expect(baselineResult.series.sick[1]).toBeGreaterThan(2);
    expect(baselineResult.series.recovered[1]).toBeGreaterThan(10);

    for (let period = 0; period < baselineResult.options.periods; period += 1) {
      const total =
        (baselineResult.series.susceptible[period] ?? NaN) +
        (baselineResult.series.sick[period] ?? NaN) +
        (baselineResult.series.recovered[period] ?? NaN);
      expect(Number.isFinite(total)).toBe(true);
      expect(total).toBeCloseTo(1000, 6);
    }
  });
});