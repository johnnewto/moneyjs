// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});

import { NotebookRowComment } from "../src/notebook/components/NotebookRowComment";
import { SectionBoundarySignatureView } from "../src/notebook/components/SectionBoundarySignatureView";
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
    expect(screen.getByText(/Production_Firms/)).toHaveClass("formula-function");
    expect(screen.getByText("Y").closest(".formula-uppercase")).toBeTruthy();
    expect(screen.getByText("Cs").closest(".formula-uppercase")).toBeTruthy();
  });

  it("shows a collapse triangle and toggles when the boundary signature is clicked", () => {
    const onToggleSectionCollapse = vi.fn();

    render(
      <SectionBoundarySignatureView
        boundary={{
          functionName: "Household_credit",
          inputs: ["P", "rl"],
          outputs: ["Lhd", "nl"]
        }}
        collapsible
        isCollapsed={false}
        onToggleCollapse={onToggleSectionCollapse}
      />
    );

    const signature = screen.getByTitle("Collapse section equations");
    expect(signature).toHaveAttribute("aria-expanded", "true");
    expect(signature.querySelector(".section-boundary-toggle-icon")).toHaveTextContent("▾");

    fireEvent.click(signature);
    expect(onToggleSectionCollapse).toHaveBeenCalledTimes(1);
  });

  it("shows a collapsed triangle when the section is collapsed", () => {
    render(
      <SectionBoundarySignatureView
        boundary={{
          functionName: "Household_credit",
          inputs: ["P"],
          outputs: ["Lhd"]
        }}
        collapsible
        isCollapsed
      />
    );

    const signature = screen.getByTitle("Expand section equations");
    expect(signature).toHaveAttribute("aria-expanded", "false");
    expect(signature.querySelector(".section-boundary-toggle-icon")).toHaveTextContent("▸");
  });
});
