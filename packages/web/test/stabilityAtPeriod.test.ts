import { describe, expect, it } from "vitest";

import { runBaseline } from "@sfcr/core";

import {
  formatStabilityClassification,
  formatTransitionLoopGain,
  resolveNotebookStabilityTarget,
  stabilityPeriodFromUiIndex
} from "../src/lib/stabilityAtPeriod";
import type { NotebookDocument } from "../src/notebook/types";

describe("stabilityPeriodFromUiIndex", () => {
  it("returns null for the initial UI period", () => {
    expect(stabilityPeriodFromUiIndex(0)).toBeNull();
  });

  it("maps UI period index to solver period index", () => {
    expect(stabilityPeriodFromUiIndex(2)).toBe(2);
  });
});

describe("resolveNotebookStabilityTarget", () => {
  it("resolves the first available run result when no inspector context exists", () => {
    const result = runBaseline(
      {
        equations: [{ name: "y", expression: "0.8 * lag(y) + 10" }],
        externals: {},
        initialValues: { y: 1 }
      },
      {
        periods: 4,
        solverMethod: "GAUSS_SEIDEL",
        tolerance: 1e-9,
        maxIterations: 20
      }
    );

    const document: NotebookDocument = {
      title: "Test",
      cells: [
        {
          id: "run-1",
          type: "run",
          title: "Baseline run",
          periods: 4,
          solverMethod: "GAUSS_SEIDEL",
          toleranceText: "1e-9",
          maxIterations: 20,
          defaultInitialValueText: "0",
          hiddenLeftVariable: "",
          hiddenRightVariable: "",
          hiddenToleranceText: "1e-8",
          hiddenRelative: false
        }
      ]
    };

    const target = resolveNotebookStabilityTarget({
      document,
      getResult: () => result,
      inspectorContext: null
    });

    expect(target?.runCellId).toBe("run-1");
    expect(target?.modelLabel).toBe("Baseline run");
  });
});

describe("formatStabilityClassification", () => {
  it("formats stability classes for display", () => {
    expect(formatStabilityClassification("stable")).toBe("Stable");
    expect(formatStabilityClassification("marginal")).toBe("Marginal");
    expect(formatStabilityClassification("unstable")).toBe("Unstable");
  });
});

describe("formatTransitionLoopGain", () => {
  it("formats loop gain values for display", () => {
    expect(formatTransitionLoopGain(0.8123)).toBe("0.8123");
    expect(formatTransitionLoopGain(-0.25)).toBe("-0.2500");
  });
});
