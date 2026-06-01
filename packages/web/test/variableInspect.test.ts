import { describe, expect, it } from "vitest";

import {
  applyInspectorDefiningEquationExpression,
  buildInspectorCurrentValues,
  buildInspectorSeriesValues,
  resolveInspectorModelSource,
  updateEditorDefiningEquationExpression
} from "../src/lib/variableInspect";
import type { EditorState } from "../src/lib/editorModel";
import type { NotebookDocument } from "../src/notebook/types";

describe("variableInspect", () => {
  it("builds current values from the first matching run unless sourceRunCellId is set", () => {
    const document: NotebookDocument = {
      id: "nb",
      title: "Test",
      metadata: { version: 1 },
      cells: [
        {
          id: "run-baseline",
          type: "run",
          title: "Baseline",
          mode: "baseline",
          sourceModelId: "m1",
          periods: 3
        },
        {
          id: "run-scenario",
          type: "run",
          title: "Scenario",
          mode: "scenario",
          sourceModelId: "m1",
          periods: 3,
          baselineRunCellId: "run-baseline",
          scenario: { shocks: [] }
        }
      ]
    };

    const currentValues = buildInspectorCurrentValues({
      cells: document.cells,
      getResult: (runCellId) =>
        runCellId === "run-scenario"
          ? {
              options: { periods: 3 },
              series: {
                Y: [0, 10, 20]
              }
            }
          : {
              options: { periods: 3 },
              series: {
                Y: [0, 1, 2]
              }
            },
      modelSource: { sourceModelId: "m1" },
      selectedPeriodIndex: 2
    });

    expect(currentValues.Y).toBe(2);

    const scenarioValues = buildInspectorCurrentValues({
      cells: document.cells,
      getResult: (runCellId) =>
        runCellId === "run-scenario"
          ? {
              options: { periods: 3 },
              series: {
                Y: [0, 10, 20]
              }
            }
          : {
              options: { periods: 3 },
              series: {
                Y: [0, 1, 2]
              }
            },
      modelSource: { sourceModelId: "m1" },
      selectedPeriodIndex: 2,
      sourceRunCellId: "run-scenario"
    });

    expect(scenarioValues.Y).toBe(20);

    const baselineSeries = buildInspectorSeriesValues({
      cells: document.cells,
      getResult: (runCellId) =>
        runCellId === "run-scenario"
          ? { options: { periods: 3 }, series: { Y: [0, 10, 20] } }
          : { options: { periods: 3 }, series: { Y: [0, 1, 2] } },
      modelSource: { sourceModelId: "m1" },
      variableName: "Y"
    });
    const scenarioSeries = buildInspectorSeriesValues({
      cells: document.cells,
      getResult: (runCellId) =>
        runCellId === "run-scenario"
          ? { options: { periods: 3 }, series: { Y: [0, 10, 20] } }
          : { options: { periods: 3 }, series: { Y: [0, 1, 2] } },
      modelSource: { sourceModelId: "m1" },
      sourceRunCellId: "run-scenario",
      variableName: "Y"
    });

    expect(baselineSeries).toEqual([0, 1, 2]);
    expect(scenarioSeries).toEqual([0, 10, 20]);
  });

  it("resolves model id from run cell source", () => {
    expect(
      resolveInspectorModelSource({
        sourceModelId: "bmw-model"
      })
    ).toEqual({ sourceModelId: "bmw-model" });
  });

  it("updates defining equation expression in editor state", () => {
    const editor: EditorState = {
      equations: [{ id: "eq-y", name: "Y", expression: "C + I", desc: "" }],
      externals: [],
      initialValues: [],
      options: {
        periods: 10,
        solverMethod: "GAUSS_SEIDEL",
        toleranceText: "1e-15",
        maxIterations: 200,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "0.00001",
        relativeHiddenTolerance: false
      },
      scenario: { shocks: [] }
    };

    const next = updateEditorDefiningEquationExpression(editor, "eq-y", "C + I + G");
    expect(next.equations[0]?.expression).toBe("C + I + G");
  });

  it("patches sectioned notebook equations cell", () => {
    const document: NotebookDocument = {
      id: "nb",
      title: "Test",
      metadata: { version: 1 },
      cells: [
        {
          id: "eq-cell",
          type: "equations",
          title: "Equations",
          modelId: "m1",
          equations: [{ id: "eq-y", name: "Y", expression: "C", desc: "" }]
        },
        {
          id: "solver-cell",
          type: "solver",
          title: "Solver",
          modelId: "m1",
          options: {
            periods: 10,
            solverMethod: "GAUSS_SEIDEL",
            toleranceText: "1e-15",
            maxIterations: 200,
            defaultInitialValueText: "1e-15",
            hiddenLeftVariable: "",
            hiddenRightVariable: "",
            hiddenToleranceText: "0.00001",
            relativeHiddenTolerance: false
          }
        }
      ]
    };

    const next = applyInspectorDefiningEquationExpression(document, { sourceModelId: "m1" }, "eq-y", "C + G");
    const equationsCell = next.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type === "equations" ? equationsCell.equations[0]?.expression : null).toBe(
      "C + G"
    );
  });
});
