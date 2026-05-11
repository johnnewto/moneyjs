import { describe, expect, it } from "vitest";

import {
  analyzeNotebookSource,
  countNotebookDiagnosticsByDomain,
  createNotebookDiagnostic,
  validateNotebookDocument
} from "../src/notebook/document";
import { diagnoseBuildRuntime, validateEditorState, type EditorState } from "../src/editor-model";
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
