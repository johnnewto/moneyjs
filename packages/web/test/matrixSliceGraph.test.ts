import { describe, expect, it } from "vitest";

import { runBaseline } from "@sfcr/core";

import { buildRuntimeConfig } from "../src/lib/editorModel";
import { buildEditorStateForNotebookModel } from "../src/notebook/modelSections";
import {
  buildMatrixEntryTimeSeries,
  collectMatrixColumnGraphSeries,
  collectMatrixRowGraphSeries,
  listAddableMatrixGraphSeries,
  resolveMatrixGraphChartSeries
} from "../src/notebook/matrixSliceGraph";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import type { MatrixCell, RunCell } from "../src/notebook/types";

describe("matrixSliceGraph", () => {
  const document = NOTEBOOK_TEMPLATES.sim.document;
  const baselineRunCell = document.cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.mode === "baseline"
  );
  const transactionFlowMatrix = document.cells.find(
    (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === "transaction-flow"
  );

  if (!baselineRunCell || !transactionFlowMatrix) {
    throw new Error("Expected SIM baseline run and transaction-flow matrix.");
  }

  const baselineEditor = buildEditorStateForNotebookModel(document, baselineRunCell);
  if (!baselineEditor) {
    throw new Error("Expected SIM baseline editor state.");
  }

  const baselineResult = runBaseline(
    buildRuntimeConfig(baselineEditor).model,
    buildRuntimeConfig(baselineEditor).options
  );

  it("graphs signed row entries from the transaction-flow matrix", () => {
    const consumptionRowIndex = transactionFlowMatrix.rows.findIndex(
      (row) => row.label.trim() === "Consumption"
    );
    expect(consumptionRowIndex).toBeGreaterThanOrEqual(0);

    const series = collectMatrixRowGraphSeries(
      transactionFlowMatrix,
      consumptionRowIndex,
      baselineResult
    );
    const labels = series.map((entry) => entry.label);

    expect(labels).toContain("-Cd");
    expect(labels).toContain("+Cs");

    const negativeCd = series.find((entry) => entry.label === "-Cd");
    expect(negativeCd).toBeDefined();
    if (!negativeCd) {
      throw new Error("Expected -Cd series.");
    }

    expect(negativeCd.values[10]).toBeCloseTo(-baselineResult.series.Cd[10]!, 8);
    expect(negativeCd.crossLabel).toBe("Households");
  });

  it("graphs signed column entries from the transaction-flow matrix", () => {
    const householdsColumnIndex = transactionFlowMatrix.columns.findIndex(
      (column) => column.trim() === "Households"
    );
    expect(householdsColumnIndex).toBeGreaterThanOrEqual(0);

    const series = collectMatrixColumnGraphSeries(
      transactionFlowMatrix,
      householdsColumnIndex,
      baselineResult
    );
    const labels = series.map((entry) => entry.label);

    expect(labels).toContain("-Cd");
    expect(labels.some((label) => label.includes("d(Hh)") || label.includes("dHh"))).toBe(true);

    const consumptionEntry = series.find((entry) => entry.crossLabel === "Consumption");
    expect(consumptionEntry?.label).toBe("-Cd");
  });

  it("maps legend names for expression and cross-label modes", () => {
    const series = [
      {
        crossLabel: "Households",
        label: "-Cd",
        source: "-Cd",
        values: [1, 2, 3]
      },
      {
        crossLabel: "Production",
        label: "+Cs",
        source: "+Cs",
        values: [4, 5, 6]
      }
    ];

    expect(resolveMatrixGraphChartSeries(series, "expression").map((entry) => entry.name)).toEqual([
      "-Cd",
      "+Cs"
    ]);
    expect(resolveMatrixGraphChartSeries(series, "cross").map((entry) => entry.name)).toEqual([
      "Households",
      "Production"
    ]);
    expect(resolveMatrixGraphChartSeries(series, "expression")[0]?.highlightKey).toBe("-Cd");
    expect(resolveMatrixGraphChartSeries(series, "cross")[0]?.legendTooltip).toBe("-Cd");
  });

  it("keeps opposite-signed entries as separate series", () => {
    const negativeSeries = buildMatrixEntryTimeSeries("-Cd", baselineResult);
    const positiveSeries = buildMatrixEntryTimeSeries("+Cs", baselineResult);

    expect(negativeSeries[20]).toBeLessThan(0);
    expect(positiveSeries[20]).toBeGreaterThan(0);
  });

  it("uses matrix row labels for cross-label mode, not band prefixes", () => {
    const householdsColumnIndex = transactionFlowMatrix.columns.findIndex(
      (column) => column.trim() === "Households"
    );
    const series = collectMatrixColumnGraphSeries(
      transactionFlowMatrix,
      householdsColumnIndex,
      baselineResult
    );
    const moneyChange = series.find((entry) => entry.label.includes("d(Hh)"));
    expect(moneyChange?.crossLabel).toBe("Change in money stock");
  });

  it("skips empty cells and sum row/column", () => {
    const sumRowIndex = transactionFlowMatrix.rows.findIndex(
      (row) => row.label.trim().toLowerCase() === "sum"
    );
    expect(collectMatrixRowGraphSeries(transactionFlowMatrix, sumRowIndex, baselineResult)).toEqual([]);
  });

  it("lists slice entries that are not already on the chart", () => {
    const consumptionRowIndex = transactionFlowMatrix.rows.findIndex(
      (row) => row.label.trim() === "Consumption"
    );
    const sliceSeries = collectMatrixRowGraphSeries(
      transactionFlowMatrix,
      consumptionRowIndex,
      baselineResult
    );
    const [firstEntry, ...remainingEntries] = sliceSeries;
    expect(firstEntry).toBeDefined();
    expect(remainingEntries.length).toBeGreaterThan(0);

    const addable = listAddableMatrixGraphSeries(firstEntry ? [firstEntry] : [], sliceSeries);
    expect(addable.map((entry) => entry.source)).toEqual(
      remainingEntries.map((entry) => entry.source)
    );
  });
});
