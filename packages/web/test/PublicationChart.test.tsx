// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SimulationResult } from "@sfcr/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicationChart } from "../src/publication/components/PublicationChart";
import type { PublicationVariableInteraction } from "../src/publication/publicationInspect";
import type { ChartCell, NotebookCell, RunCell } from "../src/notebook/types";

const scenarioRun: RunCell = {
  id: "scenario-run",
  mode: "scenario",
  periods: 8,
  resultKey: "scenario",
  sourceModelId: "model",
  title: "Scenario 1 consumption and income",
  type: "run",
  scenario: {
    shocks: [
      {
        rangeInclusive: [3, 6],
        variables: {
          alpha0: { kind: "constant", value: 30 }
        }
      }
    ]
  }
};

const chartCell: ChartCell = {
  id: "chart",
  title: "Income",
  type: "chart",
  sourceRunCellId: "scenario-run",
  variables: ["Y"]
};

const cells: NotebookCell[] = [scenarioRun, chartCell];

function createResult(series: Record<string, number[]>): SimulationResult {
  return {
    blocks: [],
    model: { equations: [], externals: {}, initialValues: {} },
    options: { periods: 8, solverMethod: "GAUSS_SEIDEL", tolerance: 1e-8, maxIterations: 50 },
    series: Object.fromEntries(
      Object.entries(series).map(([name, values]) => [name, new Float64Array(values)])
    )
  };
}

const interaction: PublicationVariableInteraction = {
  currentValues: {},
  highlightedVariable: null,
  parameterNames: new Set(),
  variableDescriptions: {},
  variableUnitMetadata: { byVariable: {}, defaultUnit: undefined } as never
};

afterEach(() => {
  cleanup();
});

describe("PublicationChart", () => {
  it("renders the scenario shock band and parameter-change label", () => {
    const result = createResult({
      Y: [100, 100, 130, 130, 130, 130, 100, 100],
      alpha0: [20, 20, 30, 30, 30, 30, 20, 20]
    });

    render(
      <PublicationChart
        cell={chartCell}
        cells={cells}
        getResult={() => result}
        interaction={interaction}
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByLabelText(/α0: 20 → 30/)).toBeInTheDocument();
  });

  it("omits the band for non-scenario charts", () => {
    const baselineRun: RunCell = {
      id: "baseline-run",
      mode: "baseline",
      periods: 8,
      resultKey: "baseline",
      sourceModelId: "model",
      title: "Baseline",
      type: "run"
    };
    const baselineChart: ChartCell = {
      ...chartCell,
      sourceRunCellId: "baseline-run"
    };
    const result = createResult({ Y: [100, 100, 100, 100, 100, 100, 100, 100] });

    render(
      <PublicationChart
        cell={baselineChart}
        cells={[baselineRun, baselineChart]}
        getResult={() => result}
        interaction={interaction}
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.queryByLabelText(/→/)).not.toBeInTheDocument();
  });
});
