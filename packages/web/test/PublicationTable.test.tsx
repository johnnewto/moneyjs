// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createNotebookFromTemplate } from "../src/notebook/templates";
import { PublicationTable } from "../src/publication/components/PublicationTable";
import { createTestPublicationInteraction } from "./publicationTestUtils";

afterEach(() => {
  cleanup();
});

describe("PublicationTable", () => {
  it("renders variable equations instead of period results for bmw baseline table", () => {
    const document = createNotebookFromTemplate("bmw");
    const tableCell = document.cells.find((cell) => cell.id === "baseline-table");
    expect(tableCell?.type).toBe("table");

    if (tableCell?.type !== "table") {
      return;
    }

    render(
      <PublicationTable
        cell={tableCell}
        cells={document.cells}
        interaction={createTestPublicationInteraction()}
      />
    );

    expect(screen.getByRole("columnheader", { name: "Variable" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Equation" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Period/i })).not.toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Y" })).toBeInTheDocument();
    expect(screen.getAllByText("α").length).toBeGreaterThan(0);
  });
});
