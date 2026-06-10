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

  it("formats explicit percent display units without changing the value", () => {
    render(<NumericValueText unitMeta={{ displayUnit: "%", stockFlow: "aux", signature: {} }} value={42.5} />);

    expect(screen.getByText("42.5%")).toBeInTheDocument();
  });

  it("decimal-aligns mixed money and item flow values for the current column", () => {
    const { container: moneyCell } = render(
      <NumericValueText
        decimalAligned
        unitMeta={{ stockFlow: "flow", signature: { money: 1, time: -1 } }}
        value={103.42}
        options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
      />
    );
    const { container: itemsCell } = render(
      <NumericValueText
        decimalAligned
        unitMeta={{ stockFlow: "flow", signature: { items: 1, time: -1 } }}
        value={80.67}
        options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
      />
    );

    expect(moneyCell.querySelector(".notebook-current-value-leading")).toHaveTextContent("$");
    expect(moneyCell.querySelector(".notebook-current-value-integer")).toHaveTextContent("103");
    expect(moneyCell.querySelector(".notebook-current-value-fraction")).toHaveTextContent("42");
    expect(moneyCell.querySelector(".notebook-current-value-unit")).toHaveTextContent("/yr");
    expect(itemsCell.querySelector(".notebook-current-value-leading")).toHaveTextContent("");
    expect(itemsCell.querySelector(".notebook-current-value-integer")).toHaveTextContent("80");
    expect(itemsCell.querySelector(".notebook-current-value-fraction")).toHaveTextContent("67");
    expect(itemsCell.querySelector(".notebook-current-value-unit")).toHaveTextContent("items/yr");
  });
});