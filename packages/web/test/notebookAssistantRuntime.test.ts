// cspell:ignore sfcr
import { describe, expect, it } from "vitest";

import {
  buildNotebookAssistantContext,
  buildNotebookAssistantLocalToolResultAnswer,
  buildNotebookAssistantToolResultContext,
  rearmNotebookAssistantMessagePatchAfterUndo,
  type NotebookAssistantMessage
} from "../src/notebook/notebookAssistantRuntime";
import { createNotebookFromTemplate } from "../src/notebook/templates";

describe("notebook assistant runtime", () => {
  it("includes compact edit tool syntax in edit assistant context", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 0,
      selectedPeriodIndex: 0,
      uiMessage: null
    });

    expect(context).toContain("Tool syntax:");
    expect(context).toContain("createUpdateParameterPatch { modelId, variable, value }");
    expect(context).toContain("createAddExternalPatch { modelId, name, kind, value");
    expect(context).toContain("createUpdateChartVariablesPatch { chartId, variables }");
    expect(context).toContain("do not use createUpdateChartPatch");
    expect(context).toContain("getSeriesWindow { runId, variable, start, end }");
    expect(context).not.toContain("validateNotebookPatch: { patch: NotebookPatch }");
    expect(context).toContain("Equation syntax:");
    expect(context).toContain("min(a, b) and max(a, b) are supported directly for caps and floors.");
    expect(context).toContain("Use lag(K), not K[-1].");
  });

  it("keeps registry-backed read tool syntax in ask assistant context", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "ask",
      document,
      inspectorContext: null,
      resultCount: 0,
      selectedPeriodIndex: 0,
      uiMessage: null
    });

    expect(context).toContain("Notebook assistant tool syntax:");
    expect(context).toContain("getSeriesWindow: { runId: string, variable: string, start: integer, end: integer }");
    expect(context).not.toContain("createAddExternalPatch: { modelId: string, name: string");
  });

  it("uses compact notebook context for edit mode instead of full notebook JSON", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 0,
      selectedPeriodIndex: 0,
      uiMessage: null
    });
    const compactContext = extractCompactContext(context);

    expect(context).toContain("Compact notebook JSON:");
    expect(context).not.toContain("Notebook JSON:");
    expect(context.length).toBeLessThan(12000);
    expect(compactContext).toEqual(
      expect.objectContaining({
        fmt: "sfcr-assistant-compact",
        mode: "edit",
        nb: ["bmw-notebook", "BMW Browser Notebook"]
      })
    );
    expect(compactContext.m).toHaveLength(1);
    expect(compactContext.vw).toBeUndefined();
  });

  it("keeps equation and external descriptions in compact edit context", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: {
        selectedVariable: "Cd",
        currentValues: {
          Cd: 86.4,
          YD: 100
        }
      },
      resultCount: 1,
      selectedPeriodIndex: 20,
      selectedVariable: "Cd",
      uiMessage: null
    });
    const compactContext = extractCompactContext(context);
    const model = compactContext.m[0];

    expect(compactContext.sel).toEqual(["equations-newton", "Cd", 20]);
    expect(compactContext.cur).toEqual({ Cd: 86.4, YD: 100 });
    expect(model.eq ?? []).toContainEqual(
      expect.arrayContaining([
        "Cd",
        "alpha0 + alpha1 * YD + alpha2 * lag(Mh)",
        "behavioral",
        "Consumption goods demand by households"
      ])
    );
    expect((model.eq ?? []).find((row) => row[0] === "Cd")).toHaveLength(4);
    expect(model.ex ?? []).toContainEqual(
      expect.arrayContaining(["alpha1", "constant", "0.75", "Propensity to consume out of income"])
    );
    expect((model.ex ?? []).find((row) => row[0] === "alpha1")).toHaveLength(4);
    expect(model.ex ?? []).toContainEqual(
      expect.arrayContaining(["alpha2", "constant", "0.1", "Propensity to consume out of wealth"])
    );
    expect(compactContext.r.some((row: unknown[]) => row[0] === "baseline-newton")).toBe(true);
    expect(compactContext.tools).toContain("createUpdateParameterPatch");
  });

  it("uses parameter-only compact context for explicit parameter edits", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 3,
      selectedPeriodIndex: 0,
      uiMessage: null,
      userRequest: "set alpha1 to 0.65"
    });
    const compactContext = extractCompactContext(context);
    const model = compactContext.m[0];

    expect(compactContext.intent).toBe("parameter-update");
    expect(compactContext.sel).toEqual(["equations-newton", "alpha1", 0]);
    expect(model.eq).toBeUndefined();
    expect(model.iv).toBeUndefined();
    expect(model.ex).toEqual([["alpha1", "constant", "0.75", "Propensity to consume out of income"]]);
    expect(context.length).toBeLessThan(3600);
  });

  it("uses parameter-only compact context for multiple explicit parameter edits", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 3,
      selectedPeriodIndex: 0,
      uiMessage: null,
      userRequest: "set alpha1 to 0.6 and alpha2 to 0.12"
    });
    const compactContext = extractCompactContext(context);
    const model = compactContext.m[0];

    expect(compactContext.intent).toBe("parameter-update");
    expect(compactContext.sel).toEqual(["equations-newton", ["alpha1", "alpha2"], 0]);
    expect(model.eq).toBeUndefined();
    expect(model.iv).toBeUndefined();
    expect(model.ex).toEqual([
      ["alpha1", "constant", "0.75", "Propensity to consume out of income"],
      ["alpha2", "constant", "0.1", "Propensity to consume out of wealth"]
    ]);
    expect(context.length).toBeLessThan(3700);
  });

  it("uses parameter-only compact context for description-based parameter edits", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 3,
      selectedPeriodIndex: 0,
      uiMessage: null,
      userRequest: "set propensity to consume out of income to 0.6 and propensity to consume out of wealth to 0.12"
    });
    const compactContext = extractCompactContext(context);
    const model = compactContext.m[0];

    expect(compactContext.intent).toBe("parameter-update");
    expect(compactContext.sel).toEqual(["equations-newton", ["alpha1", "alpha2"], 0]);
    expect(model.eq).toBeUndefined();
    expect(model.iv).toBeUndefined();
    expect(model.ex).toEqual([
      ["alpha1", "constant", "0.75", "Propensity to consume out of income"],
      ["alpha2", "constant", "0.1", "Propensity to consume out of wealth"]
    ]);
    expect(context.length).toBeLessThan(3700);
  });

  it("uses parameter-only compact context for unique description token parameter edits", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 3,
      selectedPeriodIndex: 0,
      uiMessage: null,
      userRequest: "set depreciation to 0.2"
    });
    const compactContext = extractCompactContext(context);
    const model = compactContext.m[0];

    expect(compactContext.intent).toBe("parameter-update");
    expect(compactContext.sel).toEqual(["equations-newton", "delta", 0]);
    expect(model.eq).toBeUndefined();
    expect(model.iv).toBeUndefined();
    expect(model.ex).toEqual([["delta", "constant", "0.1", "Depreciation rate"]]);
    expect(context.length).toBeLessThan(3600);
  });

  it("uses a compact tool-result context for follow-up requests", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantToolResultContext({
      assistantMode: "edit",
      document,
      resultCount: 3,
      selectedPeriodIndex: 0,
      toolResults: [
        {
          ok: true,
          name: "createUpdateParameterPatch",
          data: {
            patch: {
              description: "Update parameter 'alpha1' to 0.6.",
              operations: [
                {
                  op: "replace",
                  path: "/cells/by-id/externals-equations-newton/externals/2/valueText",
                  value: "0.6"
                }
              ]
            },
            preview: {
              ok: true,
              issues: []
            }
          }
        }
      ],
      uiMessage: null
    });
    const compactContext = extractToolResultContext(context);

    expect(context).toContain("Tool result follow-up context JSON:");
    expect(context).not.toContain("Compact notebook context JSON:");
    expect(context).not.toContain("Notebook JSON:");
    expect(compactContext).toEqual(
      expect.objectContaining({
        fmt: "sfcr-assistant-tool-result-context",
        mode: "edit",
        nb: ["bmw-notebook", "BMW Browser Notebook"],
        resultCount: 3,
        toolResults: [["createUpdateParameterPatch", true, "Update parameter 'alpha1' to 0.6.", 1]]
      })
    );
  });

  it("builds a local answer for successful edit tool patch results", () => {
    const answer = buildNotebookAssistantLocalToolResultAnswer({
      proposedPatch: {
        description: "Update parameter 'alpha1' to 0.65.",
        operations: [
          {
            op: "replace",
            path: "/cells/by-id/externals-equations-newton/externals/2/valueText",
            value: "0.65"
          }
        ]
      },
      toolResults: [
        {
          ok: true,
          name: "createUpdateParameterPatch",
          data: {
            preview: {
              ok: true,
              summary: {
                addedCells: 0,
                changedCells: 1,
                operationCount: 1,
                removedCells: 0
              }
            }
          }
        }
      ]
    });

    expect(answer).toContain("Proposed change prepared: Update parameter 'alpha1' to 0.65.");
    expect(answer).toContain("The patch preview is valid, with no issues, changing 1 cell with 1 operation.");
    expect(answer).not.toContain("/cells/by-id/");
  });

  it("rearms an applied inline patch after undo", () => {
    const document = createNotebookFromTemplate("bmw");
    const messages: NotebookAssistantMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        text: "Patch ready.",
        patch: {
          isJsonVisible: false,
          patch: {
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
          },
          preview: {
            document,
            ok: true,
            issues: [],
            summary: {
              addedCells: 1,
              changedCells: 0,
              operationCount: 1,
              removedCells: 0
            }
          },
          status: "applied"
        }
      }
    ];

    const updatedMessages = rearmNotebookAssistantMessagePatchAfterUndo(messages, document, "assistant-1");

    expect(updatedMessages[0]?.patch).toEqual(
      expect.objectContaining({
        status: "ready",
        preview: expect.objectContaining({
          ok: true,
          summary: expect.objectContaining({
            addedCells: 1,
            operationCount: 1
          })
        })
      })
    );
  });
});

function extractCompactContext(context: string): { cur?: unknown; m: Array<{ eq?: unknown[][]; ex?: unknown[][]; iv?: unknown[][] }>; r: unknown[][]; sel?: unknown; tools?: string[] } & Record<string, unknown> {
  const marker = "Compact notebook JSON:\n";
  const markerIndex = context.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  return JSON.parse(context.slice(markerIndex + marker.length));
}

function extractToolResultContext(context: string): Record<string, unknown> {
  const marker = "Tool result follow-up context JSON:\n";
  const markerIndex = context.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  return JSON.parse(context.slice(markerIndex + marker.length));
}
