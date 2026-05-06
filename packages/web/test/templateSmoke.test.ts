import { describe, expect, it } from "vitest";

import { runBaseline, runScenario } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

type TemplateId =
  | "gl6-dis-rentier"
  | "gl6-dis-rentier-v2"
  | "opensimplest"
  | "opensimplest-levy"
  | "predator-prey";

interface TemplateSmokeCase {
  baselineExpectations(result: ReturnType<typeof runBaseline>): void;
  baselineRunCellId: string;
  scenarioExpectations(
    result: ReturnType<typeof runScenario>,
    baselineResult: ReturnType<typeof runBaseline>
  ): void;
  scenarioRunCellId: string;
  templateId: TemplateId;
}

const TEMPLATE_CASES: TemplateSmokeCase[] = [
  {
    templateId: "opensimplest",
    baselineRunCellId: "baseline-run",
    scenarioRunCellId: "export-shock-run",
    baselineExpectations(result) {
      expect(result.options.periods).toBe(40);
      expect(result.series.Y.length).toBe(40);
      expect(result.series.X.length).toBe(40);
      expect(result.series.CA.length).toBe(40);
      expect(result.series.XR.length).toBe(40);
      expect(Math.abs(result.series.sectoral_check[0] ?? NaN)).toBeLessThan(1e-6);
      expect(Number.isFinite(result.series.V.at(-1) ?? NaN)).toBe(true);
    },
    scenarioExpectations(result, baselineResult) {
      expect(result.options.periods).toBe(40);
      expect(result.series.X.length).toBe(40);
      expect(result.series.XR.length).toBe(40);
      expect(Number.isFinite(result.series.X.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.XR.at(-1) ?? NaN)).toBe(true);
      expect(result.series.X[5] ?? NaN).toBeLessThan(baselineResult.series.X[5] ?? NaN);
    }
  },
  {
    templateId: "opensimplest-levy",
    baselineRunCellId: "baseline-run",
    scenarioRunCellId: "export-shock-run",
    baselineExpectations(result) {
      expect(result.options.periods).toBe(150);
      expect(result.series.y.length).toBe(150);
      expect(result.series.x.length).toBe(150);
      expect(result.series.CA.length).toBe(150);
      expect(result.series.xr.length).toBe(150);
      expect(Math.abs(result.series.sectoral_check[0] ?? NaN)).toBeLessThan(1e-6);
      expect(Number.isFinite(result.series.v.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series["H^P"].at(-1) ?? NaN)).toBe(true);
    },
    scenarioExpectations(result, baselineResult) {
      expect(result.options.periods).toBe(150);
      expect(result.series.x.length).toBe(150);
      expect(result.series.xr.length).toBe(150);
      expect(Number.isFinite(result.series.x.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.xr.at(-1) ?? NaN)).toBe(true);
      expect(result.series.x[5] ?? NaN).toBeLessThan(baselineResult.series.x[5] ?? NaN);
    }
  },
  {
    templateId: "predator-prey",
    baselineRunCellId: "baseline-run",
    scenarioRunCellId: "scenario-run",
    baselineExpectations(result) {
      expect(result.options.periods).toBe(120);
      expect(result.series.prey.length).toBe(120);
      expect(result.series.predator.length).toBe(120);
      expect(result.series.prey.at(-1)).toBeTypeOf("number");
      expect(result.series.predator.at(-1)).toBeTypeOf("number");
      expect(Number.isFinite(result.series.prey.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.predator.at(-1) ?? NaN)).toBe(true);
    },
    scenarioExpectations(result) {
      expect(result.options.periods).toBe(50);
      expect(result.series.prey.length).toBe(50);
      expect(result.series.predator.length).toBe(50);
      expect(Number.isFinite(result.series.prey.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.predator.at(-1) ?? NaN)).toBe(true);
    }
  },
  {
    templateId: "gl6-dis-rentier",
    baselineRunCellId: "baseline-run",
    scenarioRunCellId: "scenario-2-run",
    baselineExpectations(result) {
      expect(result.options.periods).toBe(80);
      expect(result.series.Y.length).toBe(80);
      expect(Number.isFinite(result.series.Y.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.Bh.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.Mh.at(-1) ?? NaN)).toBe(true);
      expect(Math.abs(result.series.gap.at(-1) ?? NaN)).toBeLessThan(1e-6);
    },
    scenarioExpectations(result) {
      expect(result.options.periods).toBe(55);
      expect(result.series.Bh.length).toBe(55);
      expect(Number.isFinite(result.series.Bh.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.Mh.at(-1) ?? NaN)).toBe(true);
    }
  },
  {
    templateId: "gl6-dis-rentier-v2",
    baselineRunCellId: "baseline-run",
    scenarioRunCellId: "scenario-2-run",
    baselineExpectations(result) {
      expect(result.options.periods).toBe(100);
      expect(result.series.ydhs.length).toBe(100);
      expect(Number.isFinite(result.series.ydhs.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.Mh.at(-1) ?? NaN)).toBe(true);
    },
    scenarioExpectations(result) {
      expect(result.options.periods).toBe(50);
      expect(result.series.inv.length).toBe(50);
      expect(Number.isFinite(result.series.inv.at(-1) ?? NaN)).toBe(true);
      expect(Number.isFinite(result.series.inv_E.at(-1) ?? NaN)).toBe(true);
    }
  }
];

describe("notebook template smoke tests", () => {
  for (const templateCase of TEMPLATE_CASES) {
    it(`builds and runs ${templateCase.templateId}`, () => {
      const document = NOTEBOOK_TEMPLATES[templateCase.templateId].document;
      const baselineRunCell = document.cells.find(
        (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
          cell.type === "run" && cell.id === templateCase.baselineRunCellId
      );
      const scenarioRunCell = document.cells.find(
        (cell): cell is Extract<(typeof document.cells)[number], { type: "run" }> =>
          cell.type === "run" && cell.id === templateCase.scenarioRunCellId
      );

      expect(baselineRunCell).toBeDefined();
      expect(scenarioRunCell).toBeDefined();

      if (!baselineRunCell || !scenarioRunCell) {
        throw new Error(`Expected run cells to exist for ${templateCase.templateId}.`);
      }

      const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
      expect(baselineEditor).not.toBeNull();
      if (!baselineEditor) {
        throw new Error(`Expected baseline editor state for ${templateCase.templateId}.`);
      }

      const baselineRuntime = buildRuntimeConfig(baselineEditor);
      const baselineResult = runBaseline(baselineRuntime.model, baselineRuntime.options);

      templateCase.baselineExpectations(baselineResult);

      const scenarioEditor = buildEditorStateForNotebookModel(document, scenarioRunCell);
      expect(scenarioEditor).not.toBeNull();
      if (!scenarioEditor) {
        throw new Error(`Expected scenario editor state for ${templateCase.templateId}.`);
      }

      const scenarioRuntime = buildRuntimeConfig(scenarioEditor);
      const scenarioOptions =
        scenarioRunCell.periods == null
          ? scenarioRuntime.options
          : { ...scenarioRuntime.options, periods: scenarioRunCell.periods };
      const scenarioResult = runScenario(
        baselineResult,
        scenarioRunCell.scenario ?? { shocks: [] },
        scenarioOptions
      );

      templateCase.scenarioExpectations(scenarioResult, baselineResult);
    });
  }
});
