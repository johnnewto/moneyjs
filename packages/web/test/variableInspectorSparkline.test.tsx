// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VariableInspectorSparkline } from "../src/components/VariableInspectorSparkline";

describe("VariableInspectorSparkline", () => {
  it("renders a sparkline when the series has multiple finite values", () => {
    render(
      <VariableInspectorSparkline selectedPeriodIndex={2} seriesValues={[10, 20, 30, 40]} />
    );

    expect(screen.getByRole("img")).toBeTruthy();
    expect(screen.getByText(/^min = .+, max = .+$/)).toBeTruthy();
    expect(document.querySelector(".variable-inspector-sparkline-line")).toBeTruthy();
  });

  it("returns null for a single-point series", () => {
    const { container } = render(
      <VariableInspectorSparkline seriesValues={[5]} />
    );

    expect(container.firstChild).toBeNull();
  });

  it("returns null when every value is non-finite", () => {
    const { container } = render(
      <VariableInspectorSparkline seriesValues={[Number.NaN, Number.NaN]} />
    );

    expect(container.firstChild).toBeNull();
  });
});
