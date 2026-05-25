// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionFlowGraphCanvas } from "../src/components/TransactionFlowGraphCanvas";
import { TransactionFlowMultiportCanvas } from "../src/components/TransactionFlowMultiportCanvas";
import type { MultiportVariableInspectContextValue } from "../src/components/flow/MultiportVariableInspectContext";
import { buildSequenceDiagramFromMatrix } from "../src/notebook/sequence";
import type { MatrixCell } from "../src/notebook/types";

const emptyMultiportInspectContext: MultiportVariableInspectContextValue = {
  currentValues: {},
  highlightedVariable: null,
  parameterNames: new Set(),
  variableDescriptions: new Map([["Cd", "Consumption demand"], ["Cs", "Consumption supply"]]),
  variableUnitMetadata: new Map()
};

afterEach(() => {
  cleanup();
});

describe("TransactionFlowGraphCanvas", () => {
  it("renders a transaction flow diagram region", async () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["Households", "Firms", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);

    render(
      <TransactionFlowGraphCanvas
        diagram={diagram}
        visibleStepCount={1}
        highlightedStepIndex={0}
      />
    );

    expect(screen.getByRole("region", { name: "Transaction flow diagram" })).toBeInTheDocument();
    expect(screen.getByText("Households", { hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Firms", { hidden: true })).toBeInTheDocument();
    expect(screen.getAllByText("Consumption").length).toBeGreaterThan(0);
    expect(document.querySelector(".transaction-flow-edge__path")).not.toBeNull();
    expect(screen.getByText("-Cd → +Cs")).toBeInTheDocument();
  });

  it("renders a note lane instead of edges for ambiguous multi-party rows", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["A", "B", "C", "D"],
      rows: [
        { label: "Split", values: ["-a", "-b", "+c", "+d"] },
        { label: "Sum", values: ["0", "0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);

    render(
      <TransactionFlowGraphCanvas
        diagram={diagram}
        visibleStepCount={diagram.steps.length}
        highlightedStepIndex={null}
      />
    );

    expect(screen.getByRole("region", { name: "Transaction flow diagram" })).toBeInTheDocument();
    expect(screen.getByTestId("rf__node-note-0")).toBeInTheDocument();
    expect(screen.getAllByText(/unable to infer a single directed flow: split/i).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".react-flow__edge")).toHaveLength(0);
  });
});

describe("TransactionFlowMultiportCanvas", () => {
  it("renders animated multiport transaction edges", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["Households", "Firms", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);

    render(
      <TransactionFlowMultiportCanvas
        diagram={diagram}
        inspectContext={emptyMultiportInspectContext}
        visibleStepCount={1}
        highlightedStepIndex={0}
      />
    );

    expect(
      screen.getByRole("region", { name: "Animated multiport transaction flow diagram" })
    ).toBeInTheDocument();
    expect(screen.getByText("Households", { hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Firms", { hidden: true })).toBeInTheDocument();
    expect(screen.getAllByText("Consumption").length).toBeGreaterThan(0);
    expect(document.querySelector(".matrix-multiport__port-formula .formula-token")).not.toBeNull();
    expect(screen.getByText("Cd", { hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Cs", { hidden: true })).toBeInTheDocument();
    expect(document.querySelector('[data-nodeid="Households"][data-handleid="right-0"]')).not.toBeNull();
    expect(document.querySelector('[data-nodeid="Firms"][data-handleid="left-0"]')).not.toBeNull();
    expect(document.querySelector(".react-flow__marker .react-flow__arrowhead")).not.toBeNull();
  });

  it("calls onSelectVariable when a formula token is clicked", () => {
    const onSelectVariable = vi.fn();
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["Households", "Firms", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);

    render(
      <TransactionFlowMultiportCanvas
        diagram={diagram}
        inspectContext={{
          ...emptyMultiportInspectContext,
          onSelectVariable
        }}
        visibleStepCount={1}
        highlightedStepIndex={0}
      />
    );

    const token = document.querySelector(
      ".matrix-multiport__port-formula .formula-token.is-clickable"
    );
    expect(token).not.toBeNull();
    if (!(token instanceof HTMLElement)) {
      throw new Error("Expected clickable formula token.");
    }

    fireEvent.click(token);

    expect(onSelectVariable).toHaveBeenCalledWith("Cd");
  });
});
