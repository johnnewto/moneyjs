// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TransactionFlowGraphCanvas } from "../src/components/TransactionFlowGraphCanvas";
import { buildSequenceDiagramFromMatrix } from "../src/notebook/sequence";
import type { MatrixCell } from "../src/notebook/types";

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
