import { describe, expect, it } from "vitest";

import {
  analyzeNotebookSource,
  countNotebookDiagnosticsByDomain,
  createNotebookDiagnostic,
  validateNotebookDocument
} from "../src/notebook/document";
import { diagnoseBuildRuntime, validateEditorState, type EditorState } from "../src/editor-model";
import { buildNotebookSourceValidation } from "../src/notebook/notebookSourceWorkflow";
import { validateNotebookPatch } from "../src/notebook/notebookPatch";
import type { NotebookDocument } from "../src/notebook/types";

describe("notebook diagnostics", () => {
  it("creates and counts shared diagnostics", () => {
    const diagnostic = createNotebookDiagnostic(
      { message: "Missing title", path: "/title" },
      { domain: "schema" }
    );

    expect(diagnostic).toMatchObject({
      domain: "schema",
      message: "Missing title",
      path: "/title",
      severity: "error"
    });
    expect(countNotebookDiagnosticsByDomain([diagnostic])).toEqual({ schema: 1 });
  });

  it("classifies source parse and schema diagnostics", () => {
    const parseAnalysis = analyzeNotebookSource("{", "json");
    expect(parseAnalysis.parseDiagnostics[0]).toMatchObject({
      domain: "source",
      phase: "parse",
      severity: "error"
    });

    const schemaAnalysis = analyzeNotebookSource(
      JSON.stringify({ id: "example", metadata: { version: 1 }, cells: [] }),
      "json"
    );
    expect(schemaAnalysis.schemaDiagnostics[0]).toMatchObject({
      domain: "schema",
      phase: "schema",
      severity: "error"
    });
  });

  it("classifies semantic notebook and patch diagnostics", () => {
    const document: NotebookDocument = {
      id: "example",
      title: "Example",
      metadata: { version: 1 },
      cells: [
        { id: "intro", type: "markdown", title: "Intro", source: "Hi" },
        { id: "intro", type: "markdown", title: "Duplicate", source: "Again" }
      ]
    };

    expect(validateNotebookDocument(document)[0]).toMatchObject({
      domain: "notebook",
      severity: "error"
    });

    const patch = validateNotebookPatch(document, {
      operations: [{ op: "replace", path: "/metadata/template", value: "custom" }]
    });
    expect(patch.issues[0]).toMatchObject({
      domain: "patch",
      severity: "error"
    });
  });

  it("warns when accounting matrices omit explicit balance checks", () => {
    const document: NotebookDocument = {
      id: "example",
      title: "Example",
      metadata: { version: 1 },
      cells: [
        {
          id: "transaction-flow",
          type: "matrix",
          title: "Transactions-flow matrix",
          columns: ["Households", "Firms"],
          rows: [{ label: "Consumption", values: ["-C", "+C"] }]
        },
        {
          id: "balance-sheet",
          type: "matrix",
          title: "Balance sheet matrix",
          columns: ["Households", "Banks"],
          rows: [{ label: "Deposits", values: ["+M", "-M"] }]
        }
      ]
    };

    expect(validateNotebookDocument(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "notebook",
          message: "Matrix cell 'transaction-flow' should include a 'Sum' column so row balances are visible.",
          severity: "warning"
        }),
        expect.objectContaining({
          domain: "notebook",
          message: "Matrix cell 'transaction-flow' should include a 'Sum' row so column balances are visible.",
          severity: "warning"
        }),
        expect.objectContaining({
          domain: "notebook",
          message: "Matrix cell 'balance-sheet' should include a 'Sum' column so row balances are visible.",
          severity: "warning"
        })
      ])
    );
  });

  it("accepts accounting matrices with explicit balance checks", () => {
    const document: NotebookDocument = {
      id: "example",
      title: "Example",
      metadata: { version: 1 },
      cells: [
        {
          id: "transaction-flow",
          type: "matrix",
          title: "Transactions-flow matrix",
          columns: ["Households", "Firms", "Sum"],
          rows: [
            { label: "Consumption", values: ["-C", "+C", "0"] },
            { label: "Sum", values: ["0", "0", "0"] }
          ]
        },
        {
          id: "balance-sheet",
          type: "matrix",
          title: "Balance sheet matrix",
          columns: ["Households", "Banks", "Sum"],
          rows: [{ label: "Deposits", values: ["+M", "-M", "0"] }]
        }
      ]
    };

    expect(validateNotebookDocument(document)).toEqual([]);
  });

  it("allows apply when notebook checks only report unit warnings", () => {
    const document: NotebookDocument = {
      id: "unit-warning",
      title: "Unit warning",
      metadata: { version: 1 },
      cells: [
        {
          id: "eqs",
          type: "equations",
          title: "Equations",
          modelId: "m1",
          equations: [
            {
              id: "eq-y",
              name: "Y",
              expression: "K + C",
              unitMeta: { stockFlow: "flow", signature: { money: 1, time: -1 } }
            },
            {
              id: "eq-k",
              name: "K",
              expression: "1",
              unitMeta: { stockFlow: "stock", signature: { money: 1 } }
            },
            {
              id: "eq-c",
              name: "C",
              expression: "1",
              unitMeta: { stockFlow: "stock", signature: { money: 1 } }
            }
          ]
        },
        {
          id: "ext",
          type: "externals",
          title: "Externals",
          modelId: "m1",
          externals: []
        },
        {
          id: "init",
          type: "initial-values",
          title: "Initial values",
          modelId: "m1",
          initialValues: [
            { id: "init-k", name: "K", valueText: "1" },
            { id: "init-c", name: "C", valueText: "1" }
          ]
        },
        {
          id: "solver",
          type: "solver",
          title: "Solver",
          modelId: "m1",
          options: {
            periods: 40,
            solverMethod: "GAUSS_SEIDEL",
            toleranceText: "1e-7",
            maxIterations: 200,
            defaultInitialValueText: "0",
            hiddenLeftVariable: "",
            hiddenRightVariable: "",
            hiddenToleranceText: "1e-7",
            relativeHiddenTolerance: false
          }
        }
      ]
    };

    const validation = buildNotebookSourceValidation(JSON.stringify(document), "json");

    expect(validation.canApply).toBe(true);
    expect(validation.modelWarningCount).toBeGreaterThan(0);
    expect(validation.modelIssueCount).toBe(0);
    expect(
      validation.issues.some(
        (issue) => issue.includes("Cannot combine") || issue.includes("but its RHS infers")
      )
    ).toBe(true);
  });

  it("classifies model and runtime editor diagnostics", () => {
    const editor = buildInvalidEditor();

    expect(validateEditorState(editor)[0]).toMatchObject({
      domain: "model",
      severity: "error"
    });
    expect(diagnoseBuildRuntime(editor).issues[0]).toMatchObject({
      domain: "runtime",
      severity: "error"
    });
  });
});

function buildInvalidEditor(): EditorState {
  return {
    equations: [
      { id: "eq-1", name: "Y", expression: "G +" }
    ],
    externals: [
      { id: "ext-1", name: "G", kind: "constant", valueText: "oops" }
    ],
    initialValues: [],
    options: {
      periods: 40,
      solverMethod: "gauss-seidel",
      toleranceText: "1e-7",
      maxIterations: 200,
      defaultInitialValueText: "0",
      hiddenLeftVariable: "",
      hiddenRightVariable: "",
      hiddenToleranceText: "1e-7",
      relativeHiddenTolerance: false
    },
    scenario: { shocks: [] }
  };
}
