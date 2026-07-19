// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SimulationResult } from "@sfcr/core";

import { createNotebookFromTemplate } from "../src/notebook/templates";
import type { MatrixCell } from "../src/notebook/types";
import { PublicationMatrix } from "../src/publication/components/PublicationMatrix";
import { createTestPublicationInteraction } from "./publicationTestUtils";

afterEach(() => {
  cleanup();
});

function buildValueMatrixCell(): MatrixCell {
  return {
    type: "matrix",
    id: "matrix-1",
    title: "Balance sheet",
    columns: ["Households", "Firms"],
    sourceRunCellId: "run-1",
    rows: [{ label: "Deposits", values: ["+Mh", "-Mh"] }]
  };
}

function buildResult(): SimulationResult {
  return {
    options: { periods: 3 },
    series: { Mh: [10, 20, 30] },
    warnings: []
  } as unknown as SimulationResult;
}

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

  it("renders A/L/E stock-role badges in balance-sheet body cells", () => {
    const document = createNotebookFromTemplate("bmw");
    const matrixCell = document.cells.find((cell) => cell.id === "balance-sheet");
    expect(matrixCell?.type).toBe("matrix");

    if (matrixCell?.type !== "matrix") {
      return;
    }

    const { container } = render(
      <PublicationMatrix cell={matrixCell} interaction={createTestPublicationInteraction()} />
    );

    expect(
      container.querySelectorAll("tbody .publication-matrix-role-badge").length
    ).toBeGreaterThan(0);
    expect(container.querySelector("tbody .publication-matrix-role-badge-asset")).not.toBeNull();
    expect(
      container.querySelector("tbody .publication-matrix-role-badge-liability")
    ).not.toBeNull();
    expect(container.querySelector("tbody .publication-matrix-role-badge-equity")).not.toBeNull();
  });

  it("renders A/L/E badges and column color coding for account-transactions headers", () => {
    const document = createNotebookFromTemplate("bmw");
    const matrixCell = document.cells.find((cell) => cell.id === "account-transactions");
    expect(matrixCell?.type).toBe("matrix");

    if (matrixCell?.type !== "matrix") {
      return;
    }

    const { container } = render(
      <PublicationMatrix cell={matrixCell} interaction={createTestPublicationInteraction()} />
    );

    expect(
      container.querySelectorAll("thead .publication-matrix-role-badge").length
    ).toBeGreaterThan(0);
    expect(container.querySelector("thead th.publication-matrix-cell-asset")).not.toBeNull();
    expect(container.querySelector("thead th.publication-matrix-cell-liability")).not.toBeNull();
    expect(container.querySelector("thead th.publication-matrix-cell-equity")).not.toBeNull();
    expect(container.querySelector("tbody td.publication-matrix-cell-asset")).not.toBeNull();
    expect(container.querySelector("tbody td.publication-matrix-cell-liability")).not.toBeNull();
    expect(container.querySelector("tbody td.publication-matrix-cell-equity")).not.toBeNull();
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

  it("renders evaluated values at the selected period in value mode", () => {
    const { container } = render(
      <PublicationMatrix
        cell={buildValueMatrixCell()}
        entryDisplayMode="value"
        getResult={() => buildResult()}
        interaction={createTestPublicationInteraction()}
        selectedPeriodIndex={1}
      />
    );

    const cells = container.querySelectorAll("tbody td");
    expect(cells[0]?.textContent).toContain("20.00");
    expect(cells[1]?.textContent).toContain("-20.00");
    expect(container.querySelector(".publication-matrix-value")).not.toBeNull();
    expect(container.querySelector(".publication-matrix-entry")).toBeNull();
  });

  it("renders equation and value together in both mode", () => {
    const { container } = render(
      <PublicationMatrix
        cell={buildValueMatrixCell()}
        entryDisplayMode="both"
        getResult={() => buildResult()}
        interaction={createTestPublicationInteraction()}
        selectedPeriodIndex={2}
      />
    );

    const firstCell = container.querySelector("tbody td");
    expect(firstCell?.textContent).toContain("Mh");
    expect(firstCell?.textContent).toContain("=");
    expect(firstCell?.textContent).toContain("30.00");
  });

  it("requests a row graph when a row label is clicked", async () => {
    const user = userEvent.setup();
    const onRequestMatrixGraph = vi.fn();

    render(
      <PublicationMatrix
        cell={buildValueMatrixCell()}
        getResult={() => buildResult()}
        interaction={createTestPublicationInteraction()}
        onRequestMatrixGraph={onRequestMatrixGraph}
      />
    );

    await user.click(screen.getByTitle("Graph row Deposits"));

    expect(onRequestMatrixGraph).toHaveBeenCalledTimes(1);
    expect(onRequestMatrixGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        kind: "row",
        label: "Deposits",
        matrixCellId: "matrix-1",
        matrixTitle: "Balance sheet",
        sourceRunCellId: "run-1"
      })
    );
    expect(onRequestMatrixGraph.mock.calls[0]?.[0]?.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "+Mh" }),
        expect.objectContaining({ source: "-Mh" })
      ])
    );
  });

  it("requests a column graph when a column label is clicked", async () => {
    const user = userEvent.setup();
    const onRequestMatrixGraph = vi.fn();

    render(
      <PublicationMatrix
        cell={buildValueMatrixCell()}
        getResult={() => buildResult()}
        interaction={createTestPublicationInteraction()}
        onRequestMatrixGraph={onRequestMatrixGraph}
      />
    );

    await user.click(screen.getByTitle("Graph column Households"));

    expect(onRequestMatrixGraph).toHaveBeenCalledTimes(1);
    expect(onRequestMatrixGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        kind: "column",
        label: "Households",
        matrixCellId: "matrix-1",
        matrixTitle: "Balance sheet",
        sourceRunCellId: "run-1"
      })
    );
  });
});
