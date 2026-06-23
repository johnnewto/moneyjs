import { describe, expect, it } from "vitest";

import { notebookFromYaml, notebookToCompactYaml } from "../src/notebook/document";

const SOURCE = `
format: sfcr-notebook-yaml
formatVersion: 1
id: more-field-test
title: More field test
metadata:
  version: 1
cells:
  - markdown:
      id: intro
      title: Overview
      source: Intro body.
      more: |
        Extended **markdown** explanation for the intro cell.
  - equations:
      id: equations
      title: Equations
      modelId: main
      rows:
        - [Y, Cs + Gs, "Output.", "", "", identity, eq-y]
      more: Why the equations matter.
  - matrix:
      id: balance-sheet
      accountingKind: balance-sheet
      title: Balance sheet
      sourceRunCellId: run
      columns: [Households, Sum]
      sectors: [Households, ""]
      rows:
        - [Money, Money, +Hh, "0"]
      more: Balance sheet detail.
  - run:
      id: run
      title: Baseline run
      mode: baseline
      periods: 10
      resultKey: baseline
      sourceModelId: main
      more: Baseline run detail.
  - chart:
      id: chart
      title: Chart
      variables: [Y]
      sourceRunCellId: run
      more: Chart detail.
  - table:
      id: table
      title: Table
      variables: [Y]
      sourceRunCellId: run
      more: Table detail.
`;

describe("notebook cell `more` field", () => {
  it("parses `more` into the document for every cell kind", () => {
    const document = notebookFromYaml(SOURCE);
    const moreById = new Map(document.cells.map((cell) => [cell.id, cell.more]));

    expect(moreById.get("intro")?.trim()).toBe(
      "Extended **markdown** explanation for the intro cell."
    );
    expect(moreById.get("equations")).toBe("Why the equations matter.");
    expect(moreById.get("balance-sheet")).toBe("Balance sheet detail.");
    expect(moreById.get("run")).toBe("Baseline run detail.");
    expect(moreById.get("chart")).toBe("Chart detail.");
    expect(moreById.get("table")).toBe("Table detail.");
  });

  it("round-trips `more` through compact YAML", () => {
    const document = notebookFromYaml(SOURCE);
    const yaml = notebookToCompactYaml(document, { preserveIds: true });
    const reparsed = notebookFromYaml(yaml);
    const moreById = new Map(reparsed.cells.map((cell) => [cell.id, cell.more]));

    expect(moreById.get("intro")?.trim()).toBe(
      "Extended **markdown** explanation for the intro cell."
    );
    expect(moreById.get("equations")).toBe("Why the equations matter.");
    expect(moreById.get("balance-sheet")).toBe("Balance sheet detail.");
    expect(moreById.get("run")).toBe("Baseline run detail.");
    expect(moreById.get("chart")).toBe("Chart detail.");
    expect(moreById.get("table")).toBe("Table detail.");
  });
});
