import { describe, expect, it } from "vitest";

import {
  diagnoseBuildRuntime,
  editorStateFromJson,
  editorStateFromModel,
  buildRuntimeConfig,
  runtimeDocumentToJson,
  validateEditorState
} from "../src/lib/editorModel";
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
        severity: "error",
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
});
