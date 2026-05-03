import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("opensimplest notebook template", () => {
  it("builds and runs the baseline and export-shock cells", () => {
    const document = NOTEBOOK_TEMPLATES.opensimplest.document;
    const baselineRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "baseline-run"
    );
    const scenarioRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "export-shock-run"
    );

    expect(baselineRunCell).toBeDefined();
    expect(scenarioRunCell).toBeDefined();

    if (!baselineRunCell || !scenarioRunCell) {
      throw new Error("Expected OPENSIMPLEST run cells to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(40);
    expect(baselineResult.series.Y.length).toBe(40);
    expect(baselineResult.series.X.length).toBe(40);
    expect(baselineResult.series.CA.length).toBe(40);
    expect(baselineResult.series.XR.length).toBe(40);
    expect(Math.abs(baselineResult.series.sectoral_check[0] ?? NaN)).toBeLessThan(1e-6);
    expect(Number.isFinite(baselineResult.series.V.at(-1) ?? NaN)).toBe(true);

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

    expect(scenarioResult.options.periods).toBe(40);
    expect(scenarioResult.series.X.length).toBe(40);
    expect(scenarioResult.series.XR.length).toBe(40);
    expect(Number.isFinite(scenarioResult.series.X.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(scenarioResult.series.XR.at(-1) ?? NaN)).toBe(true);
    expect((scenarioResult.series.X[5] ?? NaN)).toBeLessThan(baselineResult.series.X[5] ?? NaN);
  });
});