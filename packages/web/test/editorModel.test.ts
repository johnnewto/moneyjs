import { describe, expect, it } from "vitest";

import {
  editorStateFromJson,
  editorStateFromModel,
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
});
