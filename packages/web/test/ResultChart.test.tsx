// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResultChart } from "../src/components/ResultChart";

afterEach(() => {
  cleanup();
});

describe("ResultChart", () => {
  it("renders a shared left axis by default", () => {
    render(
      <ResultChart
        series={[
          { name: "P", values: [2, 3, 5, 4] },
          { name: "POLR", values: [10, 15, 25, 20] },
          { name: "NR", values: [900, 850, 700, 600] }
        ]}
      />
    );

    expect(
      screen.getByRole("img", { name: /simulation result chart with shared left axis/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText(/Shared axis: .* to /i)).toBeInTheDocument();
  });

  it("renders multiple left-axis labels in separate mode", () => {
    render(
      <ResultChart
        axisMode="separate"
        series={[
          { name: "P", values: [2, 3, 5, 4] },
          { name: "POLR", values: [10, 15, 25, 20] },
          { name: "NR", values: [900, 850, 700, 600] }
        ]}
      />
    );

    expect(
      screen.getByRole("img", { name: /simulation result chart with multiple left axes/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText("P").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POLR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NR").length).toBeGreaterThan(0);
    expect(screen.getByText(/P: .* to /i)).toBeInTheDocument();
  });

  it("supports includeZero on a shared auto range", () => {
    render(
      <ResultChart
        sharedRange={{ includeZero: true }}
        series={[
          { name: "P", values: [2, 3, 5, 4] },
          { name: "POLR", values: [10, 15, 25, 20] }
        ]}
      />
    );

    expect(screen.getByText(/Shared axis: 0\.000 to 25\.0/i)).toBeInTheDocument();
  });

  it("supports manual shared and per-series ranges", () => {
    render(
      <ResultChart
        axisMode="separate"
        sharedRange={{ min: -10, max: 10 }}
        series={[
          { name: "P", values: [2, 3, 5, 4] },
          { name: "POLR", values: [10, 15, 25, 20] }
        ]}
        seriesRanges={{
          P: { min: 0, max: 10 },
          POLR: { includeZero: true }
        }}
      />
    );

    expect(screen.getByText(/P: 0\.000 to 10\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/POLR: 0\.000 to 25\.0/i)).toBeInTheDocument();
  });

  it("snaps similar separate auto axes when enabled", () => {
    render(
      <ResultChart
        axisMode="separate"
        axisSnapTolarance={0.2}
        series={[
          { name: "A", values: [10, 12, 14, 16] },
          { name: "B", values: [11, 13, 15, 17] }
        ]}
      />
    );

    expect(screen.getByText(/A: 10\.0 to 17\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/B: 10\.0 to 17\.0/i)).toBeInTheDocument();
  });

  it("does not snap manual per-series ranges", () => {
    render(
      <ResultChart
        axisMode="separate"
        axisSnapTolarance={0.5}
        series={[
          { name: "A", values: [10, 12, 14, 16] },
          { name: "B", values: [11, 13, 15, 17] }
        ]}
        seriesRanges={{
          A: { min: 0, max: 20 }
        }}
      />
    );

    expect(screen.getByText(/A: 0\.000 to 20\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/B: 11\.0 to 17\.0/i)).toBeInTheDocument();
  });

  it("uses the supplied auto time-range defaults", () => {
    render(
      <ResultChart
        series={[
          { name: "A", values: [10, 12, 14, 16, 18, 20] },
          { name: "B", values: [5, 6, 7, 8, 9, 10] }
        ]}
        timeRangeDefaults={{ startPeriodInclusive: 3, endPeriodInclusive: 5 }}
      />
    );

    expect(screen.getByText(/Time axis: 3 to 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared axis: 7\.00 to 18\.0/i)).toBeInTheDocument();
  });

  it("supports manual time ranges", () => {
    render(
      <ResultChart
        series={[
          { name: "A", values: [10, 12, 14, 16, 18, 20] },
          { name: "B", values: [5, 6, 7, 8, 9, 10] }
        ]}
        timeRangeInclusive={[2, 4]}
      />
    );

    expect(screen.getByText(/Time axis: 2 to 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared axis: 6\.00 to 16\.0/i)).toBeInTheDocument();
  });

  it("highlights the nearest trace and shows a hover tooltip", () => {
    render(
      <ResultChart
        series={[
          { name: "A", values: [10, 12, 14, 16] },
          { name: "B", values: [30, 32, 34, 36] }
        ]}
      />
    );

    const chart = screen.getByRole("img", { name: /simulation result chart with shared left axis/i });
    chart.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 900,
        height: 360
      }) as DOMRect;

    fireEvent.mouseMove(chart, { clientX: 330, clientY: 250 });

    expect(screen.getByText(/A • Period 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Value: 12\.0/i)).toBeInTheDocument();
    expect(screen.getByText("A").closest(".legend-item")).toHaveClass("is-active");
    expect(screen.getByText("B").closest(".legend-item")).toHaveClass("is-dimmed");
  });

  it("shows the variable description in the hover tooltip when available", () => {
    render(
      <ResultChart
        series={[
          { name: "Y", values: [10, 12, 14, 16] },
          { name: "C", values: [30, 32, 34, 36] }
        ]}
        variableDescriptions={new Map([["Y", "Description"]])}
      />
    );

    const chart = screen.getByRole("img", { name: /simulation result chart with shared left axis/i });
    chart.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 900,
        height: 360
      }) as DOMRect;

    fireEvent.mouseMove(chart, { clientX: 330, clientY: 250 });

    expect(screen.getByText(/Y • Description/i)).toBeInTheDocument();
    expect(screen.getByText(/Value: 12\.0/i)).toBeInTheDocument();
  });

  it("highlights the matching legend and axis in multi-axis mode on hover", () => {
    render(
      <ResultChart
        axisMode="separate"
        series={[
          { name: "A", values: [10, 10, 10, 10] },
          { name: "B", values: [30, 35, 30, 30] }
        ]}
      />
    );

    const chart = screen.getByRole("img", { name: /simulation result chart with multiple left axes/i });
    chart.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 900,
        height: 360
      }) as DOMRect;

    fireEvent.mouseMove(chart, { clientX: 330, clientY: 60 });

    const legend = chart.parentElement?.querySelector(".chart-legend");
    if (!legend) {
      throw new Error("Expected chart legend.");
    }

    const legendA = within(legend).getByText("A").closest(".legend-item");
    const legendB = within(legend).getByText("B").closest(".legend-item");

    expect(legendA).toHaveClass("is-dimmed");
    expect(legendB).toHaveClass("is-active");
    expect(screen.getByText(/B • Period 2/i)).toBeInTheDocument();
  });

  it("applies hover highlighting when hovering the legend and left-hand axis", () => {
    render(
      <ResultChart
        axisMode="separate"
        selectedIndex={1}
        series={[
          { name: "A", values: [10, 12, 14, 16] },
          { name: "B", values: [30, 32, 34, 36] }
        ]}
      />
    );

    const legendItems = screen.getAllByText("B");
    const legendItem = legendItems[0]?.closest(".legend-item");
    if (!legendItem) {
      throw new Error("Expected legend item.");
    }

    fireEvent.mouseEnter(legendItem);

    expect(legendItem).toHaveClass("is-active");
    expect(screen.getByText(/B • Period 2/i)).toBeInTheDocument();

    fireEvent.mouseLeave(legendItem);

    const axisLabel = screen.getAllByText("A").find((node) => node.closest(".chart-axis"));
    const axisGroup = axisLabel?.closest(".chart-axis");
    if (!axisGroup) {
      throw new Error("Expected chart axis.");
    }

    fireEvent.mouseEnter(axisGroup);

    expect(axisGroup).toHaveClass("is-active");
    expect(screen.getByText(/A • Period 2/i)).toBeInTheDocument();
  });

  it("adds variable description tooltips to legend and scale labels", () => {
    render(
      <ResultChart
        axisMode="separate"
        series={[
          { name: "Y", values: [10, 12, 14, 16] },
          { name: "C", values: [8, 9, 10, 11] }
        ]}
        variableDescriptions={
          new Map([
            ["Y", "Income = GDP"],
            ["C", "Consumption"]
          ])
        }
      />
    );

    fireEvent.mouseEnter(screen.getAllByText("Y")[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Income = GDP");

    fireEvent.mouseLeave(screen.getAllByText("Y")[0]!);
    fireEvent.mouseEnter(screen.getAllByText("C")[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Consumption");
  });
});
