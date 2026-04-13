import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import bmwRegressionFixture from "./fixtures/r-regressions/bmw.json";
import gl6DisRegressionFixture from "./fixtures/r-regressions/gl6-dis.json";
import gl7InsoutRegressionFixture from "./fixtures/r-regressions/gl7-insout.json";
import gl8GrowthRegressionFixture from "./fixtures/r-regressions/gl8-growth.json";
import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

interface RegressionFixture {
  templateId: keyof typeof NOTEBOOK_TEMPLATES;
  checkpoints: Record<
    string,
    {
      periods: Record<string, Record<string, number>>;
    }
  >;
}

const FIXTURES: RegressionFixture[] = [
  bmwRegressionFixture,
  gl6DisRegressionFixture,
  gl7InsoutRegressionFixture,
  gl8GrowthRegressionFixture
];
const TOLERANCE = 5e-3;

describe("notebook template regressions against R fixtures", () => {
  for (const fixture of FIXTURES) {
    it(`matches ${fixture.templateId} baseline and scenario checkpoints`, () => {
      const document = NOTEBOOK_TEMPLATES[fixture.templateId].document;
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

        const runtime = buildRuntimeConfig(editor);
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
                      cell.type === "run" && cell.mode === "baseline" && cell.sourceModelId === runCell.sourceModelId
                  )?.id;
                expect(baselineRunCellId).toBeTruthy();
                const baseline = baselineRunCellId ? baselineResults.get(baselineRunCellId) : undefined;
                expect(baseline).toBeDefined();
                if (!baseline) {
                  throw new Error(`Baseline result missing for scenario run ${cellId} in template ${fixture.templateId}`);
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
            expect(
              Math.abs((actualValue ?? NaN) - expectedValue),
              `${fixture.templateId}:${cellId}:${periodText}:${variable}`
            ).toBeLessThanOrEqual(TOLERANCE);
          }
        }
      }
    });
  }
});
