// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SequenceCellView } from "../src/notebook/components/SequenceCellView";
import type { MatrixCell, NotebookCell, SequenceCell } from "../src/notebook/types";

vi.mock("../src/components/TransactionFlowMultiportCanvas", () => ({
  TransactionFlowMultiportCanvas: ({
    onParticipantColumnOrderChange
  }: {
    onParticipantColumnOrderChange?: (order: string[]) => void;
  }) => (
    <button
      type="button"
      onClick={() => onParticipantColumnOrderChange?.(["Firms", "Households"])}
    >
      Reorder participants
    </button>
  )
}));

afterEach(() => {
  cleanup();
});

describe("SequenceCellView", () => {
  it("persists multiport participant reorder into the sequence cell", () => {
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
    const sequenceCell: SequenceCell = {
      id: "flow-sequence",
      type: "sequence",
      title: "Flow sequence",
      source: { kind: "matrix", matrixCellId: matrixCell.id }
    };
    const cells: NotebookCell[] = [matrixCell, sequenceCell];
    const onCellChange = vi.fn();

    render(
      <SequenceCellView
        cell={sequenceCell}
        cells={cells}
        getModelCurrentValues={() => ({})}
        matrixSequenceViewState={null}
        maxPeriodIndex={0}
        onCellChange={onCellChange}
        onMatrixSequenceViewStateChange={vi.fn()}
        onSelectedPeriodIndexChange={vi.fn()}
        onVariableInspectRequest={vi.fn()}
        runner={{ getResult: () => null } as never}
        selectedPeriodIndex={0}
        variableDescriptions={new Map()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reorder participants" }));

    expect(onCellChange).toHaveBeenCalledWith(sequenceCell.id, expect.any(Function));
    const updater = onCellChange.mock.calls[0]?.[1] as (cell: NotebookCell) => NotebookCell;
    expect(updater(sequenceCell)).toEqual({
      ...sequenceCell,
      participantColumnOrder: ["Firms", "Households"]
    });
  });
});
