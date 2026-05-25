import { describe, expect, it } from "vitest";

import {
  applyParticipantColumnOrder,
  defaultParticipantColumnOrder,
  multiportXFromSlot,
  reorderParticipantIds,
  sanitizeParticipantColumnOrder,
  slotFromMultiportX
} from "../src/components/transactionFlowMultiportOrder";
import { MULTIPORT_START_X, MULTIPORT_X_GAP } from "../src/components/transactionFlowMultiportLayout";
import { buildSequenceDiagramFromMatrix } from "../src/notebook/sequence";
import type { MatrixCell } from "../src/notebook/types";

const matrixCell: MatrixCell = {
  id: "flows",
  type: "matrix",
  title: "Flows",
  columns: ["A", "B", "C", "Sum"],
  rows: [
    { label: "Payment", values: ["-a", "+b", "0", "0"] },
    { label: "Sum", values: ["0", "0", "0", "0"] }
  ]
};

describe("transactionFlowMultiportOrder", () => {
  it("reorders participants without mutating step sender ids", () => {
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    const reordered = applyParticipantColumnOrder(diagram, ["C", "A", "B"]);

    expect(reordered.participants.map((participant) => participant.id)).toEqual(["C", "A", "B"]);
    expect(reordered.participants.map((participant) => participant.order)).toEqual([0, 1, 2]);
    expect(reordered.steps[0]).toMatchObject({
      type: "message",
      senderId: "A",
      receiverId: "B"
    });
  });

  it("sanitizes stored order when participants change", () => {
    expect(sanitizeParticipantColumnOrder(["A", "B"], ["B", "A", "C"])).toEqual(["B", "A"]);
    expect(sanitizeParticipantColumnOrder(["A", "B", "C"], ["B", "A"])).toEqual(["B", "A", "C"]);
    expect(sanitizeParticipantColumnOrder(["A", "B", "C"], ["B", "B", "A"])).toEqual(["B", "A", "C"]);
  });

  it("maps slots to the multiport grid", () => {
    expect(slotFromMultiportX(MULTIPORT_START_X, 3)).toBe(0);
    expect(slotFromMultiportX(MULTIPORT_START_X + MULTIPORT_X_GAP * 1.4, 3)).toBe(1);
    expect(slotFromMultiportX(MULTIPORT_START_X + MULTIPORT_X_GAP * 2.6, 3)).toBe(2);
    expect(multiportXFromSlot(2)).toBe(MULTIPORT_START_X + MULTIPORT_X_GAP * 2);
  });

  it("inserts dragged ids at the target slot", () => {
    expect(reorderParticipantIds(["A", "B", "C"], "C", 0)).toEqual(["C", "A", "B"]);
    expect(reorderParticipantIds(["A", "B", "C"], "A", 2)).toEqual(["B", "C", "A"]);
    expect(reorderParticipantIds(["A", "B", "C"], "D", 1)).toEqual(["A", "B", "C"]);
  });

  it("defaults column order from diagram participants", () => {
    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);
    expect(defaultParticipantColumnOrder(diagram)).toEqual(["A", "B", "C"]);
  });
});
