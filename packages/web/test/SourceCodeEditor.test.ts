import { describe, expect, it } from "vitest";

import { notebookToJson } from "../src/notebook/document";
import { createNotebookFromTemplate } from "../src/notebook/templates";
import {
  resolveCompletionLabelsForSource,
  resolveCompletionKeyPrefix,
  resolveCompletionKeys,
  resolveCompletionReplacementEnd,
  resolveCompletionReplacementStart,
  resolveDiagnosticRange,
  resolveSelectedCellSourceRange,
  shouldOfferKeyCompletion
} from "../src/notebook/SourceCodeEditor";

describe("resolveDiagnosticRange", () => {
  it("expands zero-length parse diagnostics to a visible one-character range", () => {
    expect(
      resolveDiagnosticRange(
        {
          message: "parse error",
          offset: 7,
          phase: "parse"
        },
        20
      )
    ).toEqual({ from: 7, to: 8 });
  });

  it("preserves explicit parse ranges when provided", () => {
    expect(
      resolveDiagnosticRange(
        {
          endOffset: 12,
          message: "parse error",
          offset: 9,
          phase: "parse"
        },
        20
      )
    ).toEqual({ from: 9, to: 12 });
  });
});

describe("resolveSelectedCellSourceRange", () => {
  it("finds the JSON source block for a selected notebook cell", () => {
    const document = createNotebookFromTemplate("bmw");
    const source = notebookToJson(document);

    const range = resolveSelectedCellSourceRange({
      document,
      format: "json",
      selectedCellId: "equations-newton",
      source
    });

    expect(range).not.toBeNull();
    expect(source.slice(range!.from, range!.to)).toContain('"id": "equations-newton"');
    expect(source.slice(range!.from, range!.to)).toContain('"type": "equations"');
  });
});


describe("resolveCompletionReplacementStart", () => {
  it("includes an already typed JSON quote in the replacement range", () => {
    const source = [
      "{",
      '  "cells": [',
      "    {",
      '      "type": "matrix",',
      '      "rows": [',
      "        {",
      '          "band'
    ].join("\n");

    expect(source.slice(resolveCompletionReplacementStart(source, "json"))).toBe('"band');
  });

  it("keeps JSON key replacement to the typed key text", () => {
    const source = ['{"cells":[{"type":"matrix","rows":[{"ban'].join("\n");

    expect(source.slice(resolveCompletionReplacementStart(source, "json"))).toBe('"ban');
  });

  it("includes a partially finished JSON property slot in the replacement range", () => {
    const source = ['"c": '].join("\n");

    expect(source.slice(resolveCompletionReplacementStart(source, "json"))).toBe('"c": ');
  });

  it("keeps JSON property slot text in the replacement range", () => {
    const source = ['  "c": '].join("\n");

    expect(source.slice(resolveCompletionReplacementStart(source, "json"))).toBe('"c": ');
  });
});

describe("resolveCompletionReplacementEnd", () => {
  it("consumes an existing JSON property suffix after the cursor", () => {
    expect(resolveCompletionReplacementEnd('": ', "json")).toBe(3);
  });

  it("leaves value text untouched", () => {
    expect(resolveCompletionReplacementEnd('"value"', "json")).toBe(0);
  });
});

describe("resolveCompletionKeyPrefix", () => {
  it("extracts a JSON key prefix after an opening quote", () => {
    expect(resolveCompletionKeyPrefix('"c', "json")).toBe("c");
  });

  it("extracts a JSON key prefix from a partially finished property slot", () => {
    expect(resolveCompletionKeyPrefix('"c": ', "json")).toBe("c");
  });

});

describe("resolveCompletionKeys", () => {
  it("suggests matrix-specific JSON keys inside a matrix cell", () => {
    const source = [
      "{",
      '  "cells": [',
      "    {",
      '      "id": "matrix",',
      '      "type": "matrix",',
      '      "sourceRunCellId": "baseline-run",',
      '      "column"'
    ].join("\n");

    expect(resolveCompletionKeys(source)).toEqual(
      expect.arrayContaining(["columns", "sectors", "rows", "sourceRunCellId"])
    );
  });

  it("suggests matrix row keys inside a matrix rows entry", () => {
    const source = [
      "{",
      '  "cells": [',
      "    {",
      '      "id": "matrix",',
      '      "type": "matrix",',
      '      "rows": [',
      "        {",
      '          "band"'
    ].join("\n");

    expect(resolveCompletionKeys(source)).toEqual(
      expect.arrayContaining(["band", "label", "values"])
    );
    expect(resolveCompletionKeys(source)).not.toContain("Band");
  });

  it("suggests equation row keys after existing equation properties", () => {
    const source = [
      "{",
      '  "cells": [',
      "    {",
      '      "id": "eq-cell",',
      '      "type": "equations",',
      '      "modelId": "main",',
      '      "equations": [',
      "        {",
      '          "id": "eq-1",',
      '          "d"',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}"
    ].join("\n");

    expect(resolveCompletionKeys(source)).toEqual(
      expect.arrayContaining(["id", "name", "desc", "expression", "role", "unitMeta"])
    );
  });

  it("returns equation row keys through the live completion source on explicit open", async () => {
    const source = [
      "{",
      '  "id": "test",',
      '  "title": "Test",',
      '  "metadata": { "version": 1 },',
      '  "cells": [',
      "    {",
      '      "id": "eq-cell",',
      '      "type": "equations",',
      '      "modelId": "main",',
      '      "equations": [',
      "        {",
      '          "id": "eq-1",',
      '          ""',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}"
    ].join("\n");

    await expect(
      resolveCompletionLabelsForSource({
        document: createNotebookFromTemplate("bmw"),
        explicit: true,
        format: "json",
        pos: source.lastIndexOf('"') + 1,
        source
      })
    ).resolves.toEqual(
      expect.arrayContaining(["id", "name", "desc", "expression", "role", "unitMeta"])
    );
  });

  it("filters equation row keys through the live completion source while typing", async () => {
    const source = [
      "{",
      '  "id": "test",',
      '  "title": "Test",',
      '  "metadata": { "version": 1 },',
      '  "cells": [',
      "    {",
      '      "id": "eq-cell",',
      '      "type": "equations",',
      '      "modelId": "main",',
      '      "equations": [',
      "        {",
      '          "id": "eq-1",',
      '          "d',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}"
    ].join("\n");

    await expect(
      resolveCompletionLabelsForSource({
        document: createNotebookFromTemplate("bmw"),
        format: "json",
        pos: source.lastIndexOf('"d') + 2,
        source
      })
    ).resolves.toEqual(["desc"]);
  });

  it("filters equation row keys in the full BMW JSON template", async () => {
    const document = createNotebookFromTemplate("bmw");
    const equationsCell = document.cells.find((cell) => cell.type === "equations");
    if (!equationsCell) {
      throw new Error("BMW template should contain an equations cell");
    }
    const firstEquation = equationsCell.equations[0];
    equationsCell.equations[0] = { ...firstEquation, dAutocompleteProbe: "" } as typeof firstEquation;
    const marker = '"dAutocompleteProbe": ""';
    const serializedSource = notebookToJson(document);
    const cursorPosition = serializedSource.indexOf(marker) + 2;
    const source = serializedSource.replace(marker, '"d');

    await expect(
      resolveCompletionLabelsForSource({
        document,
        format: "json",
        pos: cursorPosition,
        source
      })
    ).resolves.toEqual(["desc"]);
  });

  it("serializes BMW equation rows onto single lines", () => {
    const document = createNotebookFromTemplate("bmw");
    const serializedSource = notebookToJson(document);

    expect(serializedSource).toContain(
      '{ "id": "eq-0-Cs", "name": "Cs", "desc": "Consumption goods supply", "expression": "Cd", "role": "definition", "unitMeta": { "stockFlow": "flow", "signature": { "money": 1, "time": -1 } } }'
    );
  });

});

describe("shouldOfferKeyCompletion", () => {
  it("opens JSON key suggestions at an empty object slot", () => {
    const source = ["{", '  "cells": [', "    {", "      "].join("\n");

    expect(shouldOfferKeyCompletion(source, "json")).toBe(true);
  });

  it("opens JSON key suggestions after an opening quote", () => {
    const source = ["{", '  "cells": [', "    {", '      "'].join("\n");

    expect(shouldOfferKeyCompletion(source, "json")).toBe(true);
  });

  it("opens JSON key suggestions for a partially finished property slot", () => {
    expect(shouldOfferKeyCompletion('"c": ', "json")).toBe(true);
  });
});