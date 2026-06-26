import { expect, it } from "vitest";

import { runSegmentedExogenize, type SimulationResult } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";
import type { RunCell } from "../src/notebook/types";

it("runs the Italy SFC out-of-sample forecast as one continuous 1997-2028 segmented run", () => {
  const document = getNotebookTemplateDocument("italy-sfc");
  const outOfSampleRun = requireRunCell(document, "out-of-sample-run");

  const result = runOutOfSampleBaseline(document, outOfSampleRun);

  // The run spans 1997-2028 (32 annual periods).
  expect(result.series.y?.length).toBe(32);

  // The in-sample window (indices 0-24 = 1997-2021) stays pinned to observed data,
  // so simulated nominal GDP tracks the observed series closely.
  const observedY = result.observed?.y;
  expect(observedY).toBeTruthy();
  for (const index of [10, 18, 24]) {
    const simulated = result.series.y?.[index] ?? NaN;
    const observed = observedY?.[index] ?? NaN;
    expect(Number.isFinite(simulated), `y[${index}] finite`).toBe(true);
    expect(Math.abs(simulated - observed) / Math.abs(observed)).toBeLessThan(0.02);
  }

  // The out-of-sample window (indices 25-31 = 2022-2028) is released and solved
  // dynamically; every key aggregate must stay finite across the forecast.
  for (const variable of ["y", "yR", "consR", "iddR", "imR", "xR", "deb", "p", "pc", "nd", "un", "rb", "rstar"]) {
    for (let index = 25; index < 32; index += 1) {
      expect(Number.isFinite(result.series[variable]?.[index]), `${variable}[${index}] finite`).toBe(true);
    }
  }

  // Real GDP keeps growing into the forecast rather than collapsing.
  const realGdp2021 = (result.series.y?.[24] ?? 0) / (result.series.p?.[24] ?? 1);
  const realGdp2028 = (result.series.y?.[31] ?? 0) / (result.series.p?.[31] ?? 1);
  expect(realGdp2028).toBeGreaterThan(realGdp2021 * 0.8);

  // The policy-rate add-factor path (adj_rstar) lifts rstar through the forecast: the
  // 2024 rate (index 27) sits well above the near-zero 2022 rate (index 25).
  expect(result.series.rstar?.[27] ?? NaN).toBeGreaterThan((result.series.rstar?.[25] ?? 0) + 0.01);
});

it("runs the Italy SFC additional experiments as continuous 1997-2028 segmented runs", () => {
  const document = getNotebookTemplateDocument("italy-sfc");
  const outOfSampleRun = requireRunCell(document, "out-of-sample-run");
  const baseline = runOutOfSampleBaseline(document, outOfSampleRun);

  const scenario1Run = requireRunCell(document, "alternative-scenario-1-run");
  const scenario2Run = requireRunCell(document, "alternative-scenario-2-run");
  const scenario3Run = requireRunCell(document, "alternative-scenario-3-run");

  const scenario1 = runOutOfSampleBaseline(document, scenario1Run);
  const scenario2 = runOutOfSampleBaseline(document, scenario2Run);
  const scenario3 = runOutOfSampleBaseline(document, scenario3Run);

  for (const [runCell, result] of [
    [scenario1Run, scenario1],
    [scenario2Run, scenario2],
    [scenario3Run, scenario3]
  ] as const) {
    expect(runCell.mode).toBe("baseline");
    expect(runCell.externalOverrides?.length).toBeGreaterThan(0);
    expect(result.series.yR?.length).toBe(32);
    for (const variable of ["yR", "inflc", "un", "def_ratio", "deb_ratio", "rstar", "gov"]) {
      for (let index = 25; index < 32; index += 1) {
        expect(Number.isFinite(result.series[variable]?.[index]), `${runCell.id} ${variable}[${index}] finite`).toBe(true);
      }
    }
  }

  // Scenario 1 keeps CPI inflation elevated in the later forecast years.
  expect(scenario1.series.inflc?.[30] ?? NaN).toBeGreaterThan(0.045);

  // Scenario 2 applies the intended 4.5% policy-rate path over 2024-2026.
  for (const index of [27, 28, 29]) {
    expect(scenario2.series.rstar?.[index] ?? NaN).toBeCloseTo(0.045, 6);
  }

  // Scenario 3 lowers the deficit ratio relative to the baseline by 2024.
  expect(scenario3.series.def_ratio?.[27] ?? NaN).toBeLessThan(baseline.series.def_ratio?.[27] ?? NaN);
});

function requireRunCell(document: ReturnType<typeof getNotebookTemplateDocument>, id: string): RunCell {
  const runCell = document.cells.find((cell): cell is RunCell => cell.type === "run" && cell.id === id);
  if (!runCell) {
    throw new Error(`Missing run cell '${id}'.`);
  }
  return runCell;
}

function runOutOfSampleBaseline(
  document: ReturnType<typeof getNotebookTemplateDocument>,
  outOfSampleRun: RunCell
): SimulationResult {
  const runtime = buildRuntimeForRun(document, outOfSampleRun);
  expect(runtime.segmentation).not.toBeNull();
  expect(runtime.segmentation?.splitPeriod).toBe(25);

  return runSegmentedExogenize(
    runtime.model,
    { ...runtime.options, periods: outOfSampleRun.periods, simType: outOfSampleRun.simType },
    runtime.segmentation!
  );
}

function buildRuntimeForRun(document: ReturnType<typeof getNotebookTemplateDocument>, runCell: RunCell) {
  const editor = buildEditorStateForNotebookModel(document, runCell);
  if (!editor) {
    throw new Error(`Missing editor state for run cell '${runCell.id}'.`);
  }
  const modelKey = resolveRunCellModelKey(document.cells, runCell);
  return buildRuntimeConfig(editor, {
    notebookCells: document.cells,
    modelId: resolveModelIdFromRunCellKey(modelKey) ?? undefined,
    runCellId: runCell.id
  });
}
