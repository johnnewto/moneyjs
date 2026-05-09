// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResultChart } from "../src/components/ResultChart";

afterEach(() => {
  cleanup();
});

function hasTextContent(expected: RegExp) {
  return (_content: string, node: Element | null) => {
    if (!node?.textContent || !expected.test(node.textContent)) {
      return false;
    }

    return Array.from(node.children).every(
      (child) => !child.textContent || !expected.test(child.textContent)
    );
  };
}

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
    expect(screen.getByText(hasTextContent(/Shared axis: .* to /i))).toBeInTheDocument();
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
    expect(screen.getByText(hasTextContent(/P: .* to /i))).toBeInTheDocument();
  });

  it("renders superscripted variable names in chart legends and scales", () => {
    render(
      <ResultChart
        axisMode="separate"
        series={[
          { name: "H^P", values: [2, 3, 5, 4] },
          { name: "B^{CB}", values: [10, 15, 25, 20] }
        ]}
      />
    );

    expect(screen.getByText("P", { selector: ".chart-legend sup" })).toBeInTheDocument();
    expect(screen.getByText("CB", { selector: ".chart-legend sup" })).toBeInTheDocument();
    expect(screen.getByText("CB", { selector: ".chart-scale sup" })).toBeInTheDocument();
  });

  it("keeps separate-axis tick rows aligned by using the same tick count on each axis", () => {
    render(
      <ResultChart
        axisMode="separate"
        yAxisTickCount={6}
        series={[
          { name: "A", values: [0.11, 0.13, 0.17, 0.19] },
          { name: "B", values: [120, 180, 260, 310] }
        ]}
      />
    );

    const axisGroups = Array.from(document.querySelectorAll(".chart-axis"));
    expect(axisGroups).toHaveLength(2);

    const tickLabelCounts = axisGroups.map(
      (axisGroup) => axisGroup.querySelectorAll("text").length - 1
    );

    expect(tickLabelCounts).toEqual([6, 6]);
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

    expect(screen.getByText(hasTextContent(/Shared axis: -1\.00 to 26\.0/i))).toBeInTheDocument();
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

    expect(screen.getByText(hasTextContent(/P: 0\.000 to 10\.0/i))).toBeInTheDocument();
    expect(screen.getByText(hasTextContent(/POLR: -1\.00 to 26\.0/i))).toBeInTheDocument();
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

    expect(screen.getByText(hasTextContent(/A: 9\.76 to 17\.2/i))).toBeInTheDocument();
    expect(screen.getByText(hasTextContent(/B: 9\.76 to 17\.2/i))).toBeInTheDocument();
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

    expect(screen.getByText(hasTextContent(/A: 0\.000 to 20\.0/i))).toBeInTheDocument();
    expect(screen.getByText(hasTextContent(/B: 10\.8 to 17\.2/i))).toBeInTheDocument();
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
    expect(screen.getByText(hasTextContent(/Shared axis: 6\.56 to 18\.4/i))).toBeInTheDocument();
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
    expect(screen.getByText(hasTextContent(/Shared axis: 5\.60 to 16\.4/i))).toBeInTheDocument();
  });

  it("uses nice y-axis tick spacing with 0 or 5 endings", () => {
    render(
      <ResultChart
        series={[
          { name: "A", values: [0.101, 0.214, 0.327, 0.441] },
          { name: "B", values: [0.151, 0.264, 0.377, 0.491] }
        ]}
      />
    );

    expect(screen.getAllByText("0.200").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.300").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.213")).not.toBeInTheDocument();
  });

  it("supports niceScale to expand auto bounds to nicer values", () => {
    render(
      <ResultChart
        niceScale
        series={[
          { name: "A", values: [0.112, 0.176, 0.243, 0.298] },
          { name: "B", values: [0.101, 0.166, 0.231, 0.287] }
        ]}
      />
    );

    expect(screen.getByText(hasTextContent(/Shared axis: 0\.100 to 0\.300/i))).toBeInTheDocument();
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
    expect(screen.getByText(hasTextContent(/Value:\s*12\.0/i))).toBeInTheDocument();
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
    expect(screen.getByText(hasTextContent(/Value:\s*12\.0/i))).toBeInTheDocument();
  });

  it("colors negative hover values red", () => {
    render(
      <ResultChart
        series={[
          { name: "A", values: [-10, -12, -14, -16] },
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

    const negativeValue = screen.getByText("-12.0");
    expect(negativeValue).toHaveAttribute("fill", "#b42318");
  });

  it("colors negative scale bounds red", () => {
    const { container } = render(
      <ResultChart
        series={[
          { name: "A", values: [-10, -12, -14, -16] },
          { name: "B", values: [30, 32, 34, 36] }
        ]}
      />
    );

    const negativeBound = container.querySelector(".chart-scale .numeric-value-negative");
    expect(negativeBound).not.toBeNull();
    expect(negativeBound).toHaveTextContent(/-/);
    expect(negativeBound).toHaveClass("numeric-value-negative");
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
