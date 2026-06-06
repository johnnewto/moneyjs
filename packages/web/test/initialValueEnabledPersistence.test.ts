import { describe, expect, it } from "vitest";

import type { NotebookDocument } from "../src/notebook/types";
import {
  notebookFromJson,
  notebookFromYaml,
  notebookToCompactYaml,
  notebookToJson
} from "../src/notebook/document";
import { validateNotebookDocument } from "../src/notebook/validation";

function sampleNotebook(): NotebookDocument {
  return {
    id: "initial-value-enabled-test",
    title: "Initial value enabled test",
    metadata: { version: 1 },
    cells: [
      {
        id: "initial-values",
        type: "initial-values",
        title: "Initial values",
        modelId: "model-1",
        initialValues: [
          { id: "init-hh", name: "Hh", valueText: "80" },
          { id: "init-y", name: "Y", valueText: "100", enabled: false },
          { id: "init-c", name: "C", valueText: "50", desc: "Consumption stock", enabled: false }
        ]
      }
    ]
  };
}

describe("initial value enabled persistence", () => {
  it("round-trips enabled: false through notebook JSON", () => {
    const document = sampleNotebook();
    const restored = notebookFromJson(notebookToJson(document));
    const initialValuesCell = restored.cells.find((cell) => cell.type === "initial-values");

    expect(initialValuesCell?.type).toBe("initial-values");
    if (!initialValuesCell || initialValuesCell.type !== "initial-values") {
      throw new Error("Missing initial-values cell");
    }

    expect(initialValuesCell.initialValues[0]).toMatchObject({ name: "Hh", valueText: "80" });
    expect(initialValuesCell.initialValues[0]).not.toHaveProperty("enabled");
    expect(initialValuesCell.initialValues[1]).toMatchObject({
      name: "Y",
      valueText: "100",
      enabled: false
    });
    expect(initialValuesCell.initialValues[2]).toMatchObject({
      name: "C",
      valueText: "50",
      desc: "Consumption stock",
      enabled: false
    });
    expect(validateNotebookDocument(restored)).toEqual([]);
  });

  it("round-trips enabled: false through compact YAML rows", () => {
    const document = sampleNotebook();
    const yaml = notebookToCompactYaml(document);
    const restored = notebookFromYaml(yaml);
    const initialValuesCell = restored.cells.find((cell) => cell.type === "initial-values");

    expect(yaml).toContain("[Y, 100, init-y, false]");
    expect(yaml).toContain("[C, 50, Consumption stock, init-c, false]");
    expect(yaml).not.toContain("enabled: false");
    expect(initialValuesCell?.type).toBe("initial-values");
    if (!initialValuesCell || initialValuesCell.type !== "initial-values") {
      throw new Error("Missing initial-values cell");
    }

    expect(initialValuesCell.initialValues[1]?.enabled).toBe(false);
    expect(initialValuesCell.initialValues[2]?.enabled).toBe(false);
    expect(initialValuesCell.initialValues).toEqual(
      (document.cells[0] as Extract<typeof document.cells[number], { type: "initial-values" }>).initialValues
    );
    expect(validateNotebookDocument(restored)).toEqual([]);
  });

  it("parses wrapper YAML rows with enabled: false", () => {
    const yaml = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: wrapper-enabled",
      "title: Wrapper enabled",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - initial-values:",
      "      id: initial-values",
      "      title: Initial values",
      "      modelId: model-1",
      "      rows:",
      "        - [Hh, 80]",
      "        - [Y, 100, false]"
    ].join("\n");

    const restored = notebookFromYaml(yaml);
    const initialValuesCell = restored.cells.find((cell) => cell.type === "initial-values");

    expect(initialValuesCell?.type).toBe("initial-values");
    if (!initialValuesCell || initialValuesCell.type !== "initial-values") {
      throw new Error("Missing initial-values cell");
    }

    expect(initialValuesCell.initialValues[0]).toMatchObject({ name: "Hh", valueText: "80" });
    expect(initialValuesCell.initialValues[1]).toMatchObject({
      name: "Y",
      valueText: "100",
      enabled: false
    });
  });

  it("parses trailing true as enabled without storing an explicit enabled field", () => {
    const yaml = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: wrapper-enabled-true",
      "title: Wrapper enabled true",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - initial-values:",
      "      id: initial-values",
      "      title: Initial values",
      "      modelId: model-1",
      "      rows:",
      "        - [V_f, 31361792, true]"
    ].join("\n");

    const restored = notebookFromYaml(yaml);
    const initialValuesCell = restored.cells.find((cell) => cell.type === "initial-values");

    expect(initialValuesCell?.type).toBe("initial-values");
    if (!initialValuesCell || initialValuesCell.type !== "initial-values") {
      throw new Error("Missing initial-values cell");
    }

    expect(initialValuesCell.initialValues[0]).toMatchObject({
      name: "V_f",
      valueText: "31361792"
    });
    expect(initialValuesCell.initialValues[0]).not.toHaveProperty("enabled");
  });

  it("still accepts legacy object rows with enabled: false", () => {
    const yaml = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: legacy-object-enabled",
      "title: Legacy object enabled",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - initial-values:",
      "      id: initial-values",
      "      title: Initial values",
      "      modelId: model-1",
      "      rows:",
      "        - name: V_f",
      "          value: 31361792",
      "          enabled: false"
    ].join("\n");

    const restored = notebookFromYaml(yaml);
    const initialValuesCell = restored.cells.find((cell) => cell.type === "initial-values");

    expect(initialValuesCell?.type).toBe("initial-values");
    if (!initialValuesCell || initialValuesCell.type !== "initial-values") {
      throw new Error("Missing initial-values cell");
    }

    expect(initialValuesCell.initialValues[0]).toMatchObject({
      name: "V_f",
      valueText: "31361792",
      enabled: false
    });
    expect(notebookToCompactYaml(restored)).toContain("[V_f, 31361792, false]");
  });

  it("round-trips enabled: false through typed JSON-style notebook YAML cells", () => {
    const yaml = [
      "format: sfcr-notebook-yaml",
      "formatVersion: 1",
      "id: typed-enabled",
      "title: Typed enabled",
      "metadata:",
      "  version: 1",
      "cells:",
      "  - id: initial-values",
      "    type: initial-values",
      "    title: Initial values",
      "    modelId: model-1",
      "    initialValues:",
      "      - id: init-y",
      "        name: Y",
      "        valueText: '100'",
      "        enabled: false"
    ].join("\n");

    const restored = notebookFromYaml(yaml);

    expect(notebookToJson(restored)).toContain('"enabled": false');
    expect(validateNotebookDocument(restored)).toEqual([]);
  });
});
