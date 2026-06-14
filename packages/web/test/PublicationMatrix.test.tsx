// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createNotebookFromTemplate } from "../src/notebook/templates";
import { PublicationMatrix } from "../src/publication/components/PublicationMatrix";
import { createTestPublicationInteraction } from "./publicationTestUtils";

afterEach(() => {
  cleanup();
});

describe("PublicationMatrix", () => {
  it("renders symbolic matrix entries for bmw balance sheet", () => {
    const document = createNotebookFromTemplate("bmw");
    const matrixCell = document.cells.find((cell) => cell.id === "balance-sheet");
    expect(matrixCell?.type).toBe("matrix");

    if (matrixCell?.type !== "matrix") {
      return;
    }

    const { container } = render(
      <PublicationMatrix cell={matrixCell} interaction={createTestPublicationInteraction()} />
    );

    expect(screen.getByRole("columnheader", { name: "Households" })).toBeInTheDocument();
    expect(container.querySelectorAll(".publication-matrix-entry").length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/\+.*M.*h/s);
    expect(container.textContent).not.toMatch(/\d+\.\d{3,}/);
  });
});
