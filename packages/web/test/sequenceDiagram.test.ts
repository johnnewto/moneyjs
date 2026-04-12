import { describe, expect, it } from "vitest";

import type { SimulationResult } from "@sfcr/core";

import {
  buildSequenceDiagramFromMatrix,
  parseSequencePlantUml,
  resolveSequenceDiagram
} from "../src/notebook/sequence";
import type { MatrixCell, SequenceCell } from "../src/notebook/types";

describe("sequence diagrams", () => {
  it("parses a PlantUML subset into participants and ordered steps", () => {
    const diagram = parseSequencePlantUml(`
      @startuml
      participant Households
      participant "Firms Current" as FirmsCurrent
      Households -> FirmsCurrent : Consumption
      note over Households, FirmsCurrent : Settles demand
      == Capital ==
      FirmsCurrent --> Households : Dividend
      @enduml
    `);

    expect(diagram.errors).toEqual([]);
    expect(diagram.participants.map((participant) => participant.label)).toEqual([
      "Households",
      "Firms Current"
    ]);
    expect(diagram.steps.map((step) => step.type)).toEqual([
      "message",
      "note",
      "divider",
      "message"
    ]);
  });

  it("auto-generates directed flows from a matrix using raw signs before runtime values exist", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      columns: ["Households", "Firms", "Banks", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "", "0"] },
        { label: "Interest", values: ["", "-rl * Ld", "+rl * Ls", "0"] },
        { label: "Sum", values: ["0", "0", "0", "0"] }
      ]
    };

    const diagram = buildSequenceDiagramFromMatrix(matrixCell, null, 0);

    expect(diagram.errors).toEqual([]);
    expect(diagram.participants.map((participant) => participant.id)).toEqual([
      "Households",
      "Firms",
      "Banks"
    ]);
    expect(
      diagram.steps.filter((step) => step.type === "message").map((step) =>
        `${step.senderId}->${step.receiverId}:${step.label}`
      )
    ).toEqual([
      "Households->Firms:Consumption",
      "Firms->Banks:Interest"
    ]);
  });

  it("resolves a bound matrix cell with runtime values into labeled amounts", () => {
    const matrixCell: MatrixCell = {
      id: "flows",
      type: "matrix",
      title: "Flows",
      sourceRunCellId: "run-1",
      columns: ["Households", "Firms", "Sum"],
      rows: [
        { label: "Consumption", values: ["-Cd", "+Cs", "0"] },
        { label: "Sum", values: ["0", "0", "0"] }
      ]
    };
    const sequenceCell: SequenceCell = {
      id: "sequence-1",
      type: "sequence",
      title: "Sequence",
      source: {
        kind: "matrix",
        matrixCellId: "flows"
      }
    };
    const result: SimulationResult = {
      series: {
        Cd: new Float64Array([147.26]),
        Cs: new Float64Array([147.26])
      },
      blocks: [],
      model: {
        equations: [],
        externals: {},
        initialValues: {}
      },
      options: {
        periods: 1,
        solverMethod: "NEWTON",
        tolerance: 1e-6,
        maxIterations: 40
      }
    };

    const diagram = resolveSequenceDiagram(
      sequenceCell,
      (cellId) => (cellId === "flows" ? matrixCell : null),
      (cellId) => (cellId === "run-1" ? result : null),
      0
    );

    expect(diagram.errors).toEqual([]);
    expect(diagram.steps[0]).toMatchObject({
      type: "message",
      senderId: "Households",
      receiverId: "Firms",
      label: "Consumption (147.26)",
      magnitude: 147.26
    });
  });
});
