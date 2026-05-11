// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ModelDefinition, SimulationOptions, SimulationResult } from "@sfcr/core";

import { ChartCellView } from "../src/notebook/components/RunChartViews";
import type { ChartCell, NotebookCell } from "../src/notebook/types";
import type { useNotebookRunner } from "../src/notebook/useNotebookRunner";

afterEach(() => {
  cleanup();
});

const model: ModelDefinition = {
  equations: [{ name: "Y", expression: "G" }],
  externals: { G: { kind: "constant", value: 20 } },
  initialValues: {}
};

const options: SimulationOptions = {
  periods: 3,
  solverMethod: "GAUSS_SEIDEL",
  tolerance: 1e-8,
  maxIterations: 50,
  defaultInitialValue: 1e-15
};

function createResult(values: number[]): SimulationResult {
  return {
    blocks: [],
    model,
    options: { ...options, periods: values.length },
    series: {
      Y: new Float64Array(values)
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
    resultKey: "baseline",
    sourceModelId: "model-1",
    title: "Run",
    type: "run"
  }
];

describe("ChartCellView", () => {
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