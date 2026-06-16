import { describe, expect, it } from "vitest";

import {
  diagnoseBuildRuntime,
  editorStateFromJson,
  editorStateFromModel,
  buildRuntimeConfig,
  runtimeDocumentToJson,
  validateEditorState
} from "../src/lib/editorModel";
import type { EquationsCell, MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";
import {
  simBaselineModel,
  simBaselineOptions,
  simGovernmentSpendingShock
} from "../../core/src/fixtures/sim";

describe("editor model validation", () => {
  it("accepts the SIM preset without editor issues", () => {
    const editor = editorStateFromModel(
      simBaselineModel,
      simBaselineOptions,
      simGovernmentSpendingShock
    );

    expect(validateEditorState(editor)).toHaveLength(0);
  });

  it("detects duplicate equation names and invalid numbers", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[1]!.name = editor.equations[0]!.name;
    editor.externals[0]!.valueText = "abc";
    editor.options.toleranceText = "-1";

    const issues = validateEditorState(editor);

    expect(issues.some((issue) => issue.path === "equations.1.name")).toBe(true);
    expect(issues.some((issue) => issue.path === "externals.0.valueText")).toBe(true);
    expect(issues.some((issue) => issue.path === "options.toleranceText")).toBe(true);
  });

  it("detects incomplete hidden equation configuration", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.options.hiddenLeftVariable = "Hh";
    editor.options.hiddenRightVariable = "";

    const issues = validateEditorState(editor);

    expect(issues.some((issue) => issue.path === "options.hiddenEquation")).toBe(true);
  });

  it("round-trips runtime JSON through the editor model", () => {
    const original = editorStateFromModel(
      simBaselineModel,
      simBaselineOptions,
      simGovernmentSpendingShock
    );

    const json = runtimeDocumentToJson(original);
    const restored = editorStateFromJson(json);

    expect(restored.equations).toHaveLength(original.equations.length);
    expect(restored.externals).toHaveLength(original.externals.length);
    expect(restored.scenario.shocks).toHaveLength(original.scenario.shocks.length);
    expect(json).toMatch(/\{ "name": "[^"]+", "expression": "[^"]+" \}/);
  });

  it("omits disabled initial values from runtime config", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.initialValues = [
      { id: "init-hh", name: "Hh", valueText: "80" },
      { id: "init-y", name: "Y", valueText: "100", enabled: false }
    ];

    const runtime = buildRuntimeConfig(editor);

    expect(runtime.model.initialValues).toEqual({ Hh: 80 });
    expect(validateEditorState(editor).some((issue) => issue.path.startsWith("initialValues."))).toBe(
      false
    );
  });

  it("preserves explicit equation roles between editor and runtime config", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      ...editor.equations[0]!,
      role: "identity"
    };

    const runtime = buildRuntimeConfig(editor);

    expect(runtime.model.equations[0]).toMatchObject({
      name: editor.equations[0]!.name,
      role: "identity"
    });
  });

  it("rejects malformed shock rows", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, simGovernmentSpendingShock);
    const shock = editor.scenario.shocks[0]!;
    shock.startPeriodInclusive = 0;
    shock.endPeriodInclusive = -1;
    shock.variables[0]!.valueText = "not-a-number";

    const issues = validateEditorState(editor);

    expect(issues.some((issue) => issue.path.endsWith("startPeriodInclusive"))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith("endPeriodInclusive"))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith("valueText"))).toBe(true);
  });

  it("flags definite stock-plus-flow additions", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-v",
      name: "V",
      expression: "K + C",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-k",
      name: "K",
      expression: "1",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[2] = {
      id: "eq-c",
      name: "C",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(
      diagnostics.issues.some(
        (issue) =>
          issue.path === "equations.0.expression" &&
          issue.message.includes("Cannot combine $ with $/yr")
      )
    ).toBe(true);
  });

  it("allows stock accumulation equations around lag(stock)", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-mh",
      name: "Mh",
      expression: "lag(Mh) + YD - C",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-yd",
      name: "YD",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };
    editor.equations[2] = {
      id: "eq-c",
      name: "C",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("implicit dt = 1")
      })
    ]);
  });

  it("warns that lag(stock) + d(otherStock) should add explicit dt", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-ls",
      name: "Ls",
      expression: "lag(Ls) + d(Ld)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-ld",
      name: "Ld",
      expression: "1",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("Prefer adding '* dt' explicitly")
      })
    ]);
  });

  it("allows explicit dt in stock accumulation expressions", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-ls",
      name: "Ls",
      expression: "lag(Ls) + d(Ld) * dt",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-ld",
      name: "Ld",
      expression: "1",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toHaveLength(0);
  });

  it("accepts stock integrator form I(flow) for stock equations", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-bs",
      name: "Bs",
      expression: "I(G - TX)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-g",
      name: "G",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };
    editor.equations[2] = {
      id: "eq-tx",
      name: "TX",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toHaveLength(0);
  });

  it("accepts I(Households.Deposits) for matrix-linked stock equations", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-mh",
      name: "Mh",
      expression: "I(Households.Deposits)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toHaveLength(0);
  });

  it("flags I(flow) when the inner expression is not a flow", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-bs",
      name: "Bs",
      expression: "I(Bh)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-bh",
      name: "Bh",
      expression: "1",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("expects a flow with units $/yr")
      })
    ]);
  });

  it("rejects nested I(...) usage in equation editor diagnostics", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-bs",
      name: "Bs",
      expression: "lag(Bs) + I(G - TX)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-g",
      name: "G",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };
    editor.equations[2] = {
      id: "eq-tx",
      name: "TX",
      expression: "1",
      unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
    };

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(
      diagnostics.issues.some(
        (issue) =>
          issue.path === "equations.0.expression" &&
          issue.message.includes("I(...) is only supported as the outermost RHS form")
      )
    ).toBe(true);
  });

  it("normalizes derivative-balance targets in runtime config while preserving editor rows", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-ls",
      name: "d(Ls)",
      expression: "d(Ld)",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };
    editor.equations[1] = {
      id: "eq-ld",
      name: "Ld",
      expression: "2",
      unitMeta: { stockFlow: "stock", signature: { money: 1 } }
    };

    const runtime = buildRuntimeConfig(editor);

    expect(editor.equations[0]?.name).toBe("d(Ls)");
    expect(editor.equations[0]?.expression).toBe("d(Ld)");
    expect(runtime.model.equations[0]).toMatchObject({
      name: "Ls",
      expression: "I(d(Ld))"
    });
  });

  it("rejects duplicate stock definitions across canonical and derivative-balance names", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations[0] = {
      id: "eq-ls",
      name: "Ls",
      expression: "1"
    };
    editor.equations[1] = {
      id: "eq-d-ls",
      name: "d(Ls)",
      expression: "d(Ld)"
    };

    const issues = validateEditorState(editor);

    expect(
      issues.some(
        (issue) =>
          issue.path === "equations.1.name" &&
          issue.message.includes("Stock 'Ls' is already defined")
      )
    ).toBe(true);
  });

  it("accepts derivative-balance stock equations in runtime diagnostics", () => {
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

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(diagnostics.modelError).toBeNull();
    expect(diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")).toHaveLength(0);
  });

  it("accepts derivative-balance equations when both stocks have unit metadata", () => {
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
        expression: "2",
        unitMeta: { stockFlow: "stock", signature: { money: 1 } }
      }
    ];
    editor.initialValues = [{ id: "init-ls", name: "Ls", valueText: "10" }];

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(
      diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")
    ).toHaveLength(0);
  });

  it("flags derivative-balance equations whose RHS is not flow-sized", () => {
    const editor = editorStateFromModel(simBaselineModel, simBaselineOptions, null);
    editor.equations = [
      {
        id: "eq-ls",
        name: "d(Ls)",
        expression: "Ld",
        unitMeta: { stockFlow: "stock", signature: { money: 1 } }
      },
      {
        id: "eq-ld",
        name: "Ld",
        expression: "2",
        unitMeta: { stockFlow: "stock", signature: { money: 1 } }
      }
    ];

    const diagnostics = diagnoseBuildRuntime(editor);

    expect(
      diagnostics.issues.filter((issue) => issue.path === "equations.0.expression")
    ).toEqual([
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("I(...) for stock 'Ls' expects a flow")
      })
    ]);
  });

  it("injects implicit I(columnRef) accumulation equations from account-transactions sum rows", () => {
    const modelId = "pc-baseline";
    const equationsCell: EquationsCell = {
      id: "equations",
      type: "equations",
      title: "Equations",
      modelId,
      equations: [
        { id: "eq-wbd", name: "WBd", expression: "4" },
        { id: "eq-cs", name: "Cs", expression: "1" }
      ]
    };
    const runCell: RunCell = {
      id: "baseline-run",
      type: "run",
      title: "Baseline",
      sourceModelId: modelId,
      mode: "baseline",
      resultKey: "baseline",
      periods: 4
    };
    const matrix: MatrixCell = {
      id: "account-transactions",
      type: "matrix",
      title: "Account transactions",
      sourceRunCellId: "baseline-run",
      accountingKind: "account-transactions",
      columns: ["Households.Deposits (Mh)", "Sum"],
      sectors: ["Households", ""],
      rows: [
        { band: "Wages", label: "Wages", values: ["WBd", "0"] },
        { band: "Consumption", label: "Consumption", values: ["-Cs", "0"] },
        { band: "Sum", label: "Sum", values: ["", "0"] }
      ]
    };
    const cells: NotebookCell[] = [equationsCell, runCell, matrix];
    const editor = {
      equations: equationsCell.equations,
      externals: [],
      initialValues: [{ id: "init-mh", name: "Mh", valueText: "10" }],
      options: {
        periods: 4,
        solverMethod: "GAUSS_SEIDEL" as const,
        toleranceText: "1e-9",
        maxIterations: 20,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "1e-5",
        relativeHiddenTolerance: false
      },
      scenario: { shocks: [] }
    };

    const runtime = buildRuntimeConfig(editor, {
      notebookCells: cells,
      modelId,
      runCellId: "baseline-run"
    });

    expect(runtime.model.equations).toEqual(
      expect.arrayContaining([
        { name: "WBd", expression: "4" },
        { name: "Cs", expression: "1" }
      ])
    );
    expect(runtime.model.equations.some((equation) => equation.name === "Mh")).toBe(false);
    expect(runtime.model.matrixColumnSums).toBeUndefined();
  });
});
