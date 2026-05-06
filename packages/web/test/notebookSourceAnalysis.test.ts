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
});
