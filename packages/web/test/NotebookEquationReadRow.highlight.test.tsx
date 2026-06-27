// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookEquationReadRow } from "../src/notebook/components/EquationRowInlineEditor";

afterEach(() => cleanup());

function renderReadRow(props: {
  name: string;
  expression: string;
  highlightedVariable: string;
  onInspectVariable?: (name: string) => void;
  currentValues?: Record<string, number | undefined>;
  variableDescriptions?: Map<string, string>;
}) {
  return render(
    <NotebookEquationReadRow
      currentValues={props.currentValues ?? {}}
      equation={{
        id: "eq-under-test",
        name: props.name,
        expression: props.expression,
        desc: ""
      }}
      equationIndex={0}
      formatRoleLabel={() => "Identity"}
      highlightedVariable={props.highlightedVariable}
      hoveredRowId={null}
      isEditing={false}
      parameterNames={new Set()}
      rowDraft={{ expression: props.expression, name: props.name }}
      rowEditFocus="expression"
      rowValidationError={null}
      traceRole={null}
      variableDescriptions={props.variableDescriptions ?? new Map()}
      onApplyRow={() => undefined}
      onBeginRowEdit={() => undefined}
      onCancelRow={() => undefined}
      onDraftExpressionChange={() => undefined}
      onDraftNameChange={() => undefined}
      onInspectVariable={props.onInspectVariable ?? (() => undefined)}
      onRowClick={() => undefined}
      onRowMouseEnter={() => undefined}
      onRowMouseLeave={() => undefined}
    />
  );
}

function highlightedNameTokens(container: HTMLElement): string[] {
  const namesCell = container.querySelector(".notebook-model-view-name");
  return Array.from(
    namesCell?.querySelectorAll(".formula-token.is-document-highlighted") ?? []
  ).map((node) => node.textContent ?? "");
}

describe("NotebookEquationReadRow document highlight", () => {
  it("marks the equation name button when it matches the highlighted variable", () => {
    const { container } = renderReadRow({
      name: "Y",
      expression: "Cs + Is",
      highlightedVariable: "Y"
    });

    expect(
      container.querySelector(".result-variable-button.is-document-highlighted")
    ).not.toBeNull();
  });

  it("highlights the derivative-balance stock inside a d(...) name", () => {
    const { container } = renderReadRow({
      name: "d(Mp)",
      expression: "Hh - Hb",
      highlightedVariable: "Mp"
    });

    expect(highlightedNameTokens(container)).toContain("Mp");
  });

  it("highlights a variable argument inside a function-call name", () => {
    const { container } = renderReadRow({
      name: "TSDELTALOG(lh,1)",
      expression: "log(lh) - log(lh[-1])",
      highlightedVariable: "lh"
    });

    expect(highlightedNameTokens(container)).toContain("lh");
  });

  it("does not highlight the function name itself", () => {
    const { container } = renderReadRow({
      name: "TSDELTALOG(lh,1)",
      expression: "0",
      highlightedVariable: "TSDELTALOG"
    });

    expect(highlightedNameTokens(container)).not.toContain("TSDELTALOG");
  });

  it("inspects the inner variable when clicking a function-call name", () => {
    const onInspectVariable = vi.fn();
    const { container } = renderReadRow({
      name: "TSDELTALOG(lh,1)",
      expression: "0",
      highlightedVariable: "",
      onInspectVariable
    });

    const button = container.querySelector(".result-variable-button") as HTMLButtonElement;
    fireEvent.click(button);
    expect(onInspectVariable).toHaveBeenCalledWith("lh");
  });

  it("inspects the inner variable when clicking a TSDELTAP name", () => {
    const onInspectVariable = vi.fn();
    const { container } = renderReadRow({
      name: "TSDELTAP(oph,1)",
      expression: "2",
      highlightedVariable: "",
      onInspectVariable
    });

    const button = container.querySelector(".result-variable-button") as HTMLButtonElement;
    fireEvent.click(button);
    expect(onInspectVariable).toHaveBeenCalledWith("oph");
  });

  it("inspects the derivative-balance stock when clicking a d(...) name", () => {
    const onInspectVariable = vi.fn();
    const { container } = renderReadRow({
      name: "d(Mp)",
      expression: "0",
      highlightedVariable: "",
      onInspectVariable
    });

    const button = container.querySelector(".result-variable-button") as HTMLButtonElement;
    fireEvent.click(button);
    expect(onInspectVariable).toHaveBeenCalledWith("Mp");
  });

  it("shows a fast variable hint for an inner variable token in a function-call name", () => {
    const { container } = renderReadRow({
      name: "TSDELTALOG(lh,1)",
      expression: "0.0583*TSLAG(cons/yd,1)",
      highlightedVariable: "",
      currentValues: { lh: 12.5 },
      variableDescriptions: new Map([["lh", "Loans to households"]])
    });

    const namesCell = container.querySelector(".notebook-model-view-name") as HTMLElement;
    const lhToken = Array.from(namesCell.querySelectorAll(".formula-token")).find(
      (node) => node.textContent === "lh"
    ) as HTMLElement;
    expect(lhToken).toBeDefined();

    fireEvent.mouseEnter(lhToken);
    const bubble = document.querySelector(".instant-tooltip-bubble");
    expect(bubble?.textContent ?? "").toContain("Loans to households");
  });

  it("inspects the plain name when clicking a non-function name", () => {
    const onInspectVariable = vi.fn();
    const { container } = renderReadRow({
      name: "Y",
      expression: "Cs + Is",
      highlightedVariable: "",
      onInspectVariable
    });

    const button = container.querySelector(".result-variable-button") as HTMLButtonElement;
    fireEvent.click(button);
    expect(onInspectVariable).toHaveBeenCalledWith("Y");
  });
});
