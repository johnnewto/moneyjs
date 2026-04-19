// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NumericValueText } from "../src/components/NumericValueText";

afterEach(() => {
  cleanup();
});

describe("NumericValueText", () => {
  it("colors only the numeric portion red for negative values", () => {
    render(
      <NumericValueText
        prefix="Y = "
        unitMeta={{ dimensionKind: "flow", baseUnit: "$" }}
        value={-12.5}
        options={{ maximumFractionDigits: 2 }}
      />
    );

    const value = screen.getByText("-$12.5/yr");
    const prefix = value.previousElementSibling;

    expect(prefix).not.toBeNull();
    expect(prefix).not.toHaveClass("numeric-value-negative");
    expect(value).toHaveClass("numeric-value-negative");
  });
});