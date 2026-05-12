import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("SIM notebook template", () => {
  it("builds and runs the baseline and government spending scenario", () => {
    const document = NOTEBOOK_TEMPLATES.sim.document;
    const baselineRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.mode === "baseline"
    );
    const scenarioRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.mode === "scenario"
    );

    expect(baselineRunCell).toBeDefined();
    expect(scenarioRunCell).toBeDefined();
    if (!baselineRunCell || !scenarioRunCell) {
      throw new Error("Expected SIM baseline and scenario run cells.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected SIM baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(60);
    expect(baselineResult.series.Y[59]).toBeCloseTo(100, 2);
    expect(baselineResult.series.YD[59]).toBeCloseTo(80, 2);
    expect(baselineResult.series.Cd[59]).toBeCloseTo(80, 2);
    expect(baselineResult.series.Hh[59]).toBeCloseTo(80, 2);

    const scenarioEditor = buildEditorStateForNotebookModel(document, scenarioRunCell);
    expect(scenarioEditor).not.toBeNull();
    if (!scenarioEditor) {
      throw new Error("Expected SIM scenario editor state.");
    }

    const scenarioRuntime = buildRuntimeConfig(scenarioEditor);
    const scenarioOptions = {
      ...scenarioRuntime.options,
      periods: scenarioRunCell.periods ?? scenarioRuntime.options.periods
    };
    const scenarioResult = runScenario(baselineResult, scenarioRunCell.scenario ?? { shocks: [] }, scenarioOptions);

    expect(scenarioResult.options.periods).toBe(60);
    expect(scenarioResult.series.Gd[3]).toBeCloseTo(20, 8);
    expect(scenarioResult.series.Gd[4]).toBeCloseTo(30, 8);
    expect(scenarioResult.series.Y[0]).toBeCloseTo(100, 2);
    expect(scenarioResult.series.Y[4]).toBeGreaterThan(100);
  });
});
