import { describe, expect, it } from "vitest";

import { buildVariableUnitMetadata } from "../src/lib/units";
import { validateMatrixEntryUnits } from "../src/notebook/matrixUnitValidation";
import {
  applyMatrixUnitMetaUpdates,
  buildProposedMatrixUnitMeta,
  collectProposedMatrixUnitUpdates,
  defaultSelectedMatrixUnitVariables,
  unitMetaMatchesProposed
} from "../src/notebook/matrixUnitMetadataSync";
import { classifyMatrixEntrySource } from "../src/notebook/matrixVariableReference";
import type { EquationsCell, ExternalsCell, MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";

const modelId = "equations-newton";

const equationsCell: EquationsCell = {
  id: "equations",
  type: "equations",
  title: "Equations",
  modelId,
  equations: [
    { id: "eq-mh", name: "Mh", expression: "lag(Mh) + (YD - Cd) * dt", unitMeta: { stockFlow: "stock", signature: { money: 1 } } },
    { id: "eq-cd", name: "Cd", expression: "alpha0 + alpha1 * YD", unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } } },
    { id: "eq-cs", name: "Cs", expression: "Cd", unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } } },
    { id: "eq-nd", name: "Nd", expression: "Y / pr", unitMeta: { stockFlow: "flow", signature: { items: 1, time: -1 } } }
  ]
};

const runCell: RunCell = {
  id: "baseline-run",
  type: "run",
  title: "Baseline",
  sourceModelId: modelId,
  mode: "baseline",
  resultKey: "baseline",
  periods: 100
};

const balanceSheetMatrix: MatrixCell = {
  id: "balance-sheet",
  type: "matrix",
  title: "BMW balance sheet",
  sourceRunCellId: "baseline-run",
  columns: ["Households", "Sum"],
  rows: [
    { band: "Deposits", label: "Money deposits", values: ["+Mh", "0"] },
    { band: "Loans", label: "Loans", values: ["+Cd", "0"] }
  ]
};

const transactionFlowMatrix: MatrixCell = {
  id: "transaction-flow",
  type: "matrix",
  title: "BMW transactions-flow matrix",
  sourceRunCellId: "baseline-run",
  columns: ["Households", "Firms", "Sum"],
  rows: [
    { band: "Consumption", label: "Consumption", values: ["-Cs", "+Cd", "0"] },
    { band: "Deposits", label: "Ch. deposits", values: ["-d(Mh)", "", "0"] }
  ]
};

const cells: NotebookCell[] = [equationsCell, runCell, balanceSheetMatrix, transactionFlowMatrix];

describe("matrixUnitMetadataSync", () => {
  it("proposes stock metadata for balance-sheet single-variable refs", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    const updates = collectProposedMatrixUnitUpdates({
      cells,
      matrix: balanceSheetMatrix,
      modelId,
      variableUnitMetadata: metadata
    });

    expect(updates.find((update) => update.variable === "Mh")).toMatchObject({
      proposed: { stockFlow: "stock", signature: { money: 1 } },
      isMismatch: false
    });
    expect(updates.find((update) => update.variable === "Cd")).toMatchObject({
      proposed: { stockFlow: "stock", signature: { money: 1 } },
      isMismatch: true
    });
  });

  it("proposes flow metadata for transaction-flow plain refs and stock for d(Name)", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    const updates = collectProposedMatrixUnitUpdates({
      cells,
      matrix: transactionFlowMatrix,
      modelId,
      variableUnitMetadata: metadata
    });

    expect(updates.find((update) => update.variable === "Cs")).toMatchObject({
      proposed: { stockFlow: "flow", signature: { money: 1, time: -1 } },
      isMismatch: false
    });
    expect(updates.find((update) => update.variable === "Cd")).toMatchObject({
      proposed: { stockFlow: "flow", signature: { money: 1, time: -1 } },
      isMismatch: false
    });

    const mhUpdate = updates.find((update) => update.variable === "Mh");
    expect(mhUpdate).toMatchObject({
      proposed: { stockFlow: "stock", signature: { money: 1 } },
      isMismatch: false
    });
    expect(mhUpdate?.sources[0]).toContain("via d(Mh)");
  });

  it("keeps d(Mh) cell validation as flow while Mh remains stock", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    expect(
      validateMatrixEntryUnits("-d(Mh)", "transaction-flow", metadata, {
        rowLabel: "Ch. deposits",
        columnLabel: "Households"
      })
    ).toEqual([]);

    const proposed = buildProposedMatrixUnitMeta(
      "transaction-flow",
      classifyMatrixEntrySource("-d(Mh)")!,
      metadata.get("Mh")
    );
    expect(proposed).toEqual({ stockFlow: "stock", signature: { money: 1 } });
  });

  it("preserves items dimension when proposing flow metadata", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    const matrix: MatrixCell = {
      ...transactionFlowMatrix,
      rows: [{ band: "Labor", label: "Labor demand", values: ["+Nd", "", "0"] }]
    };
    const updates = collectProposedMatrixUnitUpdates({
      cells,
      matrix,
      modelId,
      variableUnitMetadata: metadata
    });

    expect(updates.find((update) => update.variable === "Nd")).toMatchObject({
      proposed: { stockFlow: "flow", signature: { items: 1, time: -1 } }
    });
  });

  it("skips compound matrix expressions", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    const matrix: MatrixCell = {
      ...transactionFlowMatrix,
      rows: [
        {
          band: "Deposits",
          label: "Interest on deposits",
          values: ["+rm[-1] * Mh[-1]", "", "0"]
        }
      ]
    };

    expect(
      collectProposedMatrixUnitUpdates({
        cells,
        matrix,
        modelId,
        variableUnitMetadata: metadata
      })
    ).toEqual([]);
  });

  it("defaults checkbox selection to mismatches only", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    const updates = collectProposedMatrixUnitUpdates({
      cells,
      matrix: balanceSheetMatrix,
      modelId,
      variableUnitMetadata: metadata
    });

    expect(defaultSelectedMatrixUnitVariables(updates)).toEqual(new Set(["Cd"]));
  });

  it("applies only selected variable updates", () => {
    const metadata = buildVariableUnitMetadata({ equations: equationsCell.equations });
    const updates = collectProposedMatrixUnitUpdates({
      cells,
      matrix: balanceSheetMatrix,
      modelId,
      variableUnitMetadata: metadata
    });
    const selected = updates.filter((update) => update.variable === "Cd");
    const nextCells = applyMatrixUnitMetaUpdates(cells, selected);
    const nextEquations = nextCells.find(
      (entry): entry is EquationsCell => entry.type === "equations" && entry.modelId === modelId
    );

    expect(nextEquations?.equations.find((equation) => equation.name === "Cd")?.unitMeta).toEqual({
      stockFlow: "stock",
      signature: { money: 1 }
    });
    expect(nextEquations?.equations.find((equation) => equation.name === "Mh")?.unitMeta).toEqual({
      stockFlow: "stock",
      signature: { money: 1 }
    });
  });

  it("detects matching unit metadata", () => {
    expect(
      unitMetaMatchesProposed(
        { stockFlow: "flow", signature: { money: 1, time: -1 } },
        { stockFlow: "flow", signature: { money: 1, time: -1 } }
      )
    ).toBe(true);
    expect(
      unitMetaMatchesProposed(
        { stockFlow: "flow", signature: { money: 1, time: -1 } },
        { stockFlow: "stock", signature: { money: 1 } }
      )
    ).toBe(false);
  });
});
