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

    expect(screen.getAllByRole("columnheader", { name: "Households" }).length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".publication-matrix-entry").length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/\+.*M.*h/s);
    expect(container.textContent).not.toMatch(/\d+\.\d{3,}/);
  });

  it("renders grouped sector headers for account-transactions matrices", () => {
    const document = createNotebookFromTemplate("bmw");
    const matrixCell = document.cells.find((cell) => cell.id === "account-transactions");
    expect(matrixCell?.type).toBe("matrix");

    if (matrixCell?.type !== "matrix") {
      return;
    }

    const { container } = render(
      <PublicationMatrix cell={matrixCell} interaction={createTestPublicationInteraction()} />
    );

    const householdsHeader = screen.getAllByRole("columnheader", { name: "Households" })[0];
    expect(householdsHeader).toHaveAttribute("colspan", "2");
    expect(screen.getAllByRole("columnheader", { name: "Firms" })[0]).toHaveAttribute("colspan", "4");
    expect(screen.getAllByRole("columnheader", { name: "Banks" })[0]).toHaveAttribute("colspan", "4");
    expect(screen.getAllByRole("columnheader", { name: "Deposits" }).length).toBe(2);
    expect(screen.getByRole("columnheader", { name: "Sum" })).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "initial + ∫ Σ(flows) dt" })
    ).toBeInTheDocument();
    expect(container.querySelector("tbody td.publication-matrix-sector-start")).not.toBeNull();
  });
});
