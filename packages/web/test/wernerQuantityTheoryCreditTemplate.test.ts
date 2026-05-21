import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import { validateNotebookDocument } from "../src/notebook/validation";

describe("Werner quantity-theory-of-credit notebook template", () => {
  it("validates and runs the baseline plus both scenario cells", () => {
    const document = NOTEBOOK_TEMPLATES["werner-quantity-theory-credit"].document;

    expect(validateNotebookDocument(document)).toEqual([]);

    const baselineRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "baseline-run"
    );
    const assetBoomRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "asset-boom-run"
    );
    const creditCrunchRunCell = document.cells.find(
      (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
        cell.type === "run" && cell.id === "credit-crunch-run"
    );

    expect(baselineRunCell).toBeDefined();
    expect(assetBoomRunCell).toBeDefined();
    expect(creditCrunchRunCell).toBeDefined();

    if (!baselineRunCell || !assetBoomRunCell || !creditCrunchRunCell) {
      throw new Error("Expected Werner notebook run cells to exist.");
    }

    const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
    expect(baselineEditor).not.toBeNull();
    if (!baselineEditor) {
      throw new Error("Expected Werner baseline editor state.");
    }

    const baselineRuntime = buildRuntimeConfig(baselineEditor);
    const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

    expect(baselineResult.options.periods).toBe(80);
    expect(baselineResult.series.Y.length).toBe(80);
    expect(baselineResult.series.PA.length).toBe(80);
    expect(baselineResult.series.DebtRatio.length).toBe(80);
    expect(Number.isFinite(baselineResult.series.Y.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(baselineResult.series.PA.at(-1) ?? NaN)).toBe(true);
    expect(Number.isFinite(baselineResult.series.DebtRatio.at(-1) ?? NaN)).toBe(true);

    const assetBoomEditor = buildEditorStateForNotebookModel(document, assetBoomRunCell);
    expect(assetBoomEditor).not.toBeNull();
    if (!assetBoomEditor) {
      throw new Error("Expected Werner asset-boom editor state.");
    }

    const assetBoomRuntime = buildRuntimeConfig(assetBoomEditor);
    const assetBoomResult = runScenario(
      baselineResult,
      assetBoomRunCell.scenario ?? { shocks: [] },
      { ...assetBoomRuntime.options, periods: assetBoomRunCell.periods }
    );

    expect(assetBoomResult.options.periods).toBe(80);
    expect(Number.isFinite(assetBoomResult.series.PA.at(-1) ?? NaN)).toBe(true);
    expect(assetBoomResult.series.AssetCreditShare[10] ?? NaN).toBeGreaterThan(
      baselineResult.series.AssetCreditShare[10] ?? NaN
    );

    const creditCrunchEditor = buildEditorStateForNotebookModel(document, creditCrunchRunCell);
    expect(creditCrunchEditor).not.toBeNull();
    if (!creditCrunchEditor) {
      throw new Error("Expected Werner credit-crunch editor state.");
    }

    const creditCrunchRuntime = buildRuntimeConfig(creditCrunchEditor);
    const creditCrunchResult = runScenario(
      baselineResult,
      creditCrunchRunCell.scenario ?? { shocks: [] },
      { ...creditCrunchRuntime.options, periods: creditCrunchRunCell.periods }
    );

    expect(creditCrunchResult.options.periods).toBe(80);
    expect(Number.isFinite(creditCrunchResult.series.Y.at(-1) ?? NaN)).toBe(true);
    expect(creditCrunchResult.series.Y[10] ?? NaN).toBeLessThanOrEqual(baselineResult.series.Y[10] ?? NaN);
  });
});