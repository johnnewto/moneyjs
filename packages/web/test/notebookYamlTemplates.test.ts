import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { notebookFromJson, notebookFromYaml, notebookToCompactYaml, notebookToJson } from "../src/notebook/document";
import { validateNotebookModels } from "../src/notebook/notebookSourceWorkflow";
import { validateNotebookDocument } from "../src/notebook/validation";

const templateRoot = path.resolve(__dirname, "../src/notebook/templates");
const legacyJsonRoot = path.join(templateRoot, "legacy_json");
const PILOT_TEMPLATE_IDS = ["bmw", "sim"] as const;

describe("canonical YAML notebook templates", () => {
  for (const templateId of PILOT_TEMPLATE_IDS) {
    it(`compiles ${templateId} YAML to schema-valid generated JSON`, () => {
      const yamlSource = fs.readFileSync(path.join(templateRoot, `${templateId}.notebook.yaml`), "utf8");
      const generatedJsonSource = fs.readFileSync(
        path.join(templateRoot, "generated", `${templateId}.notebook.json`),
        "utf8"
      );
      const legacyJsonSource = fs.readFileSync(path.join(legacyJsonRoot, `${templateId}.notebook.json`), "utf8");

      const compiledDocument = notebookFromYaml(yamlSource);
      const generatedDocument = notebookFromJson(generatedJsonSource);
      const legacyDocument = notebookFromJson(legacyJsonSource);

      expect(validateNotebookDocument(compiledDocument)).toEqual([]);
      expect(validateNotebookModels(compiledDocument).issueCount).toBe(0);
      expect(notebookToJson(compiledDocument)).toBe(notebookToJson(generatedDocument));
      expect(notebookToJson(compiledDocument)).toBe(notebookToJson(legacyDocument));
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
    expect(compactYaml).toContain("equations: |-");
    expect(compactYaml).toContain("columns: [Households, Firms_current, Firms_capital, Banks_current, Banks_capital, Sum]");
    expect(compactYaml).toContain("- [Consumption, Consumption, -Cs, +Cd,");
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
    expect(compactYaml).toContain("columns: [Households, Firms_current, Firms_capital, Banks_current, Banks_capital, Sum]");
    expect(notebookToJson(compactDocument)).toBe(notebookToJson(generatedDocument));
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
