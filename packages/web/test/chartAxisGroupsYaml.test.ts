import { describe, expect, it } from "vitest";

import { notebookFromYaml, notebookToCompactYaml } from "../src/notebook/document";
import type { ChartCell } from "../src/notebook/types";

const yamlSource = `format: sfcr-notebook-yaml
formatVersion: 1
id: axis-groups-notebook
title: Axis groups notebook
metadata:
  version: 1
cells:
  - run:
      id: baseline-run
      title: Baseline run
      mode: baseline
      periods: 10
      resultKey: baseline
      sourceModelId: main
  - chart:
      id: baseline-chart
      title: Baseline headline variables
      sourceRunCellId: baseline-run
      variables: [Y, Cd, Mh, W]
      axisGroups:
        - [Y, Cd, Mh]
        - [W]
`;

function findChart(document: ReturnType<typeof notebookFromYaml>): ChartCell {
  const chart = document.cells.find((cell): cell is ChartCell => cell.type === "chart");
  if (!chart) {
    throw new Error("Expected a chart cell.");
  }
  return chart;
}

describe("chart axisGroups YAML round-trip", () => {
  it("parses axisGroups from YAML", () => {
    const document = notebookFromYaml(yamlSource);
    expect(findChart(document).axisGroups).toEqual([["Y", "Cd", "Mh"], ["W"]]);
  });

  it("serializes axisGroups back to compact flow-style arrays", () => {
    const document = notebookFromYaml(yamlSource);
    const serialized = notebookToCompactYaml(document, { preserveIds: true });

    expect(serialized).toMatch(/axisGroups:/);
    expect(serialized).toMatch(/- \[Y, Cd, Mh\]/);
    expect(serialized).toMatch(/- \[W\]/);

    const reparsed = notebookFromYaml(serialized);
    expect(findChart(reparsed).axisGroups).toEqual([["Y", "Cd", "Mh"], ["W"]]);
  });
});
