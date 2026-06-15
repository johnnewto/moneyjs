import { describe, expect, it } from "vitest";

import { editorStateFromModel, type EditorState } from "../src/lib/editorModel";
import { buildVariableInspectorData } from "../src/lib/variableInspector";
import {
  buildVariableDescriptions,
  getVariableDescription
} from "../src/lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../src/lib/units";
import { simBaselineModel, simBaselineOptions } from "../../core/src/fixtures/sim";

function buildInspectorEditor(): EditorState {
  const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
  editor.equations = [
    {
      id: "eq-ls",
      name: "d(Ls)",
      expression: "d(Ld)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    },
    {
      id: "eq-ld",
      name: "Ld",
      expression: "2"
    }
  ];
  editor.initialValues = [{ id: "init-ls", name: "Ls", valueText: "10" }];
  return editor;
}

describe("variableInspector derivative-balance", () => {
  it("resolves defining equation when inspecting the underlying stock", () => {
    const editor = buildInspectorEditor();
    const variableDescriptions = buildVariableDescriptions({
      equations: editor.equations,
      externals: editor.externals
    });
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: editor.equations,
      externals: editor.externals
    });

    const data = buildVariableInspectorData({
      editor,
      selectedVariable: "Ls",
      variableDescriptions,
      variableUnitMetadata
    });

    expect(data?.definingEquation?.id).toBe("eq-ls");
    expect(data?.definingEquation?.name).toBe("d(Ls)");
    expect(data?.definingEquation?.expression).toBe("d(Ld)");
    expect(data?.kind).toBe("equation");
  });

  it("explains derivative-balance equations using authored change notation", () => {
    const editor = buildInspectorEditor();
    const variableDescriptions = buildVariableDescriptions({
      equations: editor.equations,
      externals: editor.externals
    });
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: editor.equations,
      externals: editor.externals
    });

    const data = buildVariableInspectorData({
      editor,
      selectedVariable: "Ls",
      variableDescriptions,
      variableUnitMetadata
    });

    expect(data?.generatedEquationExplanation).toMatch(/change in Ls/i);
    expect(data?.generatedEquationExplanation).toMatch(/change in Ld/i);
    expect(data?.generatedEquationExplanation).not.toMatch(/accumulated value/i);
  });

  it("still resolves defining equation when the derivative-balance name is selected", () => {
    const editor = buildInspectorEditor();
    const variableDescriptions = buildVariableDescriptions({
      equations: editor.equations,
      externals: editor.externals
    });
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: editor.equations,
      externals: editor.externals
    });

    const data = buildVariableInspectorData({
      editor,
      selectedVariable: "d(Ls)",
      variableDescriptions,
      variableUnitMetadata
    });

    expect(data?.definingEquation?.id).toBe("eq-ls");
    expect(data?.name).toBe("d(Ls)");
  });

  it("uses the d(K) row description for the underlying stock in generated explanations", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [
      {
        id: "eq-k",
        name: "d(K)",
        desc: "Stock of Capital",
        expression: "d(Id) - DA"
      },
      { id: "eq-id", name: "Id", desc: "Demand for investment goods", expression: "1" },
      { id: "eq-da", name: "DA", desc: "Depreciation allowance", expression: "1" }
    ];
    editor.initialValues = [{ id: "init-k", name: "K", valueText: "100" }];

    const variableDescriptions = buildVariableDescriptions({
      equations: editor.equations,
      externals: editor.externals
    });

    expect(getVariableDescription(variableDescriptions, "K")).toBe("Stock of Capital");

    const data = buildVariableInspectorData({
      editor,
      selectedVariable: "K",
      variableDescriptions,
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor.equations,
        externals: editor.externals
      })
    });

    expect(data?.generatedEquationExplanation).toContain("Stock of Capital");
    expect(data?.generatedEquationExplanation).not.toMatch(/change in K equals/i);
  });
});

describe("variableInspector matrix column sums", () => {
  it("treats Households.Deposits as an inspectable matrix column sum", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [
      {
        id: "eq-mh",
        name: "Mh",
        expression: "Mh' + Households.Deposits * dt",
        role: "accumulation"
      }
    ];

    const data = buildVariableInspectorData({
      editor,
      notebookCells: [
        {
          id: "baseline-run",
          type: "run",
          title: "Baseline",
          sourceModelId: "sim",
          mode: "baseline",
          resultKey: "baseline",
          periods: 10
        },
        {
          id: "account-transactions",
          type: "matrix",
          title: "Account transactions",
          sourceRunCellId: "baseline-run",
          accountingKind: "account-transactions",
          columns: ["Deposits (Mh)", "Sum"],
          sectors: ["Households(HH)", ""],
          rows: [
            { band: "Income", label: "Income", values: ["YD - Cd", "0"] },
            { band: "Sum", label: "Sum", values: ["Mh", "0"] }
          ]
        }
      ],
      modelSource: { sourceModelId: "sim" },
      sourceRunCellId: "baseline-run",
      selectedVariable: "Households.Deposits",
      variableDescriptions: buildVariableDescriptions({
        equations: editor.equations,
        externals: editor.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor.equations,
        externals: editor.externals
      })
    });

    expect(data?.kind).toBe("matrix-column-sum");
    expect(data?.matrixColumnSum).toMatchObject({
      columnRef: "Households.Deposits",
      expression: "Households.Deposits",
      stockVariable: "Mh"
    });
    expect(data?.equationInputs.current).toContain("Cd");
    expect(data?.equationInputs.current).toContain("YD");
  });

  it("shows implicit I(columnRef) accumulation when inspecting a sum-row stock without an equation", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [
      { id: "eq-wbd", name: "WBd", expression: "4" },
      { id: "eq-cs", name: "Cs", expression: "1" }
    ];
    editor.initialValues = [{ id: "init-mh", name: "Mh", valueText: "10" }];

    const data = buildVariableInspectorData({
      editor,
      notebookCells: [
        {
          id: "baseline-run",
          type: "run",
          title: "Baseline",
          sourceModelId: "sim",
          mode: "baseline",
          resultKey: "baseline",
          periods: 10
        },
        {
          id: "account-transactions",
          type: "matrix",
          title: "Account transactions",
          sourceRunCellId: "baseline-run",
          accountingKind: "account-transactions",
          columns: ["Deposits (Mh)", "Sum"],
          sectors: ["Households(HH)", ""],
          rows: [
            { band: "Wages", label: "Wages", values: ["WBd", "0"] },
            { band: "Consumption", label: "Consumption", values: ["-Cs", "0"] },
            { band: "Sum", label: "Sum", values: ["Mh", "0"] }
          ]
        }
      ],
      modelSource: { sourceModelId: "sim" },
      sourceRunCellId: "baseline-run",
      selectedVariable: "Mh",
      variableDescriptions: buildVariableDescriptions({
        equations: editor.equations,
        externals: editor.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor.equations,
        externals: editor.externals
      })
    });

    expect(data?.kind).toBe("equation");
    expect(data?.isImplicitEquation).toBe(true);
    expect(data?.definingEquation).toMatchObject({
      id: "implicit-matrix-Mh",
      name: "Mh",
      expression: "I(Households.Deposits)"
    });
    expect(data?.equationRoleSourceLabel).toBe("From matrix Sum row");
    expect(data?.equationInputs.current).toEqual(expect.arrayContaining(["WBd", "Cs"]));
    expect(data?.generatedEquationExplanation).toMatch(/accumulated value/i);
  });
});
