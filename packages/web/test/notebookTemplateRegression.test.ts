import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import bmwRegressionFixture from "./fixtures/r-regressions/bmw.json";
import gl6DisRegressionFixture from "./fixtures/r-regressions/gl6-dis.json";
import { buildRuntimeConfig } from "../src/lib/editorModel";
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

const FIXTURES: RegressionFixture[] = [bmwRegressionFixture, gl6DisRegressionFixture];
const TOLERANCE = 5e-3;

describe("notebook template regressions against R fixtures", () => {
  for (const fixture of FIXTURES) {
    it(`matches ${fixture.templateId} baseline and scenario checkpoints`, () => {
      const document = NOTEBOOK_TEMPLATES[fixture.templateId].document;
      const modelCell = document.cells.find((cell) => cell.type === "model");

      expect(modelCell?.type).toBe("model");
      if (!modelCell || modelCell.type !== "model") {
        throw new Error(`Model cell missing for template ${fixture.templateId}`);
      }

      const runtime = buildRuntimeConfig(modelCell.editor);
      const baselineResult = runBaseline(runtime.model, runtime.options);

      for (const [cellId, checkpoint] of Object.entries(fixture.checkpoints)) {
        const runCell = document.cells.find((cell) => cell.id === cellId);
        expect(runCell?.type).toBe("run");
        if (!runCell || runCell.type !== "run") {
          throw new Error(`Run cell ${cellId} missing for template ${fixture.templateId}`);
        }

        const result =
          runCell.mode === "baseline"
            ? baselineResult
            : runScenario(
                baselineResult,
                runCell.scenario ?? { shocks: [] },
                runtime.options
              );

        for (const [periodText, expectedValues] of Object.entries(checkpoint.periods)) {
          const periodIndex = Number(periodText) - 1;

          for (const [variable, expectedValue] of Object.entries(expectedValues)) {
            const actualValue = result.series[variable]?.[periodIndex];
            expect(actualValue, `${fixture.templateId}:${cellId}:${periodText}:${variable}`).toBeTypeOf(
              "number"
            );
            expect(Math.abs((actualValue ?? NaN) - expectedValue)).toBeLessThanOrEqual(TOLERANCE);
          }
        }
      }
    });
  }
});
