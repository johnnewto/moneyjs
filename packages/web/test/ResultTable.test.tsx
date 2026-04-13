// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResultTable } from "../src/components/ResultTable";

afterEach(() => {
  cleanup();
});

describe("ResultTable", () => {
  it("adds variable description tooltips to row labels", () => {
    render(
      <ResultTable
        title="Variables"
        rows={[
          {
            description: "Income = GDP",
            name: "Y",
            selected: 120,
            start: 100,
            end: 140
          }
        ]}
        variableDescriptions={new Map([["Y", "Income = GDP"]])}
        variableUnitMetadata={new Map([["Y", { dimensionKind: "flow", baseUnit: "$" }]])}
      />
    );

    fireEvent.mouseEnter(screen.getByText("Y"));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Income = GDP");
    expect(screen.getByRole("tooltip")).toHaveTextContent("flow ($/yr)");
    expect(screen.getByText("$/yr")).toBeInTheDocument();
  });
});
