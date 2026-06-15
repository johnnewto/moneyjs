import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEquation, parseExpression } from "@sfcr/core";
import { parseNotebookSource } from "@sfcr/notebook-core";
import { describe, expect, it } from "vitest";

import {
  collectProposedMatrixEquationUpdates,
  isEmptyMatrixEntrySource,
  resolveSumRowStockVariable
} from "../src/notebook/matrixAccountSumRow";
import {
  resolveMatrixColumnSumBindingBundle,
  resolveMatrixColumnSumBindings
} from "../src/notebook/matrixColumnSumRuntime";
import { validateMatrixEntryUnits } from "../src/notebook/matrixUnitValidation";
import type { EquationsCell, MatrixCell, NotebookCell, NotebookDocument } from "../src/notebook/types";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): NotebookDocument {
  const yaml = readFileSync(join(fixtureDir, "fixtures", name), "utf8");
  return parseNotebookSource(yaml, "yaml").document as NotebookDocument;
}

describe("imported pc-table3 YAML", () => {
  it("preserves Mh accumulation expression through YAML parse", () => {
    const document = loadFixture("imported-pc-table3-snippet.notebook.yaml");
    const equationsCell = document.cells.find((cell) => cell.type === "equations") as EquationsCell;
    const mh = equationsCell.equations.find((equation) => equation.name === "Mh");

    expect(mh?.expression).toBe("Mh' + Households.Deposits* dt");
    expect(() => parseEquation("Mh", mh!.expression)).not.toThrow();
  });

  it("maps plain sum-row stock Mh to variable Mh, not column label Deposits", () => {
    const document = loadFixture("imported-pc-table3-snippet.notebook.yaml");
    const matrix = document.cells.find((cell) => cell.id === "account-transactions") as MatrixCell;

    expect(resolveSumRowStockVariable(matrix, 0, "Mh")).toBe("Mh");
  });

  it("proposes accumulation for Mh when sum row uses plain stock symbols", () => {
    const document = loadFixture("imported-pc-table3-snippet.notebook.yaml");
    const matrix = document.cells.find((cell) => cell.id === "account-transactions") as MatrixCell;
    const updates = collectProposedMatrixEquationUpdates({
      cells: document.cells as NotebookCell[],
      matrix,
      modelId: "pc-baseline"
    });

    expect(updates.find((update) => update.variable === "Mh")).toMatchObject({
      proposed: { expression: expect.stringContaining("Households.Deposits") }
    });
  });

  it("excludes lone minus placeholders from column-sum bindings", () => {
    const document = loadFixture("imported-pc-table3-full.notebook.yaml");
    const { bindings, locations } = resolveMatrixColumnSumBindingBundle({
      cells: document.cells as NotebookCell[],
      modelId: "pc-baseline",
      runCellId: "baseline-run",
      equationSources: ["Mh' + Households.Deposits* dt", "BGs' + Government.Bills * dt"]
    });

    expect(bindings["Households.Deposits"]).toBeDefined();
    expect(bindings["Households.Deposits"]).not.toContain("-");
    expect(locations["Households.Deposits"]?.length).toBe(bindings["Households.Deposits"]?.length);
    expect(locations["Households.Deposits"]?.[0]).toMatchObject({
      matrixTitle: "PC account transactions",
      rowLabel: "Consumption"
    });
  });

  it("includes matrix cell context in parse diagnostics", () => {
    const document = loadFixture("imported-pc-table3-full.notebook.yaml");
    const matrix = document.cells.find((cell) => cell.id === "account-transactions") as MatrixCell;

    const diagnostics = validateMatrixEntryUnits(
      "(",
      "account-transactions",
      new Map(),
      {
        rowLabel: "Consumption",
        columnLabel: "Deposits",
        cell: { id: matrix.id, title: matrix.title }
      }
    );

    expect(diagnostics[0]?.message).toContain("Matrix 'PC account transactions' cell (Consumption / Deposits)");
    expect(diagnostics[0]?.message).toContain("Unexpected");
    expect(diagnostics[0]?.message).toContain("entry: '('");
  });
});
