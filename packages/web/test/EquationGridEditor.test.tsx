// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EquationGridEditor } from "../src/components/EquationGridEditor";

afterEach(() => {
  cleanup();
});

describe("EquationGridEditor", () => {
  it("highlights dependent rows on hover and pins output traces on shift-click", () => {
    render(
      <EquationGridEditor
        equations={[
          { id: "eq-y", name: "Y", expression: "C + I" },
          { id: "eq-c", name: "C", expression: "alpha1 * YD" },
          { id: "eq-tax", name: "Tax", expression: "tau * Y" }
        ]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={["tau"]}
      />
    );

    const rows = screen.getAllByRole("row");
    const yRow = rows[1];
    const cRow = rows[2];
    const taxRow = rows[3];

    fireEvent.mouseEnter(yRow);
    expect(yRow).toHaveClass("trace-root");
    expect(cRow).toHaveClass("trace-input");

    fireEvent.click(yRow, { shiftKey: true });
    expect(yRow).toHaveClass("trace-root");
    expect(taxRow).toHaveClass("trace-output");
  });

  it("does not color functions or gnd as variables", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-1", name: "Y", expression: "sin(x) + gnd + lag(K)" }]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={[]}
      />
    );

    expect(screen.getByText("sin")).toHaveClass("formula-function");
    expect(screen.getByText("lag")).toHaveClass("formula-function");
    expect(screen.getByText("gnd")).toHaveClass("formula-default");
  });

  it("clears a pinned trace when the same row and mode are clicked again", () => {
    render(
      <EquationGridEditor
        equations={[
          { id: "eq-y", name: "Y", expression: "C + I" },
          { id: "eq-c", name: "C", expression: "alpha1 * YD" }
        ]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={[]}
      />
    );

    const rows = screen.getAllByRole("row");
    const yRow = rows[1];
    const cRow = rows[2];

    fireEvent.click(yRow);
    expect(yRow).toHaveClass("trace-root");
    expect(cRow).toHaveClass("trace-input");

    fireEvent.click(yRow);
    fireEvent.mouseLeave(yRow);

    expect(yRow).not.toHaveClass("trace-root");
    expect(cRow).not.toHaveClass("trace-input");
  });

  it("shows both input and output traces on ctrl-click", () => {
    render(
      <EquationGridEditor
        equations={[
          { id: "eq-y", name: "Y", expression: "C + I" },
          { id: "eq-c", name: "C", expression: "alpha1 * YD" },
          { id: "eq-tax", name: "Tax", expression: "tau * Y" }
        ]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={["tau"]}
      />
    );

    const rows = screen.getAllByRole("row");
    const yRow = rows[1];
    const cRow = rows[2];
    const taxRow = rows[3];

    fireEvent.click(yRow, { ctrlKey: true });

    expect(yRow).toHaveClass("trace-root");
    expect(cRow).toHaveClass("trace-input");
    expect(taxRow).toHaveClass("trace-output");
  });

  it("keeps a pinned trace active even while hovering another row", () => {
    render(
      <EquationGridEditor
        equations={[
          { id: "eq-y", name: "Y", expression: "C + I" },
          { id: "eq-c", name: "C", expression: "alpha1 * YD" },
          { id: "eq-tax", name: "Tax", expression: "tau * Y" }
        ]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={["tau"]}
      />
    );

    const rows = screen.getAllByRole("row");
    const yRow = rows[1];
    const cRow = rows[2];
    const taxRow = rows[3];

    fireEvent.click(yRow, { shiftKey: true });
    fireEvent.mouseEnter(cRow);

    expect(yRow).toHaveClass("trace-root");
    expect(taxRow).toHaveClass("trace-output");
    expect(cRow).not.toHaveClass("trace-root");
  });

  it("adds trace emphasis to matching tokens while preserving parameter color precedence", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-y", name: "Y", expression: "tau * C + I" }]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={["tau"]}
      />
    );

    const expressionField = screen.getByDisplayValue("tau * C + I");
    const yRow = expressionField.closest('[role="row"]');

    expect(yRow).not.toBeNull();
    if (!yRow) {
      throw new Error("Expected equation row for traced expression");
    }

    fireEvent.click(yRow);

    const tauTokens = within(yRow).getAllByText("tau");
    const yTokens = within(yRow).getAllByText("Y");
    const cTokens = within(yRow).getAllByText("C");

    expect(tauTokens[0]).toHaveClass("formula-parameter");
    expect(yTokens[0]).toHaveClass("formula-uppercase");
    expect(yTokens.some((token) => token.className.includes("trace-token-root"))).toBe(true);
    expect(cTokens.some((token) => token.className.includes("trace-token-input"))).toBe(true);
  });

  it("renders and edits a description column", () => {
    const onChange = vi.fn();

    render(
      <EquationGridEditor
        equations={[{ id: "eq-y", name: "Y", desc: "Income = GDP", expression: "C + I" }]}
        issues={{}}
        onChange={onChange}
        parameterNames={[]}
      />
    );

    expect(screen.getAllByText("Description").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/equation 1 description/i), {
      target: { value: "Updated description" }
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "eq-y", name: "Y", desc: "Updated description", expression: "C + I" }
    ]);
  });

  it("adds instant tooltips to described variable tokens", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-y", name: "Y", desc: "Income = GDP", expression: "alpha1 * Y" }]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={["alpha1"]}
        variableDescriptions={
          new Map([
            ["Y", "Income = GDP"],
            ["alpha1", "Propensity to consume out of income"]
          ])
        }
        variableUnitMetadata={
          new Map([
            ["Y", { dimensionKind: "flow", baseUnit: "$" }],
            ["alpha1", { dimensionKind: "aux" }]
          ])
        }
      />
    );

    fireEvent.mouseEnter(screen.getByText("alpha1"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Propensity to consume out of income");
    fireEvent.mouseLeave(screen.getByText("alpha1"));

    const yToken = screen
      .getAllByText("Y")
      .find((node) => node.className.includes("formula-token"));
    expect(yToken).toBeDefined();
    if (!yToken) {
      throw new Error("Expected formula token for Y");
    }

    fireEvent.mouseEnter(yToken);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Income = GDP");
    expect(screen.getByRole("tooltip")).toHaveTextContent("flow ($/yr)");
  });

  it("shows a unit badge for the variable column when metadata is present", () => {
    render(
      <EquationGridEditor
        equations={[
          {
            id: "eq-mh",
            name: "Mh",
            desc: "Bank deposits held by households",
            expression: "lag(Mh) + YD - C"
          }
        ]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={[]}
        variableUnitMetadata={new Map([["Mh", { dimensionKind: "stock", baseUnit: "$" }]])}
      />
    );

    expect(screen.getByText("$")).toBeInTheDocument();
  });
});
