// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CldSequenceView } from "../src/notebook/components/CldSequenceView";
import type { NotebookCell, SequenceCell } from "../src/notebook/types";

vi.mock("../src/components/CldGraphCanvas", () => ({
  CldGraphCanvas: () => <div data-testid="cld-graph-canvas" />
}));

afterEach(() => {
  cleanup();
});

describe("CldSequenceView", () => {
  it("hides loops that include lagged edges when toggled", () => {
    const cells: NotebookCell[] = [
      {
        type: "equations",
        id: "eqs",
        title: "Model",
        metadata: { version: 1 },
        modelId: "m1",
        equations: [
          { id: "eq-a", name: "A", expression: "B" },
          { id: "eq-b", name: "B", expression: "lag(A)" }
        ]
      },
      {
        type: "solver",
        id: "solver",
        title: "Solver",
        metadata: { version: 1 },
        modelId: "m1",
        options: {
          periods: 10,
          solverMethod: "NEWTON",
          toleranceText: "1e-8",
          maxIterations: 25,
          defaultInitialValueText: "1e-15",
          hiddenLeftVariable: "",
          hiddenRightVariable: "",
          hiddenToleranceText: "0.00001",
          relativeHiddenTolerance: false
        },
        collapsed: true
      },
      {
        type: "sequence",
        id: "cld",
        title: "CLD",
        metadata: { version: 1 },
        source: { kind: "cld", modelId: "m1" }
      } satisfies SequenceCell
    ];

    const cldCell = cells.find((cell): cell is SequenceCell => cell.type === "sequence")!;

    render(
      <CldSequenceView
        cell={cldCell as any}
        cells={cells}
        getModelCurrentValues={() => ({})}
        onVariableInspectRequest={vi.fn()}
        variableDescriptions={new Map()}
      />
    );

    const loopsBadge = () =>
      screen.getByText((_, element) => (element?.textContent ?? "").trim().startsWith("Loops"));
    expect(loopsBadge()).toHaveTextContent("Loops 1");

    fireEvent.click(screen.getByLabelText("Hide lagged loops"));

    expect(loopsBadge()).toHaveTextContent("Loops 0");
    expect(screen.queryByRole("heading", { name: "Feedback loops" })).not.toBeInTheDocument();
  });
});

