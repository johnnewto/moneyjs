import { describe, expect, it } from "vitest";

import {
  analyzeNotebookSource,
  detectNotebookSourceFormat,
  notebookFromMarkdown,
  notebookFromYaml,
  notebookToMarkdown,
  notebookToYaml,
  parseNotebookSource
} from "../src/notebook/document";

describe("analyzeNotebookSource", () => {
  it("detects and parses JSON, Markdown, and YAML notebook source", () => {
    const jsonSource = JSON.stringify({
      id: "example",
      title: "Example",
      metadata: { version: 1 },
      cells: [{ id: "intro", type: "markdown", title: "Intro", source: "Hi" }]
    });
    const markdownSource = [
      "# Example",
      "",
      "## Intro",
      "",
      "Hi"
    ].join("\n");
    const yamlSource = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: example",
      "title: Example",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - id: intro",
      "    type: markdown",
      "    title: Intro",
      "    source: Hi"
    ].join("\n");

    expect(detectNotebookSourceFormat(jsonSource)).toBe("json");
    expect(detectNotebookSourceFormat(markdownSource)).toBe("markdown");
    expect(detectNotebookSourceFormat(yamlSource)).toBe("yaml");
    expect(() => detectNotebookSourceFormat("title = 'Example'")).toThrow(/Expected JSON, Markdown, or YAML/);
    expect(parseNotebookSource(jsonSource).document.title).toBe("Example");
    expect(parseNotebookSource(markdownSource).document.cells[0]?.type).toBe("markdown");
    expect(parseNotebookSource(yamlSource).document.cells[0]?.type).toBe("markdown");
  });

  it("round-trips Markdown through the shared notebook source pipeline", () => {
    const document = parseNotebookSource(
      JSON.stringify({
        id: "example",
        title: "Example",
        metadata: { version: 1 },
        cells: [{ id: "intro", type: "markdown", title: "Intro", source: "Hi" }]
      }),
      "json"
    ).document;

    const markdown = notebookToMarkdown(document);
    const parsed = notebookFromMarkdown(markdown);

    expect(parsed.title).toBe("Example");
    expect(parsed.cells).toHaveLength(1);
    expect(parsed.cells[0]).toMatchObject({ type: "markdown", title: "Intro" });
  });

  it("round-trips YAML through the shared notebook source pipeline", () => {
    const document = parseNotebookSource(
      JSON.stringify({
        id: "example",
        title: "Example",
        metadata: { version: 1 },
        cells: [
          { id: "intro", type: "markdown", title: "Intro", source: "Hi" },
          {
            id: "equations",
            type: "equations",
            title: "Equations",
            modelId: "main",
            equations: [{ id: "eq-0-Y", name: "Y", expression: "G" }]
          }
        ]
      }),
      "json"
    ).document;

    const yaml = notebookToYaml(document);
    const parsed = notebookFromYaml(yaml);

    expect(yaml).toContain("format: sfcr-notebook-yaml");
    expect(parsed.title).toBe("Example");
    expect(parsed.cells).toHaveLength(2);
    expect(parsed.cells[1]).toMatchObject({ type: "equations", title: "Equations" });
  });

  it("requires the canonical YAML format header", () => {
    const source = [
      "id: example",
      "title: Example",
      "metadata:",
      "  version: 1",
      "cells: []"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "yaml");

    expect(analysis.document).toBeNull();
    expect(analysis.parseDiagnostics[0]?.message).toContain("format: sfcr-notebook-yaml");
  });

  it("compiles compact domain-first YAML into expanded notebook cells", () => {
    const source = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: bmw-notebook",
      "title: BMW Model YAML Source",
      "metadata:",
      "  version: 1",
      "  template: bmw",
      "  description: >",
      "    Closed economy BMW model showing interactions between households, firms, and banks.",
      "sectors: [Households, Firms, Banks, Sum]",
      "variables:",
      "  Y:",
      "    description: Income/output",
      "    unit: \"$/year\"",
      "    type: flow",
      "  C:",
      "    description: Consumption",
      "    unit: \"$/year\"",
      "    type: flow",
      "  V:",
      "    description: Household wealth",
      "    unit: \"$\"",
      "    type: stock",
      "equations: |",
      "  Y ~ C + G",
      "  C ~ alpha1 * Y + alpha2 * V[-1]",
      "  V ~ V[-1] + (Y - C)",
      "balance:",
      "  columns: [Households, Firms, Banks, Sum]",
      "  rows:",
      "    - [Deposits, Money deposits, +V, \"\", -V, 0]",
      "parameters:",
      "  alpha1: 0.6",
      "  alpha2: 0.4",
      "  G: 20",
      "initial-values:",
      "  Y: 100",
      "  V: 80",
      "solver:",
      "  method: newton",
      "  periods: 50",
      "  tolerance: 1e-6",
      "charts:",
      "  - id: income-consumption",
      "    title: Income vs Consumption",
      "    variables: [Y, C]",
      "tables:",
      "  - id: summary",
      "    variables: [Y, C, V]",
      "notes: |",
      "  This YAML format is designed for human readability."
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "yaml");

    expect(analysis.parseDiagnostics).toEqual([]);
    expect(analysis.schemaDiagnostics).toEqual([]);
    expect(analysis.document?.cells.map((cell) => cell.type)).toEqual([
      "markdown",
      "matrix",
      "equations",
      "externals",
      "initial-values",
      "solver",
      "run",
      "chart",
      "table",
      "markdown"
    ]);
    const equationsCell = analysis.document?.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type).toBe("equations");
    if (!equationsCell || equationsCell.type !== "equations") {
      throw new Error("Expected equations cell.");
    }
    expect(equationsCell.equations[1]).toMatchObject({
      name: "C",
      expression: "alpha1 * Y + alpha2 * V[-1]",
      unitMeta: { signature: { money: 1, time: -1 }, stockFlow: "flow" }
    });
  });

  it("rejects YAML anchors and aliases", () => {
    const source = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: example",
      "title: Example",
      "metadata: &metadata",
      "  version: 1",
      "cells: []"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "yaml");

    expect(analysis.document).toBeNull();
    expect(analysis.parseDiagnostics[0]?.message).toContain("anchors");
  });

  it("anchors misspelled required YAML properties to the typo instead of the root object", () => {
    const source = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: example",
      "titleq: Example",
      "metadata:",
      "  version: 1",
      "cells: []"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "yaml");

    expect(analysis.document).toBeNull();
    expect(analysis.schemaDiagnostics.length).toBeGreaterThan(0);
    expect(analysis.schemaDiagnostics[0]?.line).toBe(4);
  });

  it("anchors misspelled required JSON properties to the typo instead of the root object", () => {
    const source = [
      "{",
      '  "id": "opensimplest-levy-notebook",',
      '  "titleq": "OPENSIMPLEST Levy WP 1105 Aligned Model",',
      '  "metadata": { "version": 1, "template": "opensimplest-levy" },',
      '  "cells": []',
      "}"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "json");

    expect(analysis.document).toBeNull();
    expect(analysis.schemaDiagnostics.length).toBeGreaterThan(0);
    expect(analysis.schemaDiagnostics[0]?.offset).toBeGreaterThan(1);
    expect(analysis.schemaDiagnostics[0]?.line).toBe(3);
  });

  it("keeps cell schema diagnostics local to the declared cell type", () => {
    const source = [
      "{",
      '  "id": "example",',
      '  "title": "Example",',
      '  "metadata": { "version": 1 },',
      '  "cells": [',
      '    { "id": "intro", "type": "markdown", "title": "Intro", "source": "Hi" },',
      '    { "ids": "matrix", "type": "matrix", "title": "Matrix", "sourceRunCellId": "run", "columns": [], "rows": [] }',
      "  ]",
      "}"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "json");
    const messages = analysis.schemaDiagnostics.map((diagnostic) => diagnostic.message);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("missing required property 'id'");
    expect(messages[1]).toContain("unexpected property 'ids'");
    expect(messages.join("\n")).not.toContain("missing required property 'source'");
    expect(messages.join("\n")).not.toContain("unexpected property 'sourceRunCellId'");
    expect(messages.join("\n")).not.toContain("unexpected property 'columns'");
  });

  it("rejects capitalized Band on matrix rows", () => {
    const source = [
      "{",
      '  "id": "example",',
      '  "title": "Example",',
      '  "metadata": { "version": 1 },',
      '  "cells": [',
      '    { "id": "matrix", "type": "matrix", "title": "Matrix", "columns": ["Households"], "rows": [',
      '      { "Band": "Assets", "label": "Money", "values": ["+H"] }',
      "    ] }",
      "  ]",
      "}"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "json");
    const messages = analysis.schemaDiagnostics.map((diagnostic) => diagnostic.message);

    expect(analysis.document).toBeNull();
    expect(messages).toContainEqual(expect.stringContaining("unexpected property 'Band'"));
  });

  it("accepts unit aliases in notebook JSON and normalizes them", () => {
    const source = [
      "{",
      '  "id": "example",',
      '  "title": "Example",',
      '  "metadata": { "version": 1 },',
      '  "cells": [',
      '    {',
      '      "id": "equations",',
      '      "type": "equations",',
      '      "title": "Equations",',
      '      "modelId": "main",',
      '      "equations": [',
      '        {',
      '          "id": "eq-0-Y",',
      '          "name": "Y",',
      '          "expression": "G",',
      '          "unitMeta": {',
      '            "stockFlow": "flow",',
      '            "units": { "$": 1, "yr": -1 }',
      "          }",
      "        }",
      "      ]",
      "    },",
      '    {',
      '      "id": "externals",',
      '      "type": "externals",',
      '      "title": "Externals",',
      '      "modelId": "main",',
      '      "externals": [',
      '        { "id": "ext-0-G", "name": "G", "kind": "constant", "valueText": "20", "unitMeta": { "units": { "$": 1, "yr": -1 } } }',
      "      ]",
      "    }",
      "  ]",
      "}"
    ].join("\n");

    const analysis = analyzeNotebookSource(source, "json");

    expect(analysis.schemaDiagnostics).toHaveLength(0);
    expect(analysis.document).not.toBeNull();
    const equationsCell = analysis.document?.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type).toBe("equations");
    if (!equationsCell || equationsCell.type !== "equations") {
      throw new Error("Expected equations cell.");
    }
    expect(equationsCell.equations[0]?.unitMeta).toEqual({
      signature: { money: 1, time: -1 },
      stockFlow: "flow"
    });
  });

});
