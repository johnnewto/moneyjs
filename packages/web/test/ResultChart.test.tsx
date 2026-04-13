// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResultChart } from "../src/components/ResultChart";

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
        sharedRange={{ mode: "auto", includeZero: true }}
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
        sharedRange={{ mode: "manual", min: -10, max: 10 }}
        series={[
          { name: "P", values: [2, 3, 5, 4] },
          { name: "POLR", values: [10, 15, 25, 20] }
        ]}
        seriesRanges={{
          P: { mode: "manual", min: 0, max: 10 },
          POLR: { mode: "auto", includeZero: true }
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
        axisSnap={{ enabled: true, tolerance: 0.2 }}
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
        axisSnap={{ enabled: true, tolerance: 0.5 }}
        series={[
          { name: "A", values: [10, 12, 14, 16] },
          { name: "B", values: [11, 13, 15, 17] }
        ]}
        seriesRanges={{
          A: { mode: "manual", min: 0, max: 20 }
        }}
      />
    );

    expect(screen.getByText(/A: 0\.000 to 20\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/B: 11\.0 to 17\.0/i)).toBeInTheDocument();
  });
});
