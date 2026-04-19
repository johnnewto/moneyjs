import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("gl6-dis-rentier-v2 notebook template", () => {
  it("builds and runs the baseline and scenario cells", () => {
    const document = NOTEBOOK_TEMPLATES["gl6-dis-rentier-v2"].document;
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
      throw new Error("Expected DIS rentier v2 run cells to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(100);
    expect(baselineResult.series.ydhs.length).toBe(100);
    expect(Number.isFinite(baselineResult.series.ydhs.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(baselineResult.series.Mh.at(-1) ?? NaN)).toBe(true);

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

    expect(scenarioResult.options.periods).toBe(50);
    expect(scenarioResult.series.inv.length).toBe(50);
    expect(Number.isFinite(scenarioResult.series.inv.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(scenarioResult.series.inv_E.at(-1) ?? NaN)).toBe(true);
  });
});