import { describe, expect, it } from "vitest";

import {
  buildNotebookAssistantToolFollowupQuestion,
  evaluateNotebookAssistantDirectPatchPolicy,
  extractTextAddChartToolRequest,
  extractNotebookAssistantToolRequests,
  extractNotebookPatchProposal,
  extractTextChartVariablesToolRequest,
  filterNotebookAssistantToolRequestsForMode,
  getPatchFromNotebookAssistantToolResults,
  summarizeNotebookAssistantToolResults
} from "../src/notebook/notebookAssistantFlow";
import {
  getNotebookAssistantToolSyntax,
  summarizeNotebookEquationExpressionSyntax,
  summarizeNotebookAssistantToolSyntax,
  type NotebookAssistantToolRequest,
  type NotebookAssistantToolResult
} from "../src/notebook/notebookAssistantTools";
import type { NotebookPatch } from "../src/notebook/notebookPatch";
import { createNotebookFromTemplate } from "../src/notebook/templates";

function bmwDocument() {
  return createNotebookFromTemplate("bmw");
}

describe("notebook assistant flow", () => {
  it("summarizes assistant tool syntax from the registry", () => {
    expect(summarizeNotebookAssistantToolSyntax("ask")).toContain(
      "getSeriesWindow: { runId: string, variable: string, start: integer, end: integer }"
    );
    expect(summarizeNotebookAssistantToolSyntax("ask")).not.toContain("createAddExternalPatch");
    expect(summarizeNotebookAssistantToolSyntax("edit")).toContain(
      "createAddExternalPatch: { modelId: string, name: string"
    );
    expect(summarizeNotebookAssistantToolSyntax("edit")).toContain(
      "role?: 'accumulation' | 'identity' | 'target' | 'definition' | 'behavioral'"
    );
    expect(summarizeNotebookAssistantToolSyntax("edit")).toContain(
      "unitMeta?: { stockFlow?: 'stock' | 'flow' | 'aux', signature?: { money?: number, items?: number, time?: number }, displayUnit?: string }"
    );
    expect(getNotebookAssistantToolSyntax("createAddExternalPatch")).toContain("Use name, not variable");
    expect(getNotebookAssistantToolSyntax("createAddEquationPatch")).toContain("Do not use role values like 'constraint'");
  });

  it("summarizes equation expression syntax from the registry", () => {
    const syntax = summarizeNotebookEquationExpressionSyntax();

    expect(syntax).toContain("lag(variable)");
    expect(syntax).toContain("min(a, b)");
    expect(syntax).toContain("max(a, b)");
    expect(syntax).toContain("Use pow(base, exponent), not ^");
    expect(syntax).toContain("if (condition) { expression } else { expression }");
  });

  it("extracts assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"getSeriesWindow","args":{"runId":"baseline-newton","variable":"Y","start":0,"end":4}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "getSeriesWindow",
        args: {
          end: 4,
          runId: "baseline-newton",
          start: 0,
          variable: "Y"
        }
      }
    ]);
  });

  it("normalizes chart cell ids in assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createUpdateChartVariablesPatch","args":{"chartCellId":"baseline-chart","variables":["Y","Cd","W"]}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartCellId: "baseline-chart",
          chartId: "baseline-chart",
          variables: ["Y", "Cd", "W"]
        }
      }
    ]);
  });

  it("normalizes series window index aliases and expands variable arrays", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"getSeriesWindow","args":{"runId":"baseline-newton","variables":["Ms","Mh"],"startIndex":0,"endIndex":5}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "getSeriesWindow",
        args: {
          runId: "baseline-newton",
          variables: ["Ms", "Mh"],
          startIndex: 0,
          endIndex: 5,
          start: 0,
          end: 5,
          variable: "Ms"
        }
      },
      {
        name: "getSeriesWindow",
        args: {
          runId: "baseline-newton",
          variables: ["Ms", "Mh"],
          startIndex: 0,
          endIndex: 5,
          start: 0,
          end: 5,
          variable: "Mh"
        }
      }
    ]);
  });

  it("normalizes stale equation helper arg names in assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createUpdateEquationPatch","args":{"modelId":"equations-newton","equationName":"Ld","expression":"lag(Ld) + Id * dt"}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createUpdateEquationPatch",
        args: {
          modelId: "equations-newton",
          equationName: "Ld",
          variable: "Ld",
          expression: "lag(Ld) + Id * dt"
        }
      }
    ]);
  });

  it("normalizes common equation role aliases in assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createAddEquationPatch","args":{"modelId":"equations-newton","equation":"Lmax = phi * lag(K)","role":"constraint"}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          equation: "Lmax = phi * lag(K)",
          role: "definition"
        }
      }
    ]);
  });

  it("normalizes parameter helper value aliases in assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createUpdateParameterPatch","args":{"modelId":"equations-newton","variable":"alpha0","from":20,"to":10}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createUpdateParameterPatch",
        args: {
          modelId: "equations-newton",
          from: 20,
          to: 10,
          value: 10,
          variable: "alpha0"
        }
      }
    ]);

    expect(
      extractNotebookAssistantToolRequests(
        '{"patchKind":"updateParameter","modelId":"equations-newton","variable":"alpha0","newValue":10}'
      ).requests
    ).toEqual([
      {
        name: "createUpdateParameterPatch",
        args: {
          modelId: "equations-newton",
          value: 10,
          variable: "alpha0"
        }
      }
    ]);
  });

  it("normalizes external helper name and value aliases in assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createAddExternalPatch","args":{"modelId":"equations-newton","variable":"theta","kind":"constant","valueText":"1","description":"Loan-to-collateral ratio"}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createAddExternalPatch",
        args: {
          modelId: "equations-newton",
          variable: "theta",
          name: "theta",
          kind: "constant",
          valueText: "1",
          value: "1",
          description: "Loan-to-collateral ratio"
        }
      }
    ]);

    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createUpdateExternalPatch","args":{"modelId":"equations-newton","variable":"theta","valueText":"1.2"}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createUpdateExternalPatch",
        args: {
          modelId: "equations-newton",
          variable: "theta",
          valueText: "1.2",
          value: "1.2"
        }
      }
    ]);
  });

  it("normalizes optional helper aliases that should not block recovery", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createAddExternalPatch","args":{"modelId":"equations-newton","variable":"theta","kind":"parameter","valueText":"1","unitMeta":{"stockFlow":"level","units":{"$":1}}}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createAddExternalPatch",
        args: {
          modelId: "equations-newton",
          variable: "theta",
          name: "theta",
          kind: "constant",
          valueText: "1",
          value: "1",
          unitMeta: {
            stockFlow: "stock",
            signature: { money: 1 }
          }
        }
      }
    ]);

    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createUpdateInitialValuePatch","args":{"modelId":"equations-newton","variable":"K","newValue":"80"}},{"name":"createUpdateChartOptionsPatch","args":{"chartCellId":"baseline-chart","axisMode":"same","periodRange":[0,5]}},{"name":"createUpdateRunOptionsPatch","args":{"cellId":"baseline-newton","solverMethod":"gauss seidel"}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createUpdateInitialValuePatch",
        args: {
          modelId: "equations-newton",
          variable: "K",
          newValue: "80",
          value: "80"
        }
      },
      {
        name: "createUpdateChartOptionsPatch",
        args: {
          chartCellId: "baseline-chart",
          chartId: "baseline-chart",
          axisMode: "shared",
          periodRange: [0, 5],
          timeRangeInclusive: [0, 5]
        }
      },
      {
        name: "createUpdateRunOptionsPatch",
        args: {
          cellId: "baseline-newton",
          runId: "baseline-newton",
          solverMethod: "GAUSS_SEIDEL"
        }
      }
    ]);
  });

  it("drops invalid optional metadata from assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createAddEquationPatch","args":{"modelId":"equations-newton","equation":"Lmax = phi * lag(K)","role":"constraint-like","description":{"text":"Loan ceiling"},"unitMeta":"money stock"}},{"name":"createAddExternalPatch","args":{"modelId":"equations-newton","name":"phi","kind":"parameter","value":1,"unitMeta":{"stockFlow":"mystery","units":{"bananas":1}}}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createAddEquationPatch",
        args: {
          modelId: "equations-newton",
          equation: "Lmax = phi * lag(K)"
        }
      },
      {
        name: "createAddExternalPatch",
        args: {
          modelId: "equations-newton",
          name: "phi",
          kind: "constant",
          value: 1
        }
      }
    ]);
  });

  it("normalizes run option helper id aliases in assistant tool request envelopes", () => {
    expect(
      extractNotebookAssistantToolRequests(
        '```json\n{"notebookAssistantToolRequests":[{"name":"createUpdateRunOptionsPatch","args":{"cellId":"baseline-newton","periods":100}}]}\n```'
      ).requests
    ).toEqual([
      {
        name: "createUpdateRunOptionsPatch",
        args: {
          cellId: "baseline-newton",
          periods: 100,
          runId: "baseline-newton"
        }
      }
    ]);
  });

  it("reports malformed assistant tool request JSON", () => {
    expect(
      extractNotebookAssistantToolRequests('```json\n{"notebookAssistantToolRequests":[}\n```')
    ).toEqual({
      error: "Assistant requested notebook tools, but the request JSON could not be parsed.",
      requests: []
    });
  });

  it("filters patch helper requests out of Ask mode", () => {
    const requests: NotebookAssistantToolRequest[] = [
      { name: "getNotebookSummary" },
      { name: "createAddChartPatch", args: { runId: "baseline-newton", variables: ["Y"] } }
    ];

    expect(filterNotebookAssistantToolRequestsForMode("ask", requests)).toEqual({
      allowed: [{ name: "getNotebookSummary" }],
      blocked: [{ name: "createAddChartPatch", args: { runId: "baseline-newton", variables: ["Y"] } }]
    });
    expect(filterNotebookAssistantToolRequestsForMode("edit", requests)).toEqual({
      allowed: requests,
      blocked: []
    });
  });

  it("extracts semantic notebook patch proposals as helper requests", () => {
    expect(
      extractNotebookAssistantToolRequests(`Here is the helper-generated patch proposal:

{
  "notebookPatchProposal": {
    "description": "Add WBs to the baseline headline variables chart.",
    "patches": [
      {
        "kind": "chart-variables-update",
        "chartId": "baseline-chart",
        "variables": ["Y", "Cd", "Mh", "W", "WBs"]
      }
    ]
  }
}`).requests
    ).toEqual([
      {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "baseline-chart",
          variables: ["Y", "Cd", "Mh", "W", "WBs"]
        }
      }
    ]);

    expect(
      extractNotebookAssistantToolRequests(`{
  "patchKind": "updateChartVariables",
  "chartId": "baseline-chart",
  "variables": ["Y", "Cd", "Mh", "W", "WBd"]
}`).requests
    ).toEqual([
      {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "baseline-chart",
          variables: ["Y", "Cd", "Mh", "W", "WBd"]
        }
      }
    ]);

    expect(
      extractNotebookAssistantToolRequests(`{
  "patchKind": "updateChartVariables",
  "chartCellId": "baseline-chart",
  "variables": ["Y", "Cd", "W"]
}`).requests
    ).toEqual([
      {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "baseline-chart",
          variables: ["Y", "Cd", "W"]
        }
      }
    ]);
  });

  it("translates direct chart patches into helper requests", () => {
    const document = bmwDocument();

    expect(
      evaluateNotebookAssistantDirectPatchPolicy(document, {
        operations: [
          {
            op: "add",
            path: "/cells/-",
            value: {
              id: "chart-direct-disposable-income",
              sourceRunCellId: "baseline-newton",
              title: "Direct disposable income",
              type: "chart",
              variables: ["YD", "Cd"]
            }
          }
        ]
      })
    ).toEqual({
      ok: true,
      request: {
        name: "createAddChartPatch",
        args: {
          chartId: "chart-direct-disposable-income",
          runId: "baseline-newton",
          title: "Direct disposable income",
          variables: ["YD", "Cd"]
        }
      }
    });
  });

  it("keeps unsupported direct patches as inline patches", () => {
    const patch: NotebookPatch = {
      operations: [
        {
          op: "replace",
          path: "/title",
          value: "BMW Browser Notebook - edited"
        }
      ]
    };

    expect(evaluateNotebookAssistantDirectPatchPolicy(bmwDocument(), patch)).toEqual({
      ok: true,
      patch
    });
  });

  it("normalizes stale variable-list indexes in direct patch proposals", () => {
    const patch = extractNotebookPatchProposal({
      document: bmwDocument(),
      question: "Use the helper tools to update the existing baseline chart so it shows wages.",
      text: '```json\n{"operations":[{"op":"replace","path":"/cells/0/variables","value":["W"]}]}\n```'
    });

    expect(patch).toEqual({
      operations: [
        {
          op: "replace",
          path: "/cells/by-id/baseline-chart/variables",
          value: ["W"]
        }
      ]
    });
    expect(patch ? evaluateNotebookAssistantDirectPatchPolicy(bmwDocument(), patch) : null).toEqual({
      ok: true,
      request: {
        name: "createUpdateChartVariablesPatch",
        args: {
          chartId: "baseline-chart",
          variables: ["W"]
        }
      }
    });
  });

  it("extracts plain-text chart variable proposals into helper requests", () => {
    expect(
      extractTextChartVariablesToolRequest(
        bmwDocument(),
        'You can now review and apply this change. Update the "Baseline headline variables" chart variables to: ["Y", "Cd", "Mh", "W", "WBs"].'
      )
    ).toEqual({
      name: "createUpdateChartVariablesPatch",
      args: {
        chartId: "baseline-chart",
        variables: ["Y", "Cd", "Mh", "W", "WBs"]
      }
    });
  });

  it("extracts plain-text add-chart proposals into helper requests", () => {
    expect(
      extractTextAddChartToolRequest(
        bmwDocument(),
        'Add a chart for YD and Cd.\nAssuming you would like the chart for the baseline run, the following patch proposal will add the desired chart.'
      )
    ).toEqual({
      name: "createAddChartPatch",
      args: {
        runId: "baseline-newton",
        title: "Chart: YD, Cd",
        variables: ["YD", "Cd"]
      }
    });
  });

  it("pulls patch proposals from helper tool results", () => {
    const patch: NotebookPatch = {
      operations: [{ op: "replace", path: "/title", value: "Updated title" }]
    };
    const requests: NotebookAssistantToolRequest[] = [
      {
        name: "validateNotebookPatch",
        args: { patch }
      }
    ];
    const results: NotebookAssistantToolResult[] = [
      {
        ok: true,
        name: "validateNotebookPatch",
        data: { ok: true }
      }
    ];

    expect(getPatchFromNotebookAssistantToolResults(results, requests)).toBe(patch);
  });

  it("combines multiple helper patch proposals into one patch", () => {
    const results: NotebookAssistantToolResult[] = [
      {
        ok: true,
        name: "createUpdateEquationPatch",
        data: {
          patch: {
            description: "Update equation 'WBd'.",
            operations: [{ op: "replace", path: "/title", value: "First" }]
          }
        }
      },
      {
        ok: true,
        name: "createAddInitialValuePatch",
        data: {
          patch: {
            description: "Add initial value 'V'.",
            operations: [{ op: "replace", path: "/metadata/template", value: "custom" }]
          }
        }
      }
    ];

    expect(getPatchFromNotebookAssistantToolResults(results)).toEqual({
      description: "Update equation 'WBd'. Add initial value 'V'.",
      operations: [
        { op: "replace", path: "/title", value: "First" },
        { op: "replace", path: "/metadata/template", value: "custom" }
      ]
    });
  });

  it("summarizes tool results and builds follow-up questions", () => {
    const toolResults: NotebookAssistantToolResult[] = [
      { ok: true, name: "getNotebookSummary", data: { title: "BMW Browser Notebook" } },
      { ok: false, name: "missingTool", error: "Unknown notebook assistant tool: missingTool" }
    ];

    expect(summarizeNotebookAssistantToolResults(toolResults)).toBe(
      "Notebook tools: getNotebookSummary, missingTool. 1 failed: missingTool: Unknown notebook assistant tool: missingTool"
    );
    expect(
      buildNotebookAssistantToolFollowupQuestion({
        originalQuestion: "Use a missing notebook tool.",
        toolResults
      })
    ).toContain("Tool results JSON");
  });

  it("adds expected syntax to failed tool results in follow-up questions", () => {
    const followup = buildNotebookAssistantToolFollowupQuestion({
      originalQuestion: "Read a series window.",
      toolResults: [
        {
          ok: false,
          name: "getSeriesWindow",
          error: "Tool argument 'end' must be an integer."
        }
      ]
    });

    expect(followup).toContain("Expected syntax");
    expect(followup).toContain("getSeriesWindow: { runId: string, variable: string, start: integer, end: integer }");
    expect(followup).toContain("Use one variable per request");
  });

  it("omits raw patch paths from follow-up questions", () => {
    const toolResults: NotebookAssistantToolResult[] = [
      {
        ok: true,
        name: "createUpdateEquationPatch",
        data: {
          patch: {
            description: "Update equation 'WBd'.",
            operations: [
              {
                op: "replace",
                path: "/cells/by-id/equations-newton/equations/5",
                value: {
                  name: "WBd",
                  expression: "Y - AF"
                }
              }
            ]
          },
          preview: {
            ok: true,
            summary: {
              addedCells: 0,
              changedCells: 1,
              removedCells: 0
            }
          }
        }
      }
    ];

    const followup = buildNotebookAssistantToolFollowupQuestion({
      originalQuestion: "Update WBd.",
      toolResults
    });

    expect(followup).toContain("patchSummary");
    expect(followup).toContain("Update equation 'WBd'.");
    expect(followup).not.toContain("/cells/by-id/equations-newton/equations/5");
    expect(followup).not.toContain('"operations"');
  });
});
