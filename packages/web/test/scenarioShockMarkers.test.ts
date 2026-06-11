import type { ModelDefinition, SimulationOptions, SimulationResult } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import {
  buildScenarioShockMarkers,
  formatScenarioShockAriaLabel,
  formatScenarioShockRunCellLabel,
  formatScenarioShockVariableLabel,
  resolveShowScenarioShocks
} from "../src/lib/scenarioShockMarkers";
import type { ChartCell, RunCell } from "../src/notebook/types";

const scenarioRun: RunCell = {
  id: "scenario-run",
  mode: "scenario",
  periods: 20,
  resultKey: "scenario",
  sourceModelId: "model",
  title: "Scenario",
  type: "run",
  baselineRunCellId: "baseline-run",
  scenario: {
    shocks: [
      {
        rangeInclusive: [5, 12],
        variables: {
          Gd: { kind: "constant", value: 30 }
        }
      },
      {
        startPeriodInclusive: 15,
        endPeriodInclusive: 18,
        variables: {
          alpha1: { kind: "constant", value: 0.7 }
        }
      }
    ]
  }
};

const model: ModelDefinition = {
  equations: [{ name: "Y", expression: "Gd" }],
  externals: {
    Gd: { kind: "constant", value: 20 },
    alpha1: { kind: "constant", value: 0.75 }
  },
  initialValues: {}
};

const options: SimulationOptions = {
  periods: 20,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50
};

function createResult(series: Record<string, number[]>): SimulationResult {
  return {
    blocks: [],
    model,
    options,
    series: Object.fromEntries(Object.entries(series).map(([name, values]) => [name, new Float64Array(values)]))
  };
}

describe("scenarioShockMarkers", () => {
  it("enables shock markers by default for scenario charts", () => {
    const chart = { showScenarioShocks: undefined } as ChartCell;
    expect(resolveShowScenarioShocks(chart, scenarioRun)).toBe(true);
  });

  it("respects explicit opt-out", () => {
    const chart = { showScenarioShocks: false } as ChartCell;
    expect(resolveShowScenarioShocks(chart, scenarioRun)).toBe(false);
  });

  it("builds color-coded markers for each shock", () => {
    const markers = buildScenarioShockMarkers(scenarioRun);
    expect(markers).toHaveLength(2);
    expect(markers[0]?.startPeriodInclusive).toBe(5);
    expect(markers[0]?.endPeriodInclusive).toBe(12);
    expect(markers[0]?.color).not.toBe(markers[1]?.color);
    expect(markers[0]?.variables[0]?.name).toBe("Gd");
    expect(markers[0]?.variables[0]?.valueText).toBe("30");
    expect(markers[1]?.variables[0]?.name).toBe("alpha1");
    expect(markers[1]?.variables[0]?.valueText).toBe("0.7");
  });

  it("includes the pre-shock value from the scenario result series", () => {
    const result = createResult({
      Gd: Array.from({ length: 20 }, (_, index) => (index >= 4 ? 30 : 20)),
      alpha1: Array.from({ length: 20 }, (_, index) => (index >= 14 ? 0.7 : 0.75))
    });

    const markers = buildScenarioShockMarkers(scenarioRun, result);
    expect(markers[0]?.variables[0]?.originalValueText).toBe("20");
    expect(markers[1]?.variables[0]?.originalValueText).toBe("0.75");
    expect(formatScenarioShockVariableLabel(markers[1]!.variables[0]!)).toBe("α1: 0.75 → 0.7");
  });

  it("falls back to baseline model externals when the shock starts at period 1", () => {
    const run: RunCell = {
      ...scenarioRun,
      scenario: {
        shocks: [
          {
            rangeInclusive: [1, 10],
            variables: {
              Gd: { kind: "constant", value: 30 }
            }
          }
        ]
      }
    };
    const baseline = createResult({ Gd: Array.from({ length: 20 }, () => 20) });

    const markers = buildScenarioShockMarkers(run, baseline, baseline);
    expect(markers[0]?.variables[0]?.originalValueText).toBe("20");
  });

  it("formats run-cell shock labels with period prefix on one line", () => {
    const result = createResult({
      alpha1: Array.from({ length: 20 }, (_, index) => (index >= 14 ? 0.7 : 0.75))
    });
    const markers = buildScenarioShockMarkers(scenarioRun, result);
    expect(formatScenarioShockRunCellLabel(markers[1]!)).toBe("Period 15 to 18, α1: 0.75 → 0.7");
  });

  it("builds accessible shock labels with plain-text variable names", () => {
    const result = createResult({
      alpha1: Array.from({ length: 20 }, (_, index) => (index >= 14 ? 0.7 : 0.75))
    });
    const markers = buildScenarioShockMarkers(scenarioRun, result);
    expect(formatScenarioShockAriaLabel(markers[1]!, 0)).toContain("α1: 0.75 → 0.7");
  });
});
