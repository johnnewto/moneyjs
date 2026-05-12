import { runBaseline } from "@sfcr/core";
import { describe, expect, it } from "vitest";

import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";
import {
  dispatchNotebookAssistantTool,
  dispatchNotebookAssistantToolRequests,
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
import { previewNotebookPatch } from "../src/notebook/notebookPatch";
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
    expect(summary.tools).toContain("validateNotebookPatch");
    expect(summary.tools).toContain("createAddChartPatch");
    expect(summary.tools).toContain("createAddEquationPatch");
    expect(summary.tools).toContain("createAddScenarioRunPatch");
    expect(summary.tools).toContain("createUpdateChartVariablesPatch");
    expect(summary.tools).toContain("createUpdateVariableUnitMetaPatch");
    expect(summary.tools).toContain("createUpdateNotebookTitlePatch");
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

  it("dispatches proposal-level notebook patch tools without applying changes", () => {
    const snapshot = buildSnapshot();
    const patch = {
      operations: [
        {
          op: "add",
          path: "/cells/-",
          value: {
            id: "chart-disposable-income",
            type: "chart",
            title: "Disposable income",
            sourceRunCellId: "baseline-newton",
            variables: ["YD", "Cd"]
          }
        }
      ]
    };

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "validateNotebookPatch",
        args: { patch }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          ok: true,
          summary: expect.objectContaining({ addedCells: 1 })
        })
      })
    );

    const preview = dispatchNotebookAssistantTool(snapshot, {
      name: "previewNotebookPatch",
      args: { patch }
    });
    expect(preview).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.not.objectContaining({ document: expect.anything() })
      })
    );
    expect(snapshot.document.cells.some((cell) => cell.id === "chart-disposable-income")).toBe(false);

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "explainNotebookPatch",
        args: { patch }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          explanation: expect.stringContaining("adds 1 cell")
        })
      })
    );
  });

  it("dispatches invalid notebook patch proposal errors as data", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "validateNotebookPatch",
        args: {
          patch: {
            operations: [
              {
                op: "replace",
                path: "/metadata/template",
                value: "custom"
              }
            ]
          }
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          ok: false,
          issues: expect.arrayContaining([
            expect.objectContaining({ message: expect.stringContaining("unsupported notebook path") })
          ])
        })
      })
    );
  });

  it("creates a validated add-chart patch from helper arguments", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddChartPatch",
        args: {
          runId: "baseline-newton",
          title: "Disposable income",
          variables: ["YD", "Cd"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/-",
                value: expect.objectContaining({
                  axisMode: "separate",
                  axisSnapTolarance: 0.1,
                  id: "disposable-income",
                  niceScale: true,
                  sharedRange: { includeZero: true },
                  sourceRunCellId: "baseline-newton",
                  type: "chart",
                  variables: ["YD", "Cd"]
                })
              })
            ]
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ addedCells: 1 })
          })
        })
      })
    );
  });

  it("creates unique chart ids when helper titles collide", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddChartPatch",
        args: {
          runId: "baseline-newton",
          title: "Baseline chart",
          variables: ["Y"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                value: expect.objectContaining({ id: "baseline-chart-2" })
              })
            ]
          })
        })
      })
    );
  });

  it("accepts source run aliases and defaults chart titles for add-chart helpers", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddChartPatch",
        args: {
          sourceRunCellId: "baseline-newton",
          variables: ["YD", "Cd"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                value: expect.objectContaining({
                  id: "chart-yd-cd",
                  sourceRunCellId: "baseline-newton",
                  title: "Chart: YD, Cd",
                  variables: ["YD", "Cd"]
                })
              })
            ]
          }),
          preview: expect.objectContaining({ ok: true })
        })
      })
    );
  });

  it("rejects add-chart helper requests for missing result series", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddChartPatch",
        args: {
          runId: "baseline-newton",
          title: "Missing variable",
          variables: ["not_a_variable"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("does not include series")
      })
    );
  });

  it("creates a validated chart variables update patch", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "baseline-chart",
          variables: ["Y", "YD", "Mh"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/baseline-chart/variables",
                value: ["Y", "YD", "Mh"]
              })
            ]
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ changedCells: 1 })
          })
        })
      })
    );
  });

  it("rejects chart variable update helper requests for unknown charts", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "missing-chart",
          variables: ["Y"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("Unknown chart")
      })
    );
  });

  it("rejects chart variable update helper requests for missing result series", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "baseline-chart",
          variables: ["not_a_variable"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("does not include series")
      })
    );
  });

  it("creates a validated parameter update patch", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateParameterPatch",
        args: {
          modelId: "equations-newton",
          value: 0.65,
          variable: "alpha1"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/externals-equations-newton/externals/2/valueText",
                value: "0.65"
              })
            ]
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ changedCells: 1 })
          })
        })
      })
    );
  });

  it("creates a validated variable unit metadata patch", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateVariableUnitMetaPatch",
        args: {
          displayUnit: "%",
          modelId: "equations-newton",
          stockFlow: "aux",
          variable: "alpha1"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/externals-equations-newton/externals/2/unitMeta",
                value: expect.objectContaining({
                  displayUnit: "%",
                  signature: {},
                  stockFlow: "aux"
                })
              })
            ]
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ changedCells: 1 })
          })
        })
      })
    );
  });

  it("creates equation helper patches and blocks dependent removals by default", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          name: "wage_share_pct",
          expression: "100 * WBd / Y",
          description: "Wage share as a percent of income",
          role: "definition",
          insertAfterVariable: "Y"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/by-id/equations-newton/equations/5",
                value: expect.objectContaining({
                  name: "wage_share_pct",
                  expression: "100 * WBd / Y",
                  role: "definition"
                })
              })
            ]
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ changedCells: 1 })
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          name: "loan_ceiling",
          expression: "lag(K)",
          insertAfterVariable: "not_a_variable"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                value: expect.objectContaining({
                  name: "loan_ceiling",
                  expression: "lag(K)"
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateEquationPatch",
        args: {
          modelId: "equations-newton",
          variable: "Cd",
          expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh) + 1",
          description: "Updated household consumption rule"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/equations-newton/equations/15",
                value: expect.objectContaining({
                  name: "Cd",
                  desc: "Updated household consumption rule",
                  expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh) + 1"
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createRemoveEquationPatch",
        args: {
          modelId: "equations-newton",
          variable: "Y"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("allowDependents")
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createRemoveEquationPatch",
        args: {
          modelId: "equations-newton",
          variable: "Y",
          allowDependents: true
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "remove",
                path: "/cells/by-id/equations-newton/equations/4"
              })
            ]
          })
        })
      })
    );
  });

  it("accepts full equation text and rhs aliases for equation helpers", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          equation: "wage_share_pct = 100 * WBd / Y",
          description: "Wage share as a percent of income"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                value: expect.objectContaining({
                  name: "wage_share_pct",
                  expression: "100 * WBd / Y"
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateEquationPatch",
        args: {
          modelId: "equations-newton",
          variable: "Cd",
          rhs: "alpha0 + alpha1 * YD + alpha2 * lag(Mh) + 1"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                value: expect.objectContaining({
                  name: "Cd",
                  expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh) + 1"
                })
              })
            ]
          })
        })
      })
    );
  });

  it("creates description and external helper patches", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateVariableDescriptionPatch",
        args: {
          modelId: "equations-newton",
          variable: "alpha1",
          description: "Household consumption propensity out of income"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                path: "/cells/by-id/externals-equations-newton/externals/2",
                value: expect.objectContaining({
                  name: "alpha1",
                  desc: "Household consumption propensity out of income"
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddExternalPatch",
        args: {
          modelId: "equations-newton",
          name: "alpha3",
          value: 0.05,
          description: "Additional wealth effect",
          insertAfterVariable: "alpha2"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/by-id/externals-equations-newton/externals/4",
                value: expect.objectContaining({
                  name: "alpha3",
                  valueText: "0.05"
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateExternalPatch",
        args: {
          modelId: "equations-newton",
          variable: "alpha1",
          value: 0.7,
          description: "Updated propensity to consume out of income"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/externals-equations-newton/externals/2",
                value: expect.objectContaining({
                  name: "alpha1",
                  valueText: "0.7",
                  desc: "Updated propensity to consume out of income"
                })
              })
            ]
          })
        })
      })
    );
  });

  it("creates initial value and scenario run helper patches", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddInitialValuePatch",
        args: {
          modelId: "equations-newton",
          variable: "K",
          value: 90
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/by-id/initial-values-equations-newton/initialValues/0",
                value: expect.objectContaining({
                  name: "K",
                  valueText: "90"
                })
              })
            ]
          })
        })
      })
    );

    const initialValuesCell = snapshot.document.cells.find(
      (cell) => cell.type === "initial-values" && cell.id === "initial-values-equations-newton"
    );
    if (!initialValuesCell || initialValuesCell.type !== "initial-values") {
      throw new Error("Missing initial values cell for test setup.");
    }
    initialValuesCell.initialValues.push({ id: "init-k", name: "K", valueText: "80" });

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateInitialValuePatch",
        args: {
          modelId: "equations-newton",
          variable: "K",
          value: 95
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/initial-values-equations-newton/initialValues/0/valueText",
                value: "95"
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddScenarioRunPatch",
        args: {
          sourceModelId: "equations-newton",
          title: "Scenario 3: wage share shock",
          periods: 20,
          shocks: [
            {
              rangeInclusive: [5, 20],
              variables: {
                alpha1: { kind: "constant", value: 0.7 }
              }
            }
          ]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/-",
                value: expect.objectContaining({
                  id: "scenario-3-wage-share-shock",
                  type: "run",
                  mode: "scenario",
                  baselineRunCellId: "baseline-newton",
                  sourceModelId: "equations-newton",
                  periods: 20
                })
              })
            ]
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ addedCells: 1 })
          })
        })
      })
    );
  });

  it("dispatches helper batches against an evolving draft notebook", () => {
    const snapshot = buildSnapshot();
    const batch = dispatchNotebookAssistantToolRequests(snapshot, [
      {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          name: "x_aux",
          expression: "Y + 1"
        }
      },
      {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          name: "x_aux2",
          expression: "x_aux + 1"
        }
      },
      {
        name: "createAddInitialValuePatch",
        args: {
          modelId: "equations-newton",
          variable: "K",
          value: 90
        }
      }
    ]);

    expect(batch.toolResults).toEqual([
      expect.objectContaining({ ok: true, name: "createAddEquationPatch" }),
      expect.objectContaining({ ok: true, name: "createAddEquationPatch" }),
      expect.objectContaining({ ok: true, name: "createAddInitialValuePatch" })
    ]);
    expect(batch.proposedPatch).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({ path: "/cells/by-id/equations-newton/equations/20" }),
          expect.objectContaining({ path: "/cells/by-id/equations-newton/equations/21" }),
          expect.objectContaining({ path: "/cells/by-id/initial-values-equations-newton/initialValues/0" })
        ]
      })
    );
    expect(batch.proposedPatch ? previewNotebookPatch(snapshot.document, batch.proposedPatch).ok : false).toBe(true);
  });

  it("creates run and table helper patches", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateRunOptionsPatch",
        args: {
          cellId: "scenario-1-run",
          periods: 40,
          baselineStartPeriod: 6,
          solverMethod: "BROYDEN",
          tolerance: 1e-8
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({
                path: "/cells/by-id/scenario-1-run/periods",
                value: 40
              }),
              expect.objectContaining({
                path: "/cells/by-id/scenario-1-run/baselineStartPeriod",
                value: 6
              }),
              expect.objectContaining({
                path: "/cells/by-id/solver-newton/options/solverMethod",
                value: "BROYDEN"
              }),
              expect.objectContaining({
                path: "/cells/by-id/solver-newton/options/toleranceText",
                value: "1e-8"
              })
            ])
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ changedCells: 2 })
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddTablePatch",
        args: {
          runId: "baseline-newton",
          title: "Disposable income table",
          variables: ["YD", "Cd"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/-",
                value: expect.objectContaining({
                  id: "disposable-income-table",
                  type: "table",
                  sourceRunCellId: "baseline-newton",
                  variables: ["YD", "Cd"]
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateTableVariablesPatch",
        args: {
          tableId: "baseline-table",
          variables: ["YD", "Cd", "Mh"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/baseline-table/variables",
                value: ["YD", "Cd", "Mh"]
              })
            ]
          })
        })
      })
    );
  });

  it("creates matrix helper patches", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddMatrixRowPatch",
        args: {
          matrixId: "transaction-flow",
          label: "Memo row",
          band: "Memo",
          insertAfterLabel: "Interest on deposits",
          values: ["memo", "", "", "", ""]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/by-id/transaction-flow/rows/6",
                value: expect.objectContaining({
                  label: "Memo row",
                  band: "Memo",
                  values: ["memo", "", "", "", ""]
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateMatrixRowPatch",
        args: {
          matrixId: "transaction-flow",
          label: "Interest on deposits",
          newLabel: "Deposit interest",
          band: "Deposits",
          values: ["+rm[-1] * Mh[-1]", "", "", "-rm[-1] * Ms[-1]", "memo"]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/cells/by-id/transaction-flow/rows/5",
                value: expect.objectContaining({
                  label: "Deposit interest",
                  values: ["+rm[-1] * Mh[-1]", "", "", "-rm[-1] * Ms[-1]", "memo"]
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createRemoveMatrixRowPatch",
        args: {
          matrixId: "transaction-flow",
          label: "Interest on deposits"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "remove",
                path: "/cells/by-id/transaction-flow/rows/5"
              })
            ]
          })
        })
      })
    );
  });

  it("creates markdown helper patches and reports ambiguous title matches", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createAddMarkdownCellPatch",
        args: {
          title: "Implementation note",
          source: "Remember to review scenario charts.",
          insertAfterCellId: "intro"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "add",
                path: "/cells/1",
                value: expect.objectContaining({
                  id: "implementation-note",
                  type: "markdown",
                  title: "Implementation note"
                })
              })
            ]
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateMarkdownCellPatch",
        args: {
          cellId: "intro",
          title: "Updated overview",
          source: "Updated notebook overview."
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({ path: "/cells/by-id/intro/title", value: "Updated overview" }),
              expect.objectContaining({ path: "/cells/by-id/intro/source", value: "Updated notebook overview." })
            ])
          })
        })
      })
    );

    snapshot.document.cells.push({
      id: "duplicate-scenario-note",
      type: "markdown",
      title: "Scenario 1",
      source: "Duplicate title for ambiguity coverage."
    });

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateMarkdownCellPatch",
        args: {
          cellTitle: "Scenario 1",
          source: "Ambiguous update"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("Ambiguous markdown cell")
      })
    );
  });

  it("creates chart options and notebook title helper patches", () => {
    const snapshot = buildSnapshot();

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateChartOptionsPatch",
        args: {
          chartId: "baseline-chart",
          axisMode: "shared",
          niceScale: false,
          yAxisTickCount: 6,
          timeRangeInclusive: [0, 10]
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: expect.arrayContaining([
              expect.objectContaining({ path: "/cells/by-id/baseline-chart/axisMode", value: "shared" }),
              expect.objectContaining({ path: "/cells/by-id/baseline-chart/niceScale", value: false }),
              expect.objectContaining({ path: "/cells/by-id/baseline-chart/yAxisTickCount", value: 6 }),
              expect.objectContaining({ path: "/cells/by-id/baseline-chart/timeRangeInclusive", value: [0, 10] })
            ])
          }),
          preview: expect.objectContaining({
            ok: true,
            summary: expect.objectContaining({ changedCells: 1 })
          })
        })
      })
    );

    expect(
      dispatchNotebookAssistantTool(snapshot, {
        name: "createUpdateNotebookTitlePatch",
        args: {
          title: "BMW Browser Notebook v2"
        }
      })
    ).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          patch: expect.objectContaining({
            operations: [
              expect.objectContaining({
                op: "replace",
                path: "/title",
                value: "BMW Browser Notebook v2"
              })
            ]
          })
        })
      })
    );
  });
});
