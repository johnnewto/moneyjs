import { describe, expect, it } from "vitest";

import {
  buildMatrixColumnSumSeries,
  collectMatrixColumnSumRefsFromMatrices,
  columnHasFlowEntries,
  formatMatrixColumnSumReference,
  formatQualifiedMatrixColumnSumReference,
  resolveMatrixColumnSumBindings,
  resolveMatrixColumnSumInspectContext
} from "../src/notebook/matrixColumnSumRuntime";
import { runBaseline } from "@sfcr/core";
import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";
import type { MatrixCell, NotebookCell, RunCell } from "../src/notebook/types";

const modelId = "equations-newton";

const runCell: RunCell = {
  id: "baseline-run",
  type: "run",
  title: "Baseline",
  sourceModelId: modelId,
  mode: "baseline",
  resultKey: "baseline",
  periods: 100
};

const accountTransactionsMatrix: MatrixCell = {
  id: "account-transactions",
  type: "matrix",
  title: "BMW account transactions",
  sourceRunCellId: "baseline-run",
  accountingKind: "account-transactions",
  columns: ["Households.Deposits (Mh)", "Firms.Loans (Ld)", "Sum"],
  columnBadges: ["asset", "liability", ""],
  sectors: ["Households", "Firms", ""],
  rows: [
    { band: "Wages", label: "Wages", values: ["WBd", "", "0"] },
    { band: "Consumption", label: "Consumption", values: ["-Cs", "", "0"] },
    { band: "Sum", label: "Sum", values: ["d(Mh)", "d(Ld)", "0"] }
  ]
};

describe("matrixColumnSumRuntime", () => {
  it("formats column labels as sum() references", () => {
    expect(formatMatrixColumnSumReference("Households.Deposits (Mh)")).toBe("Households.Deposits");
  });

  it("qualifies account-only column labels with their sector", () => {
    expect(formatQualifiedMatrixColumnSumReference("Households(HH)", "Deposits (Mh)")).toBe(
      "Households.Deposits"
    );
    expect(formatQualifiedMatrixColumnSumReference("Firms", "Deposits (Mf)")).toBe("Firms.Deposits");
    expect(formatQualifiedMatrixColumnSumReference("Households(HH)", "Net_Worth (Vh)")).toBe(
      "Households.Net_Worth"
    );
    expect(formatQualifiedMatrixColumnSumReference("Firms", "Firms.Loans (Ld)")).toBe("Firms.Loans");
  });

  it("detects whether a column has flow entries", () => {
    const sumRowIndex = accountTransactionsMatrix.rows.findIndex((row) => row.label === "Sum");
    expect(columnHasFlowEntries(accountTransactionsMatrix, 0, sumRowIndex)).toBe(true);
    expect(columnHasFlowEntries(accountTransactionsMatrix, 1, sumRowIndex)).toBe(false);
  });

  it("resolves bindings from bare qualified column refs in equations", () => {
    const bindings = resolveMatrixColumnSumBindings({
      cells: [runCell, accountTransactionsMatrix],
      modelId,
      runCellId: "baseline-run",
      equationSources: ["Mh' + Households.Deposits * dt"]
    });

    expect(bindings).toEqual({
      "Households.Deposits": ["WBd", "-Cs"]
    });
  });

  it("resolves bindings by stock variable symbol", () => {
    const bindings = resolveMatrixColumnSumBindings({
      cells: [runCell, accountTransactionsMatrix],
      modelId,
      runCellId: "baseline-run",
      equationSources: ["Mh' + sum(Mh) * dt"]
    });

    expect(bindings).toEqual({
      Mh: ["WBd", "-Cs"]
    });
  });

  it("resolves bindings when sector and account are stored separately", () => {
    const bmwStyleMatrix: MatrixCell = {
      ...accountTransactionsMatrix,
      columns: ["Deposits (Mh)", "Deposits (Mf)", "Sum"],
      sectors: ["Households(HH)", "Firms", ""],
      rows: [
        { band: "Wages", label: "Wages", values: ["WBd", "-WBd", "0"] },
        { band: "Consumption", label: "Consumption", values: ["-Cs", "+Cd", "0"] },
        { band: "Sum", label: "Sum", values: ["Mh", "Mf", "0"] }
      ]
    };

    expect(
      resolveMatrixColumnSumBindings({
        cells: [runCell, bmwStyleMatrix],
        modelId,
        runCellId: "baseline-run",
        equationSources: [
          "Mh' + sum(Households.Deposits) * dt",
          "Mf' + sum(Firms.Deposits) * dt"
        ]
      })
    ).toEqual({
      "Households.Deposits": ["WBd", "-Cs"],
      "Firms.Deposits": ["-WBd", "+Cd"]
    });
  });

  it("lists matrix column sum refs from linked account-transactions matrices", () => {
    expect(
      collectMatrixColumnSumRefsFromMatrices({
        cells: [runCell, accountTransactionsMatrix],
        modelId,
        runCellId: "baseline-run"
      })
    ).toEqual(["Firms.Loans", "Households.Deposits"]);
  });

  it("builds inspect context and series for a matrix column sum ref", () => {
    const context = resolveMatrixColumnSumInspectContext({
      cells: [runCell, accountTransactionsMatrix],
      modelId,
      runCellId: "baseline-run",
      columnRef: "Households.Deposits"
    });

    expect(context).toMatchObject({
      columnRef: "Households.Deposits",
      expression: "Households.Deposits",
      sources: ["WBd", "-Cs"]
    });

    const result = runBaseline(bmwBaselineModel, bmwBaselineOptions);
    const bindings = resolveMatrixColumnSumBindings({
      cells: [runCell, accountTransactionsMatrix],
      modelId,
      runCellId: "baseline-run",
      equationSources: ["sum(Households.Deposits)"]
    });
    const series = buildMatrixColumnSumSeries("Households.Deposits", bindings, result);
    expect(series?.length).toBe(result.options.periods + 1);
    expect(series?.[3]).toBeTypeOf("number");
  });
});
