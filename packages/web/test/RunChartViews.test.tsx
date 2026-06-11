// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelDefinition, SimulationOptions, SimulationResult } from "@sfcr/core";

import { ChartCellView, RunCellView } from "../src/notebook/components/RunChartViews";
import type { ChartCell, NotebookCell, RunCell } from "../src/notebook/types";
import type { useNotebookRunner } from "../src/notebook/useNotebookRunner";

afterEach(() => {
  cleanup();
});

const model: ModelDefinition = {
  equations: [{ name: "Y", expression: "G" }],
  externals: {
    G: { kind: "constant", value: 20 },
    Gd: { kind: "constant", value: 20 }
  },
  initialValues: {}
};

const options: SimulationOptions = {
  periods: 3,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50,
  defaultInitialValue: 1e-15
};

function createResult(values: number[], extraSeries: Record<string, number[]> = {}): SimulationResult {
  return {
    blocks: [],
    model,
    options: { ...options, periods: values.length },
    series: {
      Y: new Float64Array(values),
      ...Object.fromEntries(
        Object.entries(extraSeries).map(([name, seriesValues]) => [name, new Float64Array(seriesValues)])
      )
    }
  };
}

function createRunner(args: {
  current: SimulationResult;
  previous?: SimulationResult | null;
}): ReturnType<typeof useNotebookRunner> {
  return {
    errors: {},
    getPreviousResult: vi.fn(() => args.previous ?? null),
    getResult: vi.fn((cellId: string) => (cellId === "run-1" ? args.current : null)),
    outputs: {},
    runAll: vi.fn(async () => undefined),
    runCell: vi.fn(async () => undefined),
    status: {}
  } as unknown as ReturnType<typeof useNotebookRunner>;
}

const cells: NotebookCell[] = [
  {
    id: "run-1",
    mode: "baseline",
    periods: 3,
    resultKey: "baseline",
    sourceModelId: "model-1",
    title: "Run",
    type: "run"
  }
];

const scenarioCells: NotebookCell[] = [
  {
    id: "baseline-run",
    mode: "baseline",
    periods: 20,
    resultKey: "baseline",
    sourceModelId: "model-1",
    title: "Baseline",
    type: "run"
  },
  {
    id: "scenario-run",
    baselineRunCellId: "baseline-run",
    mode: "scenario",
    periods: 20,
    resultKey: "scenario",
    scenario: {
      shocks: [
        {
          rangeInclusive: [5, 12],
          variables: {
            Gd: { kind: "constant", value: 30 }
          }
        }
      ]
    },
    sourceModelId: "model-1",
    title: "Scenario",
    type: "run"
  }
];

describe("RunCellView", () => {
  it("shows pre-shock values in the scenario shock summary", () => {
    const run: RunCell = scenarioCells[1]!;
    const gdSeries = Array.from({ length: 20 }, (_, index) => (index >= 4 ? 30 : 20));
    const result = createResult(Array.from({ length: 20 }, (_, index) => 20 + index * 2), { Gd: gdSeries });
    const baselineResult = createResult(Array.from({ length: 20 }, () => 20), {
      Gd: Array.from({ length: 20 }, () => 20)
    });
    const runner = {
      ...createRunner({ current: result }),
      getResult: vi.fn((cellId: string) => {
        if (cellId === "scenario-run") {
          return result;
        }
        if (cellId === "baseline-run") {
          return baselineResult;
        }
        return null;
      })
    } as unknown as ReturnType<typeof useNotebookRunner>;

    render(
      <RunCellView
        cell={run}
        cells={scenarioCells}
        currentValues={{}}
        editor={null}
        onVariableInspectRequest={vi.fn()}
        runner={runner}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(screen.getByText("Period 5 to 12")).toBeInTheDocument();
    expect(screen.getByText("20", { selector: ".scenario-shock-original" })).toBeInTheDocument();
    expect(screen.getByText("30", { selector: ".scenario-shock-value" })).toBeInTheDocument();
  });
});

describe("ChartCellView", () => {
  it("renders scenario shock markers for scenario source runs by default", () => {
    const chart: ChartCell = {
      id: "chart-1",
      sourceRunCellId: "scenario-run",
      title: "Scenario chart",
      type: "chart",
      variables: ["Y"]
    };
    const gdSeries = Array.from({ length: 20 }, (_, index) => (index >= 4 ? 30 : 20));
    const result = createResult([20, 22, 24, 26, 28, 30, 32, 34, 36, 38], { Gd: gdSeries });
    const baselineResult = createResult(Array.from({ length: 20 }, () => 20), {
      Gd: Array.from({ length: 20 }, () => 20)
    });
    const runner = {
      ...createRunner({ current: result }),
      getResult: vi.fn((cellId: string) => {
        if (cellId === "scenario-run") {
          return result;
        }
        if (cellId === "baseline-run") {
          return baselineResult;
        }
        return null;
      })
    } as unknown as ReturnType<typeof useNotebookRunner>;

    render(
      <ChartCellView
        cell={chart}
        cells={scenarioCells}
        runner={runner}
        selectedPeriodIndex={0}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(
      screen.getByRole("img", {
        name: /simulation result chart with shared left axis.*scenario shock markers/i
      })
    ).toBeInTheDocument();
    expect(document.querySelector(".chart-scenario-shock")).not.toBeNull();
    expect(document.querySelector(".chart-scenario-shock-band-label")).not.toBeNull();
    expect(screen.getByText("20", { selector: ".scenario-shock-original" })).toBeInTheDocument();
  });

  it("uses the previous run result as a dotted reference trace when requested", () => {
    const chart: ChartCell = {
      id: "chart-1",
      referenceTrace: "previous-run",
      sourceRunCellId: "run-1",
      title: "Chart",
      type: "chart",
      variables: ["Y"]
    };
    const runner = createRunner({ current: createResult([20, 22, 24]), previous: createResult([10, 12, 14]) });

    render(
      <ChartCellView
        cell={chart}
        cells={cells}
        runner={runner}
        selectedPeriodIndex={0}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(screen.getByRole("img", { name: /simulation result chart with shared left axis/i })).toBeInTheDocument();
    expect(document.querySelector('polyline[stroke-dasharray="5 5"]')).not.toBeNull();
    expect(runner.getPreviousResult).toHaveBeenCalledWith("run-1");
  });
});