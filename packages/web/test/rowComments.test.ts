import { describe, expect, it } from "vitest";

import {
  buildCompactEquationListRow,
  notebookFromYaml,
  notebookToCompactYaml,
  parseCompactEquationRows
} from "@sfcr/notebook-core";

describe("row comments in compact YAML rows", () => {
  it("parses quoted section comments between equation rows", () => {
    const rows = parseCompactEquationRows(
      [
        "Equalize supply to demand.",
        ["Cs", "Cd", "Consumption goods supply", "$/year", "flow", "definition"],
        ["Y", "Cs + Is", "Income = GDP", "$/year", "flow", "identity"]
      ],
      {}
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      id: "eq-comment-0-Equalize-supply-to-demand",
      kind: "comment",
      text: "Equalize supply to demand."
    });
    expect(rows[1]).toMatchObject({ name: "Cs", expression: "Cd" });
    expect(rows[2]).toMatchObject({ name: "Y", expression: "Cs + Is" });
  });

  it("round-trips comment rows through compact YAML", () => {
    const source = `
format: sfcr-notebook-yaml
formatVersion: 1
id: comment-rows-notebook
title: Comment rows
metadata:
  version: 1
cells:
  - equations:
      id: equations-main
      title: Equations
      modelId: main
      rows:
        - "Supply block"
        - [Y, C + G, "Income", $/year, flow, identity]
  - solver:
      id: solver-main
      title: Solver
      modelId: main
      tolerance: "1e-10"
      maxIterations: 100
      defaultInitialValue: "1e-15"
  - run:
      id: baseline-run
      title: Baseline
      mode: baseline
      periods: 10
      resultKey: baseline
      sourceModelId: main
`.trim();

    const document = notebookFromYaml(source);
    const equationsCell = document.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations") {
      return;
    }

    expect(equationsCell.equations[0]).toMatchObject({
      kind: "comment",
      text: "Supply block"
    });
    expect(buildCompactEquationListRow(equationsCell.equations[0], 0)).toBe("Supply block");

    const yaml = notebookToCompactYaml(document);
    expect(yaml).toContain("- Supply block");
    expect(yaml).toContain("[Y, C + G");
  });

  it("round-trips a new empty section comment through compact YAML", () => {
    const source = `
format: sfcr-notebook-yaml
formatVersion: 1
id: comment-rows-notebook
title: Comment rows
metadata:
  version: 1
cells:
  - equations:
      id: equations-main
      title: Equations
      modelId: main
      rows:
        - kind: comment
          id: comment-1
          text: ""
        - [Y, C + G, "Income", $/year, flow, identity]
  - solver:
      id: solver-main
      title: Solver
      modelId: main
      method: newton
      tolerance: "1e-10"
      maxIterations: 100
      defaultInitialValue: "1e-15"
      hiddenLeftVariable: ""
      hiddenRightVariable: ""
      hiddenTolerance: "0.00001"
      relativeHiddenTolerance: false
  - run:
      id: baseline-run
      title: Baseline
      mode: baseline
      periods: 10
      resultKey: baseline
      sourceModelId: main
`.trim();

    const document = notebookFromYaml(source);
    const equationsCell = document.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations") {
      return;
    }

    expect(equationsCell.equations[0]).toMatchObject({
      id: "comment-1",
      kind: "comment",
      text: ""
    });

    const rows = parseCompactEquationRows(
      equationsCell.equations.map((row, index) => buildCompactEquationListRow(row, index)),
      {}
    );
    expect(rows[0]).toMatchObject({ id: "comment-1", kind: "comment", text: "" });
    expect(rows[1]).toMatchObject({ name: "Y" });
  });
});
