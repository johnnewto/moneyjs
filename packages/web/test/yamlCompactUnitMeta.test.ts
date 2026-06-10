import { describe, expect, it } from "vitest";

import {
  buildCompactEquationListRow,
  parseCompactEquationRows
} from "@sfcr/notebook-core";
import { notebookFromYaml, notebookToCompactYaml, notebookToJson } from "../src/notebook/document";

describe("compact YAML unitMeta round-trip", () => {
  it("preserves bare items signature through compact equation rows", () => {
    const equation = {
      id: "eq-3-ine",
      name: "in^e",
      desc: "Expected real inventories",
      expression: "in[-1] + gamma * (in^T - in[-1])",
      unitMeta: { units: { items: 1 } }
    };

    const row = buildCompactEquationListRow(equation, 3);
    expect(row).toEqual([
      "in^e",
      "in[-1] + gamma * (in^T - in[-1])",
      "Expected real inventories",
      "items",
      "",
      "",
      "eq-3-ine"
    ]);

    const [parsed] = parseCompactEquationRows([row], {});
    expect(parsed).toMatchObject({
      id: "eq-3-ine",
      name: "in^e",
      unitMeta: { signature: { items: 1 } }
    });
  });

  it("compiles YAML items unit column to JSON unitMeta", () => {
    const source = `
format: sfcr-notebook-yaml
formatVersion: 1
id: unit-meta-test
title: Unit meta test
metadata:
  version: 1
cells:
  - equations:
      id: equations
      title: Equations
      modelId: main
      rows:
        - [in^e, "in[-1] + gamma * (in^T - in[-1])", "Expected real inventories", items, "", "", eq-3-ine]
`;

    const document = notebookFromYaml(source);
    const equationsCell = document.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations") {
      return;
    }

    expect(equationsCell.equations[0]).toMatchObject({
      id: "eq-3-ine",
      name: "in^e",
      unitMeta: { signature: { items: 1 } }
    });

    const json = notebookToJson(document);
    expect(json).toContain('"unitMeta"');
    expect(json).toContain('"items": 1');
  });

  it("decompiles JSON items unitMeta to compact YAML unit column", () => {
    const source = `
format: sfcr-notebook-yaml
formatVersion: 1
id: unit-meta-test
title: Unit meta test
metadata:
  version: 1
cells:
  - equations:
      id: equations
      title: Equations
      modelId: main
      rows:
        - [in^e, "in[-1] + gamma * (in^T - in[-1])", "Expected real inventories", items, "", "", eq-3-ine]
`;

    const document = notebookFromYaml(source);
    const yaml = notebookToCompactYaml(document, { preserveIds: true });
    expect(yaml).toContain(
      '[in^e, "in[-1] + gamma * (in^T - in[-1])", "Expected real inventories", items, "", "", eq-3-ine]'
    );
  });
});
