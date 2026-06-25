import { expect, it } from "vitest";

import { runSegmentedExogenize } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";
import type { RunCell } from "../src/notebook/types";

it("runs the Italy SFC out-of-sample forecast as one continuous 1997-2028 segmented run", () => {
  const document = getNotebookTemplateDocument("italy-sfc");
  const outOfSampleRun = requireRunCell(document, "out-of-sample-run");

  const runtime = buildRuntimeForRun(document, outOfSampleRun);
  expect(runtime.segmentation).not.toBeNull();
  expect(runtime.segmentation?.splitPeriod).toBe(25);

  const result = runSegmentedExogenize(
    runtime.model,
    { ...runtime.options, periods: outOfSampleRun.periods, simType: outOfSampleRun.simType },
    runtime.segmentation!
  );

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

function requireRunCell(document: ReturnType<typeof getNotebookTemplateDocument>, id: string): RunCell {
  const runCell = document.cells.find((cell): cell is RunCell => cell.type === "run" && cell.id === id);
  if (!runCell) {
    throw new Error(`Missing run cell '${id}'.`);
  }
  return runCell;
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
