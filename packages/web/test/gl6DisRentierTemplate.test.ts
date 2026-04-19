import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("gl6-dis-rentier notebook template", () => {
  it("builds and runs the baseline and scenario cells", () => {
    const document = NOTEBOOK_TEMPLATES["gl6-dis-rentier"].document;
    const baselineRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "baseline-run"
    );
    const scenarioRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "scenario-2-run"
    );

    expect(baselineRunCell).toBeDefined();
    expect(scenarioRunCell).toBeDefined();

    if (!baselineRunCell || !scenarioRunCell) {
      throw new Error("Expected DIS rentier run cells to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(80);
    expect(baselineResult.series.Y.length).toBe(80);
    expect(Number.isFinite(baselineResult.series.Y.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(baselineResult.series.Bh.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(baselineResult.series.Mh.at(-1) ?? NaN)).toBe(true);
    expect(Math.abs(baselineResult.series.gap.at(-1) ?? NaN)).toBeLessThan(1e-6);

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

    expect(scenarioResult.options.periods).toBe(55);
    expect(scenarioResult.series.Bh.length).toBe(55);
    expect(Number.isFinite(scenarioResult.series.Bh.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(scenarioResult.series.Mh.at(-1) ?? NaN)).toBe(true);
  });
});