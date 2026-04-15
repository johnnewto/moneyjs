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

  it("edits explicit equation roles from the grid", () => {
    const onChange = vi.fn();

    render(
      <EquationGridEditor
        equations={[{ id: "eq-y", name: "Y", expression: "C + I" }]}
        issues={{}}
        onChange={onChange}
        parameterNames={[]}
      />
    );

    fireEvent.change(screen.getByLabelText(/^equation role$/i), {
      target: { value: "identity" }
    });

    expect(onChange).toHaveBeenCalledWith([
      { id: "eq-y", name: "Y", expression: "C + I", role: "identity" }
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
    expect(screen.getByRole("tooltip")).toHaveTextContent("$/yr");
  });

  it("adds tooltips to lowercase variable tokens when metadata exists", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-yd", name: "YD", expression: "lag(rl) * lag(Mh)" }]}
        issues={{}}
        onChange={vi.fn()}
        parameterNames={[]}
        variableDescriptions={
          new Map([
            ["rl", "Rate of interest on bank loans"],
            ["Mh", "Bank deposits held by households"]
          ])
        }
        variableUnitMetadata={
          new Map([
            ["rl", { stockFlow: "aux", signature: { time: -1 } }],
            ["Mh", { stockFlow: "stock", signature: { money: 1 } }]
          ])
        }
      />
    );

    const rlToken = screen
      .getAllByText("rl")
      .find((node) => node.className.includes("formula-token"));
    expect(rlToken).toBeDefined();
    if (!rlToken) {
      throw new Error("Expected formula token for rl");
    }

    fireEvent.mouseEnter(rlToken);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rate of interest on bank loans");
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

  it("renders unit mismatch errors in the equation status cell and message row", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-v", name: "V", expression: "K + C" }]}
        issues={{
          "equations.0.expression": {
            message: "Cannot combine $ with $/yr using '+'.",
            severity: "error"
          }
        }}
        onChange={vi.fn()}
        parameterNames={[]}
      />
    );

    expect(screen.getByText("Error")).toBeInTheDocument();
    const message = screen.getByRole("note");
    expect(message).toHaveTextContent("Cannot combine $ with $/yr using '+'.");
    expect(message).toHaveClass("equation-grid-warning-row", "is-error");
  });

  it("renders unit warnings in the equation status cell and message row", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-mh", name: "Mh", expression: "lag(Mh) + YD - C" }]}
        issues={{
          "equations.0.expression": {
            message: "Stock 'Mh' assumes an implicit dt = 1 when adding increment terms.",
            severity: "warning"
          }
        }}
        onChange={vi.fn()}
        parameterNames={[]}
      />
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
    const message = screen.getByRole("note");
    expect(message).toHaveTextContent("Stock 'Mh' assumes an implicit dt = 1");
    expect(message).toHaveClass("equation-grid-warning-row", "is-warning");
  });

  it("renders d(name) stock warnings that recommend explicit dt", () => {
    render(
      <EquationGridEditor
        equations={[{ id: "eq-ls", name: "Ls", expression: "lag(Ls) + d(Ld)" }]}
        issues={{
          "equations.0.expression": {
            message:
              "Stock 'Ls' uses d(name) as a per-year stock-change term. Prefer adding '* dt' explicitly, e.g. lag(Ls) + d(name) * dt.",
            severity: "warning"
          }
        }}
        onChange={vi.fn()}
        parameterNames={[]}
      />
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
    const message = screen.getByRole("note");
    expect(message).toHaveTextContent("Prefer adding '* dt' explicitly");
    expect(message).toHaveClass("equation-grid-warning-row", "is-warning");
  });
});
