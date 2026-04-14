import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("predator-prey notebook template", () => {
  it("builds and runs the baseline and scenario cells", () => {
    const document = NOTEBOOK_TEMPLATES["predator-prey"].document;
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
      throw new Error("Expected predator-prey run cells to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(120);
    expect(baselineResult.series.prey.length).toBe(120);
    expect(baselineResult.series.predator.length).toBe(120);
    expect(baselineResult.series.prey.at(-1)).toBeTypeOf("number");
    expect(baselineResult.series.predator.at(-1)).toBeTypeOf("number");
    expect(Number.isFinite(baselineResult.series.prey.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(baselineResult.series.predator.at(-1) ?? NaN)).toBe(true);

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
    expect(scenarioResult.series.prey.length).toBe(50);
    expect(scenarioResult.series.predator.length).toBe(50);
    expect(Number.isFinite(scenarioResult.series.prey.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(scenarioResult.series.predator.at(-1) ?? NaN)).toBe(true);
  });
});
