// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SimulationResult } from "@sfcr/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  it("omits interactive affordances by default", () => {
    const result = createResult({
      Y: [100, 105, 110, 115, 120, 125, 130, 135],
      C: [80, 84, 88, 92, 96, 100, 104, 108]
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

    expect(screen.queryByLabelText("Time range slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /store time range/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add chart variable")).not.toBeInTheDocument();
  });

  it("renders interactive affordances and computes add-variable options", () => {
    const result = createResult({
      Y: [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155],
      C: [80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124],
      constantVar: [5],
      nonFinite: [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN]
    });

    render(
      <PublicationChart
        cell={chartCell}
        cells={cells}
        getResult={() => result}
        interaction={interaction}
        interactive
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByLabelText("Time range slider")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /store time range/i })).toBeDisabled();

    const addButton = screen.getByLabelText("Add chart variable");
    fireEvent.click(addButton);

    const menu = screen.getByRole("listbox", { name: "Available chart variables" });
    const optionNames = within(menu)
      .getAllByRole("option")
      .map((option) => option.textContent?.trim());

    // "Y" is already displayed; "constantVar" (single period) and "nonFinite"
    // (no finite values) are not graphable, so only "C" is offered.
    expect(optionNames).toEqual(["C"]);
  });

  it("shows a variable picker when interactive and the chart has no series", () => {
    const result = createResult({
      Y: [100, 105, 110, 115],
      C: [80, 84, 88, 92]
    });
    const emptyCell: ChartCell = {
      ...chartCell,
      variables: []
    };

    render(
      <PublicationChart
        cell={emptyCell}
        cells={cells}
        getResult={() => result}
        interaction={interaction}
        interactive
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByText("Add a variable to graph")).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Available chart variables" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Y$/i })).toBeInTheDocument();
  });

  it("updates rendered traces without mutating the precomputed result", () => {
    const result = createResult({
      Y: [100, 105, 110, 115, 120, 125, 130, 135],
      C: [80, 84, 88, 92, 96, 100, 104, 108]
    });
    const originalY = result.series.Y;
    const originalSeriesKeys = Object.keys(result.series);

    render(
      <PublicationChart
        cell={chartCell}
        cells={cells}
        getResult={() => result}
        interaction={interaction}
        interactive
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.queryByText("C")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Add chart variable"));
    const menu = screen.getByRole("listbox", { name: "Available chart variables" });
    fireEvent.click(within(menu).getByRole("option", { name: "C" }));

    expect(screen.getAllByText("C").length).toBeGreaterThan(0);
    expect(result.series.Y).toBe(originalY);
    expect(Object.keys(result.series)).toEqual(originalSeriesKeys);
  });

  it("overlays observed data as a dashed reference trace when requested", () => {
    const baselineRun: RunCell = {
      id: "baseline-run",
      mode: "baseline",
      periods: 3,
      resultKey: "baseline",
      simType: "STATIC",
      sourceModelId: "model",
      title: "Baseline",
      type: "run"
    };
    const observedChart: ChartCell = {
      id: "chart",
      referenceTrace: "observed",
      sourceRunCellId: "baseline-run",
      title: "Consumption",
      type: "chart",
      variables: ["cons"]
    };
    const result: SimulationResult = {
      ...createResult({ cons: [20, 22, 24] }),
      observed: { cons: new Float64Array([18, 19, 30]) }
    };

    render(
      <PublicationChart
        cell={observedChart}
        cells={[baselineRun, observedChart]}
        getResult={() => result}
        interaction={interaction}
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByRole("img", { name: /simulation result chart with shared left axis/i })).toBeInTheDocument();
    expect(screen.getByText("• Observed").closest(".chart-legend")).not.toBeNull();
    expect(document.querySelectorAll("circle.chart-observed-point").length).toBe(3);
  });

  it("auto-selects the observed reference trace for STATIC runs without an explicit setting", () => {
    const baselineRun: RunCell = {
      id: "baseline-run",
      mode: "baseline",
      periods: 3,
      resultKey: "baseline",
      simType: "STATIC",
      sourceModelId: "model",
      title: "Baseline",
      type: "run"
    };
    const observedChart: ChartCell = {
      id: "chart",
      sourceRunCellId: "baseline-run",
      title: "Consumption",
      type: "chart",
      variables: ["cons"]
    };
    const result: SimulationResult = {
      ...createResult({ cons: [20, 22, 24] }),
      observed: { cons: new Float64Array([18, 19, 30]) }
    };

    render(
      <PublicationChart
        cell={observedChart}
        cells={[baselineRun, observedChart]}
        getResult={() => result}
        interaction={interaction}
        result={result}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByText("• Observed").closest(".chart-legend")).not.toBeNull();
    expect(document.querySelectorAll("circle.chart-observed-point").length).toBe(3);
  });

  it("forwards axisGroups in both modes", () => {
    const result = createResult({
      Y: [100, 105, 110, 115, 120, 125, 130, 135],
      C: [80, 84, 88, 92, 96, 100, 104, 108]
    });
    const groupedCell: ChartCell = {
      ...chartCell,
      variables: ["Y", "C"],
      axisGroups: [["Y"], ["C"]]
    };

    const { container: staticContainer } = render(
      <PublicationChart
        cell={groupedCell}
        cells={[scenarioRun, groupedCell]}
        getResult={() => result}
        interaction={interaction}
        result={result}
        selectedPeriodIndex={0}
      />
    );
    const staticAxisCount = staticContainer.querySelectorAll(".chart-axis").length;

    cleanup();

    const { container: interactiveContainer } = render(
      <PublicationChart
        cell={groupedCell}
        cells={[scenarioRun, groupedCell]}
        getResult={() => result}
        interaction={interaction}
        interactive
        result={result}
        selectedPeriodIndex={0}
      />
    );
    const interactiveAxisCount = interactiveContainer.querySelectorAll(".chart-axis").length;

    expect(staticAxisCount).toBeGreaterThan(1);
    expect(interactiveAxisCount).toBe(staticAxisCount);
  });
});
