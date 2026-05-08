import { describe, expect, it } from "vitest";

import { analyzeNotebookSource } from "../src/notebook/document";

describe("analyzeNotebookSource", () => {
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
