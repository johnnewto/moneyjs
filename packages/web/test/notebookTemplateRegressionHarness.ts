import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument, NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import { resolveModelIdFromRunCellKey } from "../src/notebook/useNotebookRunner";

interface RegressionFixture {
  templateId: keyof typeof NOTEBOOK_TEMPLATES;
  checkpoints: Record<
    string,
    {
      periods: Record<string, Record<string, number>>;
    }
  >;
}

// Absolute tolerance suits small-magnitude theoretical models; the relative
// term lets large-magnitude empirical models (e.g. the Italy SFC model, whose
// flows and stocks are in the millions) match without weakening the absolute
// check used by the smaller templates.
const TOLERANCE_ABS = 5e-3;
const TOLERANCE_REL = 1e-6;

export function runNotebookTemplateRegressionFixtures(
  suiteName: string,
  fixtures: RegressionFixture[]
): void {
  describe(suiteName, () => {
    for (const fixture of fixtures) {
      it(`matches ${fixture.templateId} baseline and scenario checkpoints`, () => {
        const document = getNotebookTemplateDocument(fixture.templateId);
        const baselineResults = new Map<string, ReturnType<typeof runBaseline>>();

        for (const [cellId, checkpoint] of Object.entries(fixture.checkpoints)) {
          const runCell = document.cells.find((cell) => cell.id === cellId);
          expect(runCell?.type).toBe("run");
          if (!runCell || runCell.type !== "run") {
            throw new Error(`Run cell ${cellId} missing for template ${fixture.templateId}`);
          }

          const editor = buildEditorStateForNotebookModel(document, runCell);
          expect(editor).not.toBeNull();
          if (!editor) {
            throw new Error(`Source model missing for run cell ${cellId} in template ${fixture.templateId}`);
          }

          const modelKey = resolveRunCellModelKey(document.cells, runCell);
          const runtime = buildRuntimeConfig(editor, {
            notebookCells: document.cells,
            modelId: resolveModelIdFromRunCellKey(modelKey) ?? undefined,
            runCellId: runCell.id
          });
          const runOptions =
            runCell.periods == null ? runtime.options : { ...runtime.options, periods: runCell.periods };

          const result =
            runCell.mode === "baseline"
              ? (() => {
                  const baseline = runBaseline(runtime.model, runOptions);
                  baselineResults.set(runCell.id, baseline);
                  return baseline;
                })()
              : (() => {
                  const baselineRunCellId =
                    runCell.baselineRunCellId ??
                    document.cells.find(
                      (cell): cell is typeof runCell =>
                        cell.type === "run" &&
                        cell.mode === "baseline" &&
                        cell.sourceModelId === runCell.sourceModelId
                    )?.id;
                  expect(baselineRunCellId).toBeTruthy();
                  const baseline = baselineRunCellId ? baselineResults.get(baselineRunCellId) : undefined;
                  expect(baseline).toBeDefined();
                  if (!baseline) {
                    throw new Error(
                      `Baseline result missing for scenario run ${cellId} in template ${fixture.templateId}`
                    );
                  }
                  return runScenario(baseline, runCell.scenario ?? { shocks: [] }, runOptions);
                })();

          for (const [periodText, expectedValues] of Object.entries(checkpoint.periods)) {
            const periodIndex = Number(periodText) - 1;

            for (const [variable, expectedValue] of Object.entries(expectedValues)) {
              const actualValue = result.series[variable]?.[periodIndex];
              expect(actualValue, `${fixture.templateId}:${cellId}:${periodText}:${variable}`).toBeTypeOf(
                "number"
              );
              const tolerance = Math.max(TOLERANCE_ABS, TOLERANCE_REL * Math.abs(expectedValue));
              expect(
                Math.abs((actualValue ?? NaN) - expectedValue),
                `${fixture.templateId}:${cellId}:${periodText}:${variable}`
              ).toBeLessThanOrEqual(tolerance);
            }
          }
        }
      });
    }
  });
}
