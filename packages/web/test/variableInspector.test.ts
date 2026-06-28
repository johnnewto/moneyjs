import { describe, expect, it } from "vitest";

import { editorStateFromModel, type EditorState } from "../src/lib/editorModel";
import { buildVariableInspectorData } from "../src/lib/variableInspector";
import {
  buildVariableDescriptions,
  getVariableDescription
} from "../src/lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../src/lib/units";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import { getNotebookTemplateDocument } from "../src/notebook/templates";
import type { RunCell } from "../src/notebook/types";
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

  it("exposes the initial value alongside the defining equation", () => {
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
    expect(data?.initialValue).toBe(10);
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

  it("resolves the defining equation for a transformed LHS name (TSDELTALOG/TSDELTA/TSDELTAP)", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [
      { id: "eq-lh", name: "TSDELTALOG(lh,1)", expression: "0.0583*TSLAG(cons/yd,1)" },
      { id: "eq-credit", name: "TSDELTA(credit,1)", expression: "lh" },
      { id: "eq-oph", name: "TSDELTAP(oph,1)", expression: "2" }
    ];

    const variableDescriptions = buildVariableDescriptions({
      equations: editor.equations,
      externals: editor.externals
    });
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: editor.equations,
      externals: editor.externals
    });

    const lhData = buildVariableInspectorData({
      editor,
      selectedVariable: "lh",
      variableDescriptions,
      variableUnitMetadata
    });
    expect(lhData?.definingEquation?.id).toBe("eq-lh");
    expect(lhData?.definingEquation?.name).toBe("TSDELTALOG(lh,1)");
    expect(lhData?.kind).toBe("equation");

    const creditData = buildVariableInspectorData({
      editor,
      selectedVariable: "credit",
      variableDescriptions,
      variableUnitMetadata
    });
    expect(creditData?.definingEquation?.id).toBe("eq-credit");
    expect(creditData?.definingEquation?.name).toBe("TSDELTA(credit,1)");

    const ophData = buildVariableInspectorData({
      editor,
      selectedVariable: "oph",
      variableDescriptions,
      variableUnitMetadata
    });
    expect(ophData?.definingEquation?.id).toBe("eq-oph");
    expect(ophData?.definingEquation?.name).toBe("TSDELTAP(oph,1)");
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

describe("variableInspector observed data", () => {
  it("flags variables that have an observed series, even when defined by an equation", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [{ id: "eq-cons", name: "cons", expression: "yd" }];
    editor.externals = [
      {
        id: "obs-cons",
        name: "cons",
        kind: "series",
        valueText: "1, 2, 3",
        observed: true
      }
    ];

    const data = buildVariableInspectorData({
      editor,
      selectedVariable: "cons",
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
    expect(data?.hasObservedData).toBe(true);
  });

  it("does not flag variables without an observed series", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [{ id: "eq-cons", name: "cons", expression: "yd" }];
    editor.externals = [
      { id: "ext-yd", name: "yd", kind: "constant", valueText: "5" }
    ];

    const data = buildVariableInspectorData({
      editor,
      selectedVariable: "cons",
      variableDescriptions: buildVariableDescriptions({
        equations: editor.equations,
        externals: editor.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor.equations,
        externals: editor.externals
      })
    });

    expect(data?.hasObservedData).toBe(false);
  });
});

describe("variableInspector observed data (italy-sfc template)", () => {
  it("flags an observed variable from the template's observed cell", () => {
    const document = getNotebookTemplateDocument("italy-sfc");
    const runCell = document.cells.find(
      (cell): cell is RunCell => cell.type === "run" && cell.id === "baseline-run"
    );
    expect(runCell).toBeTruthy();
    const editor = buildEditorStateForNotebookModel(document, runCell!);
    expect(editor).toBeTruthy();

    const data = buildVariableInspectorData({
      editor: editor!,
      notebookCells: document.cells,
      modelSource: { sourceModelId: "italy-sfc" },
      sourceRunCellId: runCell!.id,
      selectedVariable: "cons",
      variableDescriptions: buildVariableDescriptions({
        equations: editor!.equations,
        externals: editor!.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor!.equations,
        externals: editor!.externals
      })
    });

    expect(data?.hasObservedData).toBe(true);

    const lpc = buildVariableInspectorData({
      editor: editor!,
      notebookCells: document.cells,
      modelSource: { sourceModelId: "italy-sfc" },
      sourceRunCellId: runCell!.id,
      selectedVariable: "Lpc",
      variableDescriptions: buildVariableDescriptions({
        equations: editor!.equations,
        externals: editor!.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor!.equations,
        externals: editor!.externals
      })
    });
    expect(lpc?.kind).toBe("equation");
    expect(lpc?.initialValue).toBeTypeOf("number");
    expect(lpc?.hasObservedData).toBe(true);
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

  it("shows ∫ = I(columnRef) when inspecting an empty sum-row integral placeholder", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [
      { id: "eq-wbd", name: "WBd", expression: "4" },
      { id: "eq-cs", name: "Cs", expression: "1" }
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
            { band: "Wages", label: "Wages", values: ["WBd", "0"] },
            { band: "Consumption", label: "Consumption", values: ["-Cs", "0"] },
            { band: "Sum", label: "Sum", values: ["", "0"] }
          ]
        }
      ],
      modelSource: { sourceModelId: "sim" },
      sourceRunCellId: "baseline-run",
      selectedVariable: "∫:Households.Deposits",
      variableDescriptions: buildVariableDescriptions({
        equations: editor.equations,
        externals: editor.externals
      }),
      variableUnitMetadata: buildVariableUnitMetadata({
        equations: editor.equations,
        externals: editor.externals
      })
    });

    expect(data?.kind).toBe("matrix-column-integral");
    expect(data?.name).toBe("∫");
    expect(data?.matrixColumnIntegral).toMatchObject({
      columnRef: "Households.Deposits",
      expression: "I(Households.Deposits)",
      sources: ["WBd", "-Cs"]
    });
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
