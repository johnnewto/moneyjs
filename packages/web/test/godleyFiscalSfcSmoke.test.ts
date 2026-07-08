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

  it("runs Section 2 FPRF baseline and scenario experiments", () => {
    const fprfBaselineRunCell = findRunCell(document, "fprf-baseline-run");
    const fprfEditor = buildEditorStateForNotebookModel(document, fprfBaselineRunCell);
    expect(fprfEditor).not.toBeNull();
    if (!fprfEditor) {
      throw new Error("Expected FPRF baseline editor state.");
    }

    const fprfRuntime = buildRuntimeConfig(fprfEditor);
    const fprfBaseline = runBaseline(fprfRuntime.model, fprfRuntime.options);
    expect(Math.abs(fprfBaseline.series.accounting_check[99] ?? NaN)).toBeLessThan(1e-2);
    expect(fprfBaseline.series.PI[99] ?? NaN).toBeCloseTo(0.02, 2);
    expect(fprfBaseline.series.y_ys[99] ?? NaN).toBeCloseTo(1, 1);

    const lowerPiTargetRunCell = findRunCell(document, "fprf-lower-pi-target-run");
    const lowerPiTargetEditor = buildEditorStateForNotebookModel(document, lowerPiTargetRunCell);
    expect(lowerPiTargetEditor).not.toBeNull();
    if (!lowerPiTargetEditor) {
      throw new Error("Expected lower-pi-target editor state.");
    }
    const lowerPiTargetRuntime = buildRuntimeConfig(lowerPiTargetEditor);
    const lowerPiTarget = runScenario(
      fprfBaseline,
      lowerPiTargetRunCell.scenario ?? { shocks: [] },
      lowerPiTargetRuntime.options
    );
    expect(lowerPiTarget.series.PI[99] ?? NaN).toBeLessThan(fprfBaseline.series.PI[99] ?? NaN);
    expect(Math.min(...lowerPiTarget.series.y_ys.slice(5, 40))).toBeLessThan(0.995);

    const higherAlpha10RunCell = findRunCell(document, "fprf-higher-alpha10-run");
    const higherAlpha10Editor = buildEditorStateForNotebookModel(document, higherAlpha10RunCell);
    expect(higherAlpha10Editor).not.toBeNull();
    if (!higherAlpha10Editor) {
      throw new Error("Expected higher-alpha10 editor state.");
    }
    const higherAlpha10Runtime = buildRuntimeConfig(higherAlpha10Editor);
    const higherAlpha10 = runScenario(
      fprfBaseline,
      higherAlpha10RunCell.scenario ?? { shocks: [] },
      higherAlpha10Runtime.options
    );
    expect(Math.max(...higherAlpha10.series.PI.slice(5, 40))).toBeGreaterThan(0.02);

    const higherRrRunCell = findRunCell(document, "fprf-higher-rr-run");
    const higherRrEditor = buildEditorStateForNotebookModel(document, higherRrRunCell);
    expect(higherRrEditor).not.toBeNull();
    if (!higherRrEditor) {
      throw new Error("Expected higher-rr editor state.");
    }
    const higherRrRuntime = buildRuntimeConfig(higherRrEditor);
    const higherRr = runScenario(
      fprfBaseline,
      higherRrRunCell.scenario ?? { shocks: [] },
      higherRrRuntime.options
    );
    expect(higherRr.series.gd_y[99] ?? NaN).toBeGreaterThan((fprfBaseline.series.gd_y[99] ?? NaN) + 0.01);
  });
});
