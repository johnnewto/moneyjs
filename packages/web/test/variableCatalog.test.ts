import { describe, expect, it } from "vitest";

import { editorStateFromModel, type EditorState } from "../src/lib/editorModel";
import { buildVariableCatalogRows, catalogRowGroupKey, listCatalogModelContexts } from "../src/lib/variableCatalog";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import { simBaselineModel, simBaselineOptions } from "../../core/src/fixtures/sim";
import type { NotebookDocument } from "../src/notebook/types";

function buildSimEditor(): EditorState {
  return editorStateFromModel(simBaselineModel, simBaselineOptions, null);
}

function buildNotebookDocument(editor: EditorState): NotebookDocument {
  return {
    id: "catalog-test",
    title: "Catalog test",
    metadata: { version: 1 },
    cells: [
      {
        id: "equations-sim",
        type: "equations",
        modelId: "sim",
        title: "SIM equations",
        equations: editor.equations
      },
      {
        id: "externals-sim",
        type: "externals",
        modelId: "sim",
        title: "SIM externals",
        externals: editor.externals
      },
      {
        id: "initial-values-sim",
        type: "initial-values",
        modelId: "sim",
        title: "SIM initial values",
        initialValues: editor.initialValues
      },
      {
        id: "solver-sim",
        type: "solver",
        modelId: "sim",
        title: "SIM solver",
        options: editor.options
      },
      {
        id: "run-sim",
        type: "run",
        title: "Baseline run",
        mode: "baseline",
        sourceModelId: "sim",
        resultKey: "baseline"
      }
    ]
  };
}

describe("variableCatalog", () => {
  it("lists model contexts from run-linked notebook models", () => {
    const document = buildNotebookDocument(buildSimEditor());
    expect(listCatalogModelContexts(document)).toEqual([
      expect.objectContaining({
        modelId: "sim",
        modelTitle: expect.any(String)
      })
    ]);
  });

  it("builds catalog rows with endogenous and exogenous classifications", () => {
    const document = buildNotebookDocument(buildSimEditor());
    const rows = buildVariableCatalogRows({ document });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.name === "Y" && row.endogenousExogenous === "endogenous")).toBe(true);
    expect(rows.some((row) => row.endogenousExogenous === "exogenous")).toBe(true);
    expect(rows).toEqual([...rows].sort((left, right) => left.name.localeCompare(right.name)));
  });

  it("uses run values when currentValuesByModel is provided", () => {
    const document = buildNotebookDocument(buildSimEditor());
    const rows = buildVariableCatalogRows({
      document,
      currentValuesByModel: new Map([
        [
          "sim",
          {
            Y: 123.45
          }
        ]
      ])
    });

    expect(rows.find((row) => row.name === "Y")).toEqual(
      expect.objectContaining({
        value: 123.45,
        valueSource: "run"
      })
    );
  });

  it("falls back to external constants when run values are unavailable", () => {
    const editor = buildSimEditor();
    const external = editor.externals.find((row) => row.kind === "constant");
    expect(external).toBeTruthy();

    const document = buildNotebookDocument(editor);
    const rows = buildVariableCatalogRows({ document });
    const externalRow = rows.find((row) => row.name === external!.name.trim());

    expect(externalRow).toEqual(
      expect.objectContaining({
        endogenousExogenous: "exogenous",
        valueSource: "external"
      })
    );
    expect(typeof externalRow?.value).toBe("number");
  });

  it("dedupes variables by name across repeated model contexts", () => {
    const document = buildNotebookDocument(buildSimEditor());
    document.cells.push({
      id: "run-sim-copy",
      type: "run",
      title: "Second baseline run",
      mode: "baseline",
      sourceModelId: "sim",
      resultKey: "baseline-copy"
    });

    const rows = buildVariableCatalogRows({ document });
  const uniqueNames = new Set(rows.map((row) => row.name));
    expect(uniqueNames.size).toBe(rows.length);
  });

  it("derives group keys for stock/flow and endogenous/exogenous views", () => {
    const document = buildNotebookDocument(buildSimEditor());
    const row = buildVariableCatalogRows({ document }).find((entry) => entry.name === "Y");
    expect(row).toBeTruthy();

    expect(catalogRowGroupKey(row!, "endogenousExogenous")).toBe("Endogenous");
    expect(catalogRowGroupKey(row!, "variableType")).toBeTruthy();
    expect(catalogRowGroupKey(row!, "unit")).toBeTruthy();
  });

  it("builds BMW catalog rows quickly enough for interactive tab open", () => {
    const started = performance.now();
    const rows = buildVariableCatalogRows({ document: NOTEBOOK_TEMPLATES.bmw.document });
    const elapsedMs = performance.now() - started;

    expect(rows.length).toBeGreaterThan(20);
    expect(elapsedMs).toBeLessThan(2500);
  });
});
