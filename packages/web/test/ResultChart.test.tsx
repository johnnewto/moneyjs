// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResultChart } from "../src/components/ResultChart";

describe("ResultChart", () => {
  it("renders multiple left-axis labels for multiple series", () => {
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
      screen.getByRole("img", { name: /simulation result chart with multiple left axes/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText("P").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POLR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NR").length).toBeGreaterThan(0);
    expect(screen.getByText(/P: .* to /i)).toBeInTheDocument();
  });
});
