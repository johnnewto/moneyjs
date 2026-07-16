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

function createResult(
  values: number[],
  extraSeries: Record<string, number[]> = {},
  blocks: SimulationResult["blocks"] = []
): SimulationResult {
  return {
    blocks,
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

  it("shows solver block counts after a run result is available", () => {
    const run = cells[0]!;
    const result = createResult([20, 22, 24], {}, [
      { id: 0, equationNames: ["Y"], cyclic: false },
      { id: 1, equationNames: ["c", "d"], cyclic: true }
    ]);
    const runner = createRunner({ current: result });

    render(
      <RunCellView
        cell={run}
        cells={cells}
        currentValues={{}}
        editor={null}
        onVariableInspectRequest={vi.fn()}
        runner={runner}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(screen.getByLabelText(/solver block structure: 2 blocks, 1 cyclic/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Block 1: c, d \(cyclic\)/i)).toBeInTheDocument();
  });

  it("opens the solver block DAG when the blocks badge is clicked", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const run = cells[0]!;
    const onShowSolverBlockDag = vi.fn();
    const result = createResult([20, 22, 24], {}, [
      { id: 0, equationNames: ["Y"], cyclic: false },
      { id: 1, equationNames: ["c", "d"], cyclic: true }
    ]);
    const runner = createRunner({ current: result });

    render(
      <RunCellView
        cell={run}
        cells={cells}
        currentValues={{}}
        editor={null}
        onVariableInspectRequest={vi.fn()}
        onShowSolverBlockDag={onShowSolverBlockDag}
        runner={runner}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    await user.click(screen.getByRole("button", { name: /open block dependency graph/i }));
    expect(onShowSolverBlockDag).toHaveBeenCalledTimes(1);
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

  it("overlays observed data as a dashed reference trace when requested", () => {
    const chart: ChartCell = {
      id: "chart-1",
      referenceTrace: "observed",
      sourceRunCellId: "run-1",
      title: "Chart",
      type: "chart",
      variables: ["Y"]
    };
    const result: SimulationResult = {
      ...createResult([20, 22, 24]),
      observed: { Y: new Float64Array([18, 19, 30]) }
    };
    const runner = createRunner({ current: result });

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
    expect(screen.getByText("• Observed").closest(".chart-legend")).not.toBeNull();

    const observedPoints = document.querySelectorAll("circle.chart-observed-point");
    expect(observedPoints.length).toBe(3);
    expect(observedPoints[0]?.getAttribute("fill")).toBe("#dc2626");
  });

  it("finishes the observed trace early when observed data is shorter than the run", () => {
    const chart: ChartCell = {
      id: "chart-1",
      referenceTrace: "observed",
      sourceRunCellId: "run-1",
      title: "Chart",
      type: "chart",
      variables: ["Y"]
    };
    const result: SimulationResult = {
      ...createResult([20, 22, 24, 26, 28, 30]),
      observed: { Y: new Float64Array([18, 19, 30]) }
    };
    const runner = createRunner({ current: result });

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

    // Observed covers only 3 of the 6 simulated periods, so only 3 observed
    // dots should be drawn rather than spanning the full width.
    const observedPoints = document.querySelectorAll("circle.chart-observed-point");
    expect(observedPoints.length).toBe(3);
  });

  it("auto-selects the observed reference trace for STATIC runs without an explicit setting", () => {
    const staticCells: NotebookCell[] = [
      {
        id: "run-1",
        mode: "baseline",
        periods: 3,
        resultKey: "baseline",
        simType: "STATIC",
        sourceModelId: "model-1",
        title: "Run",
        type: "run"
      }
    ];
    const chart: ChartCell = {
      id: "chart-1",
      sourceRunCellId: "run-1",
      title: "Chart",
      type: "chart",
      variables: ["Y"]
    };
    const result: SimulationResult = {
      ...createResult([20, 22, 24]),
      observed: { Y: new Float64Array([18, 19, 30]) }
    };
    const runner = createRunner({ current: result });

    render(
      <ChartCellView
        cell={chart}
        cells={staticCells}
        runner={runner}
        selectedPeriodIndex={0}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(document.querySelectorAll("circle.chart-observed-point").length).toBe(3);
  });

  it("renders baseline and observed reference traces together for scenario charts", () => {
    const multiReferenceCells: NotebookCell[] = [
      {
        id: "baseline-run",
        mode: "baseline",
        periods: 6,
        resultKey: "baseline",
        sourceModelId: "model-1",
        title: "Baseline",
        type: "run"
      },
      {
        id: "scenario-run",
        baselineRunCellId: "baseline-run",
        baselineStartPeriod: 3,
        mode: "scenario",
        periods: 3,
        resultKey: "scenario",
        scenario: { shocks: [] },
        sourceModelId: "model-1",
        title: "Scenario",
        type: "run"
      }
    ];
    const chart: ChartCell = {
      id: "chart-1",
      referenceTraces: ["baseline", "observed"],
      sourceRunCellId: "scenario-run",
      title: "Chart",
      type: "chart",
      variables: ["Y"]
    };
    const scenarioResult = createResult([30, 32, 34]);
    const baselineResult: SimulationResult = {
      ...createResult([20, 22, 24, 26, 28, 30]),
      observed: { Y: new Float64Array([18, 19, 30, 31, 32, 33]) }
    };
    const runner = {
      ...createRunner({ current: scenarioResult }),
      getResult: vi.fn((cellId: string) => {
        if (cellId === "scenario-run") {
          return scenarioResult;
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
        cells={multiReferenceCells}
        runner={runner}
        selectedPeriodIndex={2}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(screen.getByText("----: baseline").closest(".chart-legend")).not.toBeNull();
    expect(screen.getByText("• Observed").closest(".chart-legend")).not.toBeNull();
    expect(document.querySelector('polyline[stroke-dasharray="5 5"]')).not.toBeNull();
    expect(document.querySelectorAll("circle.chart-observed-point").length).toBe(3);
  });

  it("omits baseline overlay when compareMode is relative", () => {
    const multiReferenceCells: NotebookCell[] = [
      {
        id: "baseline-run",
        mode: "baseline",
        periods: 6,
        resultKey: "baseline",
        sourceModelId: "model-1",
        title: "Baseline",
        type: "run"
      },
      {
        id: "scenario-run",
        baselineRunCellId: "baseline-run",
        baselineStartPeriod: 3,
        mode: "scenario",
        periods: 3,
        resultKey: "scenario",
        scenario: { shocks: [] },
        sourceModelId: "model-1",
        title: "Scenario",
        type: "run"
      }
    ];
    const chart: ChartCell = {
      id: "chart-1",
      compareMode: "relative",
      referenceTraces: ["baseline", "observed"],
      sourceRunCellId: "scenario-run",
      title: "Chart",
      type: "chart",
      variables: ["Y"]
    };
    const scenarioResult = createResult([30, 32, 34]);
    const baselineResult: SimulationResult = {
      ...createResult([20, 22, 24, 26, 28, 30]),
      observed: { Y: new Float64Array([18, 19, 30, 31, 32, 33]) }
    };
    const runner = {
      ...createRunner({ current: scenarioResult }),
      getResult: vi.fn((cellId: string) => {
        if (cellId === "scenario-run") {
          return scenarioResult;
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
        cells={multiReferenceCells}
        runner={runner}
        selectedPeriodIndex={2}
        variableDescriptions={new Map()}
        variableUnitMetadata={new Map()}
      />
    );

    expect(screen.queryByText("----: baseline")).toBeNull();
    expect(screen.getByText("• Observed").closest(".chart-legend")).not.toBeNull();
    expect(
      screen.getByRole("img", {
        name: /simulation result chart/i
      })
    ).toBeInTheDocument();
  });

  it("renders expression series from run results", () => {
    const chart: ChartCell = {
      id: "chart-1",
      sourceRunCellId: "run-1",
      title: "Portfolio shares",
      type: "chart",
      series: [
        { expression: "100 * h_h / v", label: "Money share" },
        { expression: "100 * b_h / v", label: "Bill share" }
      ]
    };
    const result = createResult([20, 22, 24], {
      h_h: [10, 20, 30],
      b_h: [30, 60, 90],
      v: [40, 80, 120]
    });
    const runner = createRunner({ current: result });

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

    expect(screen.getByText("Money share")).toBeInTheDocument();
    expect(screen.getByText("Bill share")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /simulation result chart with shared left axis/i })).toBeInTheDocument();
  });
});
