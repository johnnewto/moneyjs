import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { notebookFromJson, notebookFromYaml, notebookToCompactYaml, notebookToJson } from "../src/notebook/document";
import { validateNotebookModels } from "../src/notebook/notebookSourceWorkflow";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import { validateNotebookDocument } from "../src/notebook/validation";

const templateRoot = path.resolve(__dirname, "../src/notebook/templates");
const publicExamplesRoot = path.resolve(__dirname, "../public/notebook-examples");
const PILOT_TEMPLATE_IDS = ["bmw", "sim", "werner_quantity_theory_credit", "werner_qtc_explainer"] as const;
const PILOT_PUBLIC_EXAMPLE_IDS = ["bmw", "sim"] as const;

describe("shipped notebook templates", () => {
  for (const [templateId, template] of Object.entries(NOTEBOOK_TEMPLATES)) {
    it(`validates ${templateId} document schema and models`, () => {
      expect(validateNotebookDocument(template.document)).toEqual([]);
      expect(validateNotebookModels(template.document).issueCount).toBe(0);
    });
  }
});

describe("pilot YAML constraints", () => {
  for (const templateId of PILOT_TEMPLATE_IDS) {
    it(`${templateId} does not use the legacy top-level equations string envelope`, () => {
      const yamlSource = fs.readFileSync(path.join(templateRoot, `${templateId}.notebook.yaml`), "utf8");
      expect(yamlSource).not.toMatch(/^equations:\s*(?:\||>)/m);
    });
  }

  for (const exampleId of PILOT_PUBLIC_EXAMPLE_IDS) {
    it(`keeps public ${exampleId} example JSON in sync with generated pilot JSON`, () => {
      const generatedJson = fs.readFileSync(
        path.join(templateRoot, "generated", `${exampleId}.notebook.json`),
        "utf8"
      );
      const publicJson = fs.readFileSync(
        path.join(publicExamplesRoot, `${exampleId}.example.notebook.json`),
        "utf8"
      );
      expect(publicJson).toBe(generatedJson);
    });
  }
});

describe("canonical YAML notebook templates", () => {
  for (const templateId of PILOT_TEMPLATE_IDS) {
    it(`compiles ${templateId} YAML to schema-valid generated JSON`, () => {
      const yamlSource = fs.readFileSync(path.join(templateRoot, `${templateId}.notebook.yaml`), "utf8");
      const generatedJsonSource = fs.readFileSync(
        path.join(templateRoot, "generated", `${templateId}.notebook.json`),
        "utf8"
      );

      const compiledDocument = notebookFromYaml(yamlSource);
      const generatedDocument = notebookFromJson(generatedJsonSource);

      expect(validateNotebookDocument(compiledDocument)).toEqual([]);
      expect(validateNotebookModels(compiledDocument).issueCount).toBe(0);
      expect(notebookToJson(compiledDocument)).toBe(notebookToJson(generatedDocument));
    });
  }

  it("decompiles BMW runtime JSON to stable compact YAML with generated IDs", () => {
    const generatedJsonSource = fs.readFileSync(path.join(templateRoot, "generated", "bmw.notebook.json"), "utf8");
    const generatedDocument = notebookFromJson(generatedJsonSource);

    const compactYaml = notebookToCompactYaml(generatedDocument);
    const compactDocument = notebookFromYaml(compactYaml);
    const formattedAgain = notebookToCompactYaml(compactDocument);
    const reformattedDocument = notebookFromYaml(formattedAgain);

    expect(compactYaml).toContain("modelId: bmw");
    expect(compactYaml).toContain("  - equations:");
    expect(compactYaml).toContain("      rows:");
    expect(compactYaml).toContain('        - [Ls, lag(Ls) + d(Ld) * dt, "Supply of bank loans", $, stock, accumulation]');
    expect(compactYaml).toContain('        - [alpha0, 20, "Exogenous component in consumption", $/year, aux]');
    expect(compactYaml).toContain("      rows: []");
    expect(compactYaml).not.toContain("      source: |");
    expect(compactYaml).not.toContain("      values:");
    expect(compactYaml).toContain("  - matrix:");
    expect(compactYaml).toContain("      columns: [Households, Firms_current, Firms_capital, Banks_current, Banks_capital, Sum]");
    expect(compactYaml).toContain(
      'columnBadges: [asset, equity, asset, asset, liability, equity, asset, liability, liability, equity, ""]'
    );
    expect(compactYaml).toContain("        - [Consumption, Consumption, -Cs, +Cd,");
    expect(compactYaml).toContain("  - sequence:");
    expect(compactYaml).toContain("  - markdown:");
    expect(compactYaml).not.toContain("    type: sequence");
    expect(compactYaml).not.toContain("\nbalance:");
    expect(compactYaml).not.toContain("equations-newton");
    expect(validateNotebookDocument(compactDocument)).toEqual([]);
    expect(validateNotebookModels(compactDocument).issueCount).toBe(0);
    expect(stripRuntimeIds(compactDocument)).toEqual(stripRuntimeIds(generatedDocument));
    expect(notebookToJson(reformattedDocument)).toBe(notebookToJson(compactDocument));
  });

  it("can preserve BMW runtime IDs for exact compact YAML parity", () => {
    const generatedJsonSource = fs.readFileSync(path.join(templateRoot, "generated", "bmw.notebook.json"), "utf8");
    const generatedDocument = notebookFromJson(generatedJsonSource);

    const compactYaml = notebookToCompactYaml(generatedDocument, { preserveIds: true });
    const compactDocument = notebookFromYaml(compactYaml);

    expect(compactYaml).toContain("equations-newton");
    expect(compactYaml).toContain("  - equations:");
    expect(compactYaml).toContain("  - matrix:");
    expect(compactYaml).toContain("      columns: [Households, Firms_current, Firms_capital, Banks_current, Banks_capital, Sum]");
    expect(compactYaml).toContain("  - sequence:");
    expect(compactYaml).not.toContain("    type: sequence");
    expect(compactYaml).not.toContain("\nbalance:");
    expect(notebookToJson(compactDocument)).toBe(notebookToJson(generatedDocument));
  });

  it("parses wrapper-style cells as normal typed cells", () => {
    const wrapperYaml = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: wrapper-style",
      "title: Wrapper style",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - markdown:",
      "      id: note",
      "      title: Note",
      "      source: Wrapped markdown cell",
      "  - run:",
      "      id: run-1",
      "      title: Baseline",
      "      mode: baseline",
      "      periods: 5",
      "      resultKey: baseline",
      "      sourceModelId: model-1"
    ].join("\n");
    const typedYaml = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: wrapper-style",
      "title: Wrapper style",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - id: note",
      "    type: markdown",
      "    title: Note",
      "    source: Wrapped markdown cell",
      "  - id: run-1",
      "    type: run",
      "    title: Baseline",
      "    mode: baseline",
      "    periods: 5",
      "    resultKey: baseline",
      "    sourceModelId: model-1"
    ].join("\n");

    expect(notebookToJson(notebookFromYaml(wrapperYaml))).toBe(notebookToJson(notebookFromYaml(typedYaml)));
  });
});

function stripRuntimeIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripRuntimeIds);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !REFERENCE_ID_KEYS.has(key))
      .map(([key, entry]) => [key, stripRuntimeIds(entry)])
  );
}

const REFERENCE_ID_KEYS = new Set([
  "id",
  "modelId",
  "sourceModelId",
  "sourceModelCellId",
  "sourceRunCellId",
  "baselineRunCellId",
  "matrixCellId",
  "transactionMatrixCellId",
  "balanceMatrixCellId",
  "cellOrder"
]);
