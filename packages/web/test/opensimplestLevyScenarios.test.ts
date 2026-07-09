import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument } from "../src/notebook/templates";

function runScenarioCell(runCellId: string) {
  const document = getNotebookTemplateDocument("opensimplest-levy");
  const runCell = document.cells.find(
    (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
      cell.type === "run" && cell.id === runCellId
  );
  if (!runCell || runCell.mode !== "scenario") {
    throw new Error(`Missing scenario run cell ${runCellId}`);
  }
  const baselineCell = document.cells.find(
    (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
      cell.type === "run" && cell.id === runCell.baselineRunCellId
  );
  if (!baselineCell) {
    throw new Error("Missing baseline run cell");
  }
  const baselineEditor = buildEditorStateForNotebookModel(document, baselineCell);
  const scenarioEditor = buildEditorStateForNotebookModel(document, runCell);
  if (!baselineEditor || !scenarioEditor) {
    throw new Error("Missing editor state");
  }
  const baselineRuntime = buildRuntimeConfig(baselineEditor);
  const scenarioRuntime = buildRuntimeConfig(scenarioEditor);
  const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);
  const scenarioOptions =
    runCell.periods == null
      ? scenarioRuntime.options
      : { ...scenarioRuntime.options, periods: runCell.periods };
  return { baselineResult, scenarioResult: runScenario(baselineResult, runCell.scenario ?? { shocks: [] }, scenarioOptions) };
}

describe("opensimplest levy expanded scenarios", () => {
  it("runs all section 5 shocks from Zezza WP 1105", () => {
    const { baselineResult, scenarioResult: exportResult } = runScenarioCell("export-shock-run");
    const { scenarioResult: fiscalResult } = runScenarioCell("fiscal-shock-run");
    const { scenarioResult: monetaryResult } = runScenarioCell("monetary-shock-run");
    const { scenarioResult: liquidityResult } = runScenarioCell("liquidity-shock-run");

    expect(Math.abs(baselineResult.series.sectoral_check[0] ?? NaN)).toBeLessThan(1e-6);
    expect(exportResult.series.x[5] ?? NaN).toBeLessThan(baselineResult.series.x[5] ?? NaN);
    expect(fiscalResult.series.y.at(-1) ?? NaN).toBeGreaterThan(baselineResult.series.y.at(-1) ?? NaN);
    expect(monetaryResult.series.r[5] ?? NaN).toBeCloseTo(0.029, 6);
    expect(Number.isFinite(monetaryResult.series.CA[20] ?? NaN)).toBe(true);
    expect(liquidityResult.series.xr[5] ?? NaN).not.toBe(baselineResult.series.xr[5] ?? NaN);

    for (const result of [exportResult, fiscalResult, monetaryResult, liquidityResult]) {
      expect(result.series.y.length).toBe(150);
      expect(Number.isFinite(result.series.xr.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.v.at(-1) ?? NaN)).toBe(true);
    }
  });
});
