// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { SimulationResult } from "@sfcr/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicationCellView } from "../src/publication/PublicationCellView";
import type { PublicationSection } from "../src/publication/buildPublicationViewModel";
import type { PublicationVariableInteraction } from "../src/publication/publicationInspect";
import type { ChartCell, ChartGridCell, NotebookCell, RunCell } from "../src/notebook/types";

const runCell: RunCell = {
  id: "run-1",
  mode: "baseline",
  periods: 4,
  resultKey: "baseline",
  sourceModelId: "model",
  title: "Baseline",
  type: "run"
};

const chartCell: ChartCell = {
  id: "chart-1",
  title: "Output",
  type: "chart",
  sourceRunCellId: "run-1",
  variables: ["Y"]
};

const chartGridCell: ChartGridCell = {
  id: "grid-1",
  title: "Grid of charts",
  type: "chart-grid",
  gridColumns: 2,
  charts: [
    {
      id: "chart-a",
      title: "Output",
      type: "chart",
      sourceRunCellId: "run-1",
      variables: ["Y"]
    },
    {
      id: "chart-b",
      title: "Consumption",
      type: "chart",
      sourceRunCellId: "run-1",
      variables: ["C"]
    }
  ]
};

const cells: NotebookCell[] = [runCell, chartGridCell];

const section: PublicationSection = {
  kind: "chart",
  cell: chartGridCell,
  anchorId: chartGridCell.id
};

const interaction: PublicationVariableInteraction = {
  currentValues: {},
  highlightedVariable: null,
  parameterNames: new Set(),
  variableDescriptions: {},
  variableUnitMetadata: { byVariable: {}, defaultUnit: undefined } as never
};

function createResult(series: Record<string, number[]>): SimulationResult {
  return {
    blocks: [],
    model: { equations: [], externals: {}, initialValues: {} },
    options: { periods: 4, solverMethod: "GAUSS_SEIDEL", tolerance: 1e-8, maxIterations: 50 },
    series: Object.fromEntries(
      Object.entries(series).map(([name, values]) => [name, new Float64Array(values)])
    )
  };
}

afterEach(() => {
  cleanup();
});

describe("PublicationCellView", () => {
  it("renders chart-grid cells in publish mode", () => {
    const result = createResult({
      Y: [100, 105, 110, 115],
      C: [80, 82, 84, 86]
    });

    render(
      <PublicationCellView
        cells={cells}
        getResult={() => result}
        interaction={interaction}
        section={section}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Consumption")).toBeInTheDocument();
    expect(document.querySelector(".publication-chart-grid")).not.toBeNull();
    expect(document.querySelectorAll(".publication-chart-grid-item")).toHaveLength(2);
  });

  it("enables chart series add menu when interactiveCharts is set", () => {
    const result = createResult({
      Y: [100, 105, 110, 115],
      C: [80, 82, 84, 86]
    });
    const chartSection: PublicationSection = {
      kind: "chart",
      cell: chartCell,
      anchorId: chartCell.id
    };

    render(
      <PublicationCellView
        cells={[runCell, chartCell]}
        getResult={() => result}
        interaction={interaction}
        interactiveCharts
        section={chartSection}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByLabelText("Add chart variable")).toBeInTheDocument();
  });
});
