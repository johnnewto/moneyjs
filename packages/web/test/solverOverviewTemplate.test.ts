import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("solver-overview notebook template", () => {
  it("builds the intended block structure and runs the baseline and scenario cells", () => {
    const document = NOTEBOOK_TEMPLATES["solver-overview"].document;
    const baselineRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "baseline-run"
    );
    const scenarioRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "scenario-run"
    );

    expect(baselineRunCell).toBeDefined();
    expect(scenarioRunCell).toBeDefined();

    if (!baselineRunCell || !scenarioRunCell) {
      throw new Error("Expected solver-overview run cells to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(
      baselineResult.blocks.map((block) => ({
        names: block.equationNames,
        cyclic: block.cyclic
      }))
    ).toEqual([
      { names: ["a"], cyclic: false },
      { names: ["b"], cyclic: false },
      { names: ["c", "d"], cyclic: true },
      { names: ["e"], cyclic: false }
    ]);

    expect(baselineResult.series.a[1]).toBeCloseTo(1, 10);
    expect(baselineResult.series.b[1]).toBeCloseTo(2, 10);
    expect(baselineResult.series.c[1]).toBeCloseTo(1.8709677419, 8);
    expect(baselineResult.series.d[1]).toBeCloseTo(1.935483871, 8);
    expect(baselineResult.series.e[1]).toBeCloseTo(3.8709677419, 8);
    expect((baselineResult.series.c[2] ?? NaN) > (baselineResult.series.c[1] ?? NaN)).toBe(true);
    expect((baselineResult.series.e[2] ?? NaN) > (baselineResult.series.e[1] ?? NaN)).toBe(true);

    const scenarioEditor = buildEditorStateForNotebookModel(document, scenarioRunCell);
    expect(scenarioEditor).not.toBeNull();
    if (!scenarioEditor) {
      throw new Error("Expected scenario editor state.");
    }

    const scenarioRuntime = buildRuntimeConfig(scenarioEditor);
    const scenarioOptions =
      scenarioRunCell.periods == null
        ? scenarioRuntime.options
        : { ...scenarioRuntime.options, periods: scenarioRunCell.periods };
    const scenarioResult = runScenario(
      baselineResult,
      scenarioRunCell.scenario ?? { shocks: [] },
      scenarioOptions
    );

    expect(scenarioResult.options.periods).toBe(20);
    expect(scenarioResult.series.c.length).toBe(20);
    expect(scenarioResult.series.d.length).toBe(20);
    expect(Number.isFinite(scenarioResult.series.c.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(scenarioResult.series.d.at(-1) ?? NaN)).toBe(true);
    expect((scenarioResult.series.c[10] ?? NaN) > (baselineResult.series.c[10] ?? NaN)).toBe(true);
    expect((scenarioResult.series.e[10] ?? NaN) > (baselineResult.series.e[10] ?? NaN)).toBe(true);
  });
});
