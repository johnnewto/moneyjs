// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotebookRowComment } from "../src/notebook/components/NotebookRowComment";
import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";
import { resolveInferredSectionBoundary } from "@sfcr/notebook-core";

describe("section boundary display", () => {
  it("renders an inferred BMW production firms signature", () => {
    const equationsCell = NOTEBOOK_TEMPLATES.bmw.document.cells.find((cell) => cell.type === "equations");
    const externalsCell = NOTEBOOK_TEMPLATES.bmw.document.cells.find((cell) => cell.type === "externals");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations" || externalsCell?.type !== "externals") {
      return;
    }

    const productionComment = equationsCell.equations.find(
      (row): row is Extract<(typeof equationsCell.equations)[number], { kind: "comment" }> =>
        row.kind === "comment" && row.text === "Production Firms"
    );
    expect(productionComment).toBeDefined();
    if (!productionComment) {
      return;
    }

    const boundary = resolveInferredSectionBoundary({
      comment: productionComment,
      equations: equationsCell.equations,
      externals: externalsCell.externals
    });
    expect(boundary).not.toBeNull();

    render(
      <NotebookRowComment
        inferredBoundary={boundary}
        text={productionComment.text}
      />
    );

    expect(screen.getByText("Production Firms")).toBeTruthy();
    expect(screen.getByText(/Production_Firms/)).toBeTruthy();
    expect(screen.getByText("Y")).toBeTruthy();
    expect(screen.getByText("Cs")).toBeTruthy();
  });
});
