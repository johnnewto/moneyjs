import { runBaseline } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";
import {
  dispatchNotebookAssistantTool,
  getCurrentValues,
  getDependencyGraph,
  getEquation,
  getMatrix,
  getNotebookSummary,
  getSeriesWindow,
  getVariableMetadata,
  listCharts,
  listRuns,
  listVariables,
  type NotebookAssistantSnapshot
} from "../src/notebook/notebookAssistantTools";
import { createNotebookFromTemplate } from "../src/notebook/templates";

const bmwResult = runBaseline(bmwBaselineModel, bmwBaselineOptions);

function buildSnapshot(): NotebookAssistantSnapshot {
  return {
    document: createNotebookFromTemplate("bmw"),
    runtime: {
      outputs: {
        "baseline-newton": {
          type: "result",
          result: bmwResult
        }
      },
      status: {
        "baseline-newton": "success"
      },
      errors: {}
    },
    selectedCellId: "baseline-chart",
    selectedPeriodIndex: 4,
    selectedVariable: "Y"
  };
}

describe("notebook assistant tools", () => {
  it("summarizes notebook state and available tools", () => {
    const summary = getNotebookSummary(buildSnapshot());

    expect(summary.title).toBe("BMW Browser Notebook");
    expect(summary.cellTypes.run).toBe(3);
    expect(summary.completedRunCount).toBe(1);
    expect(summary.selectedPeriodIndex).toBe(4);
    expect(summary.tools).toContain("getSeriesWindow");
  });

  it("lists runs and charts with runtime status", () => {
    const snapshot = buildSnapshot();

    expect(listRuns(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hasResult: true,
          id: "baseline-newton",
          mode: "baseline",
          status: "success",
          variableCount: expect.any(Number)
        })
      ])
    );
    expect(listCharts(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "baseline-chart",
          sourceRunCellId: "baseline-newton",
          variables: ["Y", "Cd", "Mh", "W"]
        })
      ])
    );
  });

  it("gets equations, values, and series windows", () => {
    const snapshot = buildSnapshot();

    expect(getEquation(snapshot, "Y")).toEqual(
      expect.objectContaining({
        variable: "Y",
        expression: "Cs + Is",
        description: "Income = GDP"
      })
    );

    const currentValues = getCurrentValues(snapshot, {
      runId: "baseline-newton",
      periodIndex: 4
    });
    expect(currentValues.values.Y).toEqual(expect.any(Number));
    expect(currentValues.values.Cd).toEqual(expect.any(Number));

    const window = getSeriesWindow(snapshot, {
      runId: "baseline-newton",
      variable: "Y",
      start: 0,
      end: 2
    });
    expect(window.values).toHaveLength(3);
    expect(window.periodCount).toBeGreaterThan(3);
  });

  it("gets matrices and variable metadata", () => {
    const snapshot = buildSnapshot();

    expect(getMatrix(snapshot, "transaction-flow")).toEqual(
      expect.objectContaining({
        id: "transaction-flow",
        title: "BMW transactions-flow matrix",
        rows: expect.arrayContaining([
          expect.objectContaining({ label: "Interest on deposits" })
        ])
      })
    );

    expect(getVariableMetadata(snapshot, "rm")).toEqual(
      expect.objectContaining({
        variable: "rm",
        description: "Rate of interest on bank deposits",
        variableType: expect.any(String)
      })
    );
  });

  it("lists variables and filters dependency graph around a variable", () => {
    const snapshot = buildSnapshot();

    expect(listVariables(snapshot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variable: "Y" }),
        expect.objectContaining({ variable: "rm" })
      ])
    );

    const graph = getDependencyGraph(snapshot, "Y");
    expect(graph.variable).toBe("Y");
    expect(graph.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(["Y", "Cs", "Is"]));
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("dispatches tools and returns typed errors", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "getSeriesWindow",
        args: {
          end: 1,
          runId: "baseline-newton",
          start: 0,
          variable: "Y"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        name: "getSeriesWindow"
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "getCurrentValues",
        args: { runId: "missing-run" }
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        name: "getCurrentValues",
        error: expect.stringContaining("Unknown run")
      })
    );
  });
});
