import { describe, expect, it } from "vitest";

import {
  buildNotebookAssistantContext,
  rearmNotebookAssistantMessagePatchAfterUndo,
  type NotebookAssistantMessage
} from "../src/notebook/notebookAssistantRuntime";
import { createNotebookFromTemplate } from "../src/notebook/templates";

describe("notebook assistant runtime", () => {
  it("includes registry-backed tool syntax in assistant context", () => {
    const document = createNotebookFromTemplate("bmw");
    const context = buildNotebookAssistantContext({
      assistantMode: "edit",
      document,
      inspectorContext: null,
      resultCount: 0,
      selectedPeriodIndex: 0,
      uiMessage: null
    });

    expect(context).toContain("Notebook assistant tool syntax:");
    expect(context).toContain("getSeriesWindow: { runId: string, variable: string, start: integer, end: integer }");
    expect(context).toContain("createAddExternalPatch: { modelId: string, name: string");
    expect(context).toContain("Notebook equation expression syntax:");
    expect(context).toContain("min(a, b) and max(a, b) are supported directly for caps and floors.");
    expect(context).toContain("Use lag(K), not K[-1].");
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