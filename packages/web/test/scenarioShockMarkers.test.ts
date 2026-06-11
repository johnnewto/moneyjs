import { describe, expect, it } from "vitest";

import {
  buildScenarioShockMarkers,
  formatScenarioShockAriaLabel,
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

  it("builds accessible shock labels with plain-text variable names", () => {
    const markers = buildScenarioShockMarkers(scenarioRun);
    expect(formatScenarioShockAriaLabel(markers[1]!, 0)).toContain("α1");
    expect(formatScenarioShockAriaLabel(markers[1]!, 0)).toContain("0.7");
  });
});
