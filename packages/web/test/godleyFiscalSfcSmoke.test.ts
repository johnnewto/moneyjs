import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import type { RunCell } from "../src/notebook/types";

function findRunCell(document: ReturnType<typeof getNotebookTemplateDocument>, id: string): RunCell {
  const runCell = document.cells.find((cell) => cell.id === id);
  if (!runCell || runCell.type !== "run") {
    throw new Error(`Missing run cell ${id}`);
  }
  return runCell;
}

describe("godley-fiscal-sfc template smoke", () => {
  const document = getNotebookTemplateDocument("godley-fiscal-sfc");
  const baselineRunCell = findRunCell(document, "baseline-run");

  it("runs baseline and scenarios with stable accounting", () => {
    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baseline = runBaseline(baselineRuntime.model, baselineRuntime.options);
    expect(baseline.options.periods).toBe(80);
    expect(baseline.series.y[79]).toBeGreaterThan(0);
    expect(Math.abs(baseline.series.accounting_check[79] ?? NaN)).toBeLessThan(1e-3);
    expect(baseline.series.gd_y[79] ?? NaN).toBeGreaterThan(0.3);
    expect(baseline.series.g_y[79] ?? NaN).toBeCloseTo(0.259, 1);

    const highRateRunCell = findRunCell(document, "high-rate-run");
    const highRateEditor = buildEditorStateForNotebookModel(document, highRateRunCell);
    expect(highRateEditor).not.toBeNull();
    if (!highRateEditor) {
      throw new Error("Expected high-rate editor state.");
    }
    const highRateRuntime = buildRuntimeConfig(highRateEditor);
    const highRate = runScenario(
      baseline,
      highRateRunCell.scenario ?? { shocks: [] },
      highRateRuntime.options
    );
    expect(highRate.series.gd_y[79] ?? NaN).toBeGreaterThan(baseline.series.gd_y[79] ?? NaN);

    const tradeDeficitRunCell = findRunCell(document, "trade-deficit-run");
    const tradeDeficitEditor = buildEditorStateForNotebookModel(document, tradeDeficitRunCell);
    expect(tradeDeficitEditor).not.toBeNull();
    if (!tradeDeficitEditor) {
      throw new Error("Expected trade-deficit editor state.");
    }
    const tradeDeficitRuntime = buildRuntimeConfig(tradeDeficitEditor);
    const tradeDeficit = runScenario(
      baseline,
      tradeDeficitRunCell.scenario ?? { shocks: [] },
      tradeDeficitRuntime.options
    );
    expect(tradeDeficit.series.CAB[79] ?? NaN).toBeLessThan(0);
    expect(tradeDeficit.series.DEFICIT_Y[79] ?? NaN).toBeGreaterThan(
      baseline.series.DEFICIT_Y[79] ?? NaN
    );
  });
});
