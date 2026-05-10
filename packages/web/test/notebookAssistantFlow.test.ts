import { describe, expect, it } from "vitest";

import {
  buildNotebookAssistantToolFollowupQuestion,
  evaluateNotebookAssistantDirectPatchPolicy,
  extractNotebookAssistantToolRequests,
  extractNotebookPatchProposal,
  extractTextChartVariablesToolRequest,
  filterNotebookAssistantToolRequestsForMode,
  getPatchFromNotebookAssistantToolResults,
  summarizeNotebookAssistantToolResults
} from "../src/notebook/notebookAssistantFlow";
import type { NotebookAssistantToolRequest, NotebookAssistantToolResult } from "../src/notebook/notebookAssistantTools";
import type { NotebookPatch } from "../src/notebook/notebookPatch";
import { createNotebookFromTemplate } from "../src/notebook/templates";

function bmwDocument() {
  return createNotebookFromTemplate("bmw");
}

describe("notebook assistant flow", () => {
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
      text: '```json\n{"operations":[{"op":"replace","path":"/cells/16/variables","value":["W"]}]}\n```'
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
});
