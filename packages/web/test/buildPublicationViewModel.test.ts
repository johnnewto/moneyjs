import { describe, expect, it } from "vitest";

import { buildPublicationViewModel, buildPublicationContentsEntries } from "../src/publication/buildPublicationViewModel";
import { createNotebookFromTemplate } from "../src/notebook/templates";

describe("buildPublicationViewModel", () => {
  it("splits body and appendix sections for bmw", () => {
    const document = createNotebookFromTemplate("bmw");
    const viewModel = buildPublicationViewModel({
      document,
      templateId: "bmw",
      mode: "publish"
    });

    expect(viewModel.bodySections.some((section) => section.cell.type === "markdown")).toBe(true);
    expect(viewModel.bodySections.some((section) => section.cell.type === "matrix")).toBe(true);
    expect(viewModel.bodySections.some((section) => section.cell.type === "run")).toBe(true);
    expect(viewModel.appendixSections.some((section) => section.cell.type === "run")).toBe(false);
    expect(viewModel.appendixSections.some((section) => section.cell.type === "solver")).toBe(true);
  });

  it("routes matrix-sourced sequence cells to the body and skips other sequence sources", () => {
    const document = createNotebookFromTemplate("bmw");
    const viewModel = buildPublicationViewModel({
      document,
      templateId: "bmw",
      mode: "publish"
    });

    const matrixSequenceCells = document.cells.filter(
      (cell) => cell.type === "sequence" && cell.source.kind === "matrix"
    );
    expect(matrixSequenceCells.length).toBeGreaterThan(0);

    const sequenceBodySections = viewModel.bodySections.filter(
      (section) => section.kind === "sequence"
    );
    expect(sequenceBodySections.length).toBe(matrixSequenceCells.length);
    expect(
      sequenceBodySections.every((section) => section.cell.type === "sequence")
    ).toBe(true);

    // Non-matrix sequence sources (e.g. cld/dependency) never become publication sections.
    const nonMatrixSequenceIds = document.cells
      .filter((cell) => cell.type === "sequence" && cell.source.kind !== "matrix")
      .map((cell) => cell.id);
    const allSectionIds = [...viewModel.bodySections, ...viewModel.appendixSections].map(
      (section) => section.anchorId
    );
    for (const id of nonMatrixSequenceIds) {
      expect(allSectionIds).not.toContain(id);
    }
  });

  it("filters embed mode to a single eligible cell", () => {
    const document = createNotebookFromTemplate("werner-qtc-explainer");
    const viewModel = buildPublicationViewModel({
      document,
      templateId: "werner-qtc-explainer",
      mode: "embed",
      embedCellId: "intro"
    });

    expect(viewModel.bodySections).toHaveLength(1);
    expect(viewModel.bodySections[0]?.anchorId).toBe("intro");
    expect(viewModel.appendixSections).toHaveLength(0);
  });

  it("returns empty body sections when embed cell is missing", () => {
    const document = createNotebookFromTemplate("bmw");
    const viewModel = buildPublicationViewModel({
      document,
      templateId: "bmw",
      mode: "embed",
      embedCellId: null
    });

    expect(viewModel.bodySections).toHaveLength(0);
  });

  it("builds contents entries from titled body sections", () => {
    const document = createNotebookFromTemplate("bmw");
    const viewModel = buildPublicationViewModel({
      document,
      templateId: "bmw",
      mode: "publish"
    });

    const entries = buildPublicationContentsEntries(viewModel.bodySections);
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.some((entry) => entry.anchorId === "intro")).toBe(true);
    expect(entries.every((entry) => entry.title.length > 0)).toBe(true);
  });
});
