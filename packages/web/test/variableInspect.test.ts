import { describe, expect, it } from "vitest";

import {
  applyInspectorDefiningEquationExpression,
  resolveInspectorModelSource,
  updateEditorDefiningEquationExpression
} from "../src/lib/variableInspect";
import type { EditorState } from "../src/lib/editorModel";
import type { NotebookDocument } from "../src/notebook/types";

describe("variableInspect", () => {
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
