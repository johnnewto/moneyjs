import { describe, expect, it } from "vitest";

import type { EditorState } from "../src/lib/editorModel";
import {
  applyConstantExternalOverrides,
  hasParameterOverrides,
  heuristicSliderRange,
  listConstantParameterEntries,
  parseConstantBaselineValue,
  resolveEffectiveConstantValue
} from "../src/lib/externalParameterControls";
import type { CatalogModelContext } from "../src/lib/variableCatalog";

const baseEditor: EditorState = {
  equations: [],
  externals: [
    {
      id: "ext-1",
      name: "alpha1",
      kind: "constant",
      valueText: "0.6"
    },
    {
      id: "ext-2",
      name: "Gd",
      kind: "constant",
      valueText: "20"
    },
    {
      id: "ext-3",
      name: "shock",
      kind: "series",
      valueText: "1, 2, 3"
    },
    {
      id: "ext-4",
      name: "",
      kind: "constant",
      valueText: "1"
    },
    {
      id: "ext-5",
      name: "bad",
      kind: "constant",
      valueText: "not-a-number"
    }
  ],
  initialValues: [],
  options: {
    periods: 10,
    solverMethod: "NEWTON",
    toleranceText: "1e-8",
    maxIterations: 100,
    defaultInitialValueText: "0",
    hiddenLeftVariable: "",
    hiddenRightVariable: "",
    hiddenToleranceText: "0.00001",
    relativeHiddenTolerance: false
  },
  scenario: { shocks: [] }
};

describe("externalParameterControls", () => {
  it("parses constant baseline values", () => {
    expect(parseConstantBaselineValue("0.6")).toBe(0.6);
    expect(parseConstantBaselineValue(" 20 ")).toBe(20);
    expect(parseConstantBaselineValue("bad")).toBeNull();
  });

  it("resolves effective constant values", () => {
    expect(resolveEffectiveConstantValue(0.6, undefined)).toBe(0.6);
    expect(resolveEffectiveConstantValue(0.6, 0.75)).toBe(0.75);
  });

  it("builds heuristic slider ranges", () => {
    expect(heuristicSliderRange(0)).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(heuristicSliderRange(0.6)).toEqual({ min: 0, max: 1, step: 0.01 });
    expect(heuristicSliderRange(20)).toEqual({ min: 10, max: 30, step: 0.2 });
  });

  it("applies constant overrides without touching series rows", () => {
    const merged = applyConstantExternalOverrides(baseEditor, { alpha1: 0.75, shock: 99 });

    expect(merged.externals.find((row) => row.name === "alpha1")?.valueText).toBe("0.75");
    expect(merged.externals.find((row) => row.name === "Gd")?.valueText).toBe("20");
    expect(merged.externals.find((row) => row.name === "shock")?.valueText).toBe("1, 2, 3");
  });

  it("lists constant parameter entries only", () => {
    const contexts: CatalogModelContext[] = [
      {
        editor: baseEditor,
        modelId: "sim",
        modelKey: "model:sim",
        modelTitle: "SIM",
        modelSource: { sourceModelId: "sim" }
      }
    ];

    const entries = listConstantParameterEntries(contexts);
    expect(entries.map((entry) => entry.external.name)).toEqual(["alpha1", "Gd"]);
    expect(entries[0]?.baselineValue).toBe(0.6);
    expect(entries[1]?.baselineValue).toBe(20);
  });

  it("detects pending overrides", () => {
    expect(hasParameterOverrides({})).toBe(false);
    expect(hasParameterOverrides({ sim: {} })).toBe(false);
    expect(hasParameterOverrides({ sim: { alpha1: 0.7 } })).toBe(true);
  });
});
