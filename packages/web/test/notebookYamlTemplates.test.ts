import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { notebookFromJson, notebookFromYaml, notebookToCompactYaml, notebookToJson } from "../src/notebook/document";
import { validateNotebookModels } from "../src/notebook/notebookSourceWorkflow";
import {
  createNotebookFromTemplateWithFallback,
  getNotebookTemplateDocument,
  loadNotebookTemplate,
  NOTEBOOK_TEMPLATES
} from "../src/notebook/templates";
import type { NotebookDocument } from "../src/notebook/types";
import { validateNotebookDocument } from "../src/notebook/validation";

const templateRoot = path.resolve(__dirname, "../src/notebook/templates");
const publicExamplesRoot = path.resolve(__dirname, "../public/notebook-examples");
const PILOT_TEMPLATE_IDS = ["bmw", "sim"] as const;
const PILOT_PUBLIC_EXAMPLE_IDS = ["bmw", "sim"] as const;

describe("shipped notebook templates", () => {
  it("imports template metadata without parsing YAML eagerly", () => {
    expect(Object.keys(NOTEBOOK_TEMPLATES)).toContain("bmw");
    expect(NOTEBOOK_TEMPLATES.bmw.label).toBe("BMW");
  });

  for (const [templateId] of Object.entries(NOTEBOOK_TEMPLATES)) {
    it(`loads and validates ${templateId} document schema and models`, () => {
      const loaded = loadNotebookTemplate(templateId as keyof typeof NOTEBOOK_TEMPLATES);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) {
        throw new Error(`Expected ${templateId} to load.`);
      }

      const document = getNotebookTemplateDocument(templateId as keyof typeof NOTEBOOK_TEMPLATES);
      expect(loaded.document).toBe(document);
      expect(validateNotebookDocument(document)).toEqual([]);
      expect(validateNotebookModels(document).issueCount).toBe(0);
      expectRunPeriodsOnRunCells(document, `template:${templateId}`);
    });
  }

  it("returns the requested template when load succeeds", () => {
    const loaded = createNotebookFromTemplateWithFallback("sim");
    expect(loaded.requestedTemplateId).toBe("sim");
    expect(loaded.resolvedTemplateId).toBe("sim");
    expect(loaded.loadError).toBeNull();
    expect(loaded.document.metadata.template).toBe("sim");
  });
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

function expectRunPeriodsOnRunCells(document: NotebookDocument, name: string): void {
  const runCells = document.cells.filter((cell) => cell.type === "run");
  const solverCells = document.cells.filter((cell) => cell.type === "solver");

  expect(runCells.length, `${name} should include at least one run cell`).toBeGreaterThan(0);
  for (const cell of runCells) {
    expect(Number.isInteger(cell.periods), `${name}:${cell.title} should define integer periods`).toBe(true);
    expect(cell.periods, `${name}:${cell.title} should define positive periods`).toBeGreaterThanOrEqual(1);
  }
  for (const cell of solverCells) {
    expect(cell.options.periods, `${name}:${cell.title} should not define solver periods`).toBeUndefined();
  }
}
