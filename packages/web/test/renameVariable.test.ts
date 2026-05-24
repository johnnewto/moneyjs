import { describe, expect, it } from "vitest";

import {
  countVariableReferences,
  renameVariableInNotebook,
  replaceIdentifierInSource
} from "../src/notebook/renameVariable";
import type { EquationsCell, MarkdownCell, MatrixCell, NotebookCell } from "../src/notebook/types";

describe("renameVariable", () => {
  it("replaces whole identifiers without touching longer names", () => {
    expect(replaceIdentifierInSource("Y + YD", "Y", "Y2")).toBe("Y2 + YD");
    expect(replaceIdentifierInSource("lag(Y)", "Y", "Y2")).toBe("lag(Y2)");
  });

  it("renames equations and matrix entries for a model", () => {
    const cells: NotebookCell[] = [
      {
        id: "equations",
        type: "equations",
        title: "Equations",
        modelId: "model-a",
        equations: [
          { id: "eq-y", name: "Y", expression: "Cs + G" },
          { id: "eq-c", name: "C", expression: "alpha1 * Y" }
        ]
      },
      {
        id: "matrix",
        type: "matrix",
        title: "Matrix",
        sourceRunCellId: "run-a",
        columns: ["A"],
        rows: [{ label: "Flow", values: ["+Y"] }]
      },
      {
        id: "run-a",
        type: "run",
        title: "Run",
        mode: "baseline",
        periods: 10,
        resultKey: "run",
        sourceModelId: "model-a"
      }
    ] satisfies NotebookCell[];

    const next = renameVariableInNotebook(cells, { kind: "modelId", modelId: "model-a" }, "Y", "Y2");
    const equations = next.find((cell): cell is EquationsCell => cell.type === "equations");
    const matrix = next.find((cell): cell is MatrixCell => cell.type === "matrix");

    expect(equations?.equations.find((row) => row.id === "eq-y")?.name).toBe("Y2");
    expect(equations?.equations.find((row) => row.id === "eq-c")?.expression).toBe("alpha1 * Y2");
    expect(matrix?.rows[0]?.values[0]).toBe("+Y2");
    expect(countVariableReferences(cells, { kind: "modelId", modelId: "model-a" }, "Y").referenceCount).toBeGreaterThan(
      0
    );
  });

  it("counts and renames variable mentions in markdown scoped to the nearest model", () => {
    const cells: NotebookCell[] = [
      {
        id: "intro",
        type: "markdown",
        title: "Intro",
        source: "Income `Y` tracks consumption `C`."
      },
      {
        id: "equations",
        type: "equations",
        title: "Equations",
        modelId: "model-a",
        equations: [{ id: "eq-y", name: "Y", expression: "C" }]
      },
      {
        id: "other-model",
        type: "equations",
        title: "Other",
        modelId: "model-b",
        equations: [{ id: "eq-y2", name: "Y", expression: "1" }]
      },
      {
        id: "far-markdown",
        type: "markdown",
        title: "Far",
        source: "Unrelated mention of Y."
      }
    ] satisfies NotebookCell[];

    const introCount = countVariableReferences(cells, { kind: "modelId", modelId: "model-a" }, "Y");
    expect(introCount).toEqual({ cellCount: 2, referenceCount: 2 });

    const next = renameVariableInNotebook(cells, { kind: "modelId", modelId: "model-a" }, "Y", "Y2");
    const intro = next.find((cell): cell is MarkdownCell => cell.id === "intro");
    const equations = next.find((cell): cell is EquationsCell => cell.id === "equations");
    const farMarkdown = next.find((cell): cell is MarkdownCell => cell.id === "far-markdown");

    expect(intro?.source).toContain("Y2");
    expect(intro?.source).not.toMatch(/`Y`/);
    expect(equations?.equations[0]?.name).toBe("Y2");
    expect(farMarkdown?.source).toBe("Unrelated mention of Y.");
  });

  it("renames derivative-balance equation targets when the underlying stock is renamed", () => {
    const cells: NotebookCell[] = [
      {
        id: "equations",
        type: "equations",
        title: "Equations",
        modelId: "model-a",
        equations: [
          { id: "eq-ls", name: "d(Ls)", expression: "d(Ld)" },
          { id: "eq-ld", name: "Ld", expression: "2" }
        ]
      }
    ] satisfies NotebookCell[];

    const next = renameVariableInNotebook(cells, { kind: "modelId", modelId: "model-a" }, "Ls", "Loans");
    const equations = next.find((cell): cell is EquationsCell => cell.type === "equations");

    expect(equations?.equations.find((row) => row.id === "eq-ls")?.name).toBe("d(Loans)");
    expect(equations?.equations.find((row) => row.id === "eq-ls")?.expression).toBe("d(Ld)");
  });
});
