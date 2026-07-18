// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationNotebookApp } from "../src/publication/PublicationNotebookApp";

const runAllMock = vi.fn(async () => undefined);

vi.mock("../src/notebook/useNotebookRunner", () => ({
  useNotebookRunner: () => ({
    errors: {},
    getPreviousResult: vi.fn(() => null),
    getResult: vi.fn(() => ({
      options: { periods: 3 },
      series: {
        Mh: [10, 12, 14],
        Ms: [-10, -12, -14],
        Y: [100, 110, 120]
      },
      warnings: []
    })),
    outputs: {},
    runAll: runAllMock,
    runCell: vi.fn(async () => undefined),
    status: {}
  })
}));

afterEach(() => {
  cleanup();
  runAllMock.mockClear();
  window.sessionStorage.clear();
});

describe("PublicationNotebookApp matrix graph popup", () => {
  it("opens a floating graph popup when a matrix column heading is clicked", async () => {
    const user = userEvent.setup();

    render(
      <PublicationNotebookApp
        route={{
          mode: "publish",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: null
        }}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Running simulations/i)).not.toBeInTheDocument();
    });

    const graphButton = screen.getAllByTitle(/^Graph column/i)[0];
    expect(graphButton).toBeDefined();
    await user.click(graphButton);

    const dialog = screen.getByRole("dialog", { name: "Graph" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize graph panel" })).toBeInTheDocument();
    expect(dialog).toHaveStyle({ width: "544px", height: "480px" });
  }, 15000);

  it("opens the graph popup from the Open Graph action link", async () => {
    const user = userEvent.setup();

    render(
      <PublicationNotebookApp
        route={{
          mode: "publish",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: null
        }}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Running simulations/i)).not.toBeInTheDocument();
    });

    const openGraphButtons = screen.getAllByRole("button", { name: "Open Graph" });
    expect(openGraphButtons.length).toBeGreaterThan(0);
    await user.click(openGraphButtons[0]!);

    const dialog = screen.getByRole("dialog", { name: "Graph" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Add a variable to graph")).toBeInTheDocument();
  }, 15000);

  it("renders a period scrubber and matrix display-mode toggle", async () => {
    render(
      <PublicationNotebookApp
        route={{
          mode: "publish",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: null
        }}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Running simulations/i)).not.toBeInTheDocument();
    });

    expect(
      screen.getAllByRole("button", { name: /Matrix cell display:/i }).length
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Selected simulation period")).toBeInTheDocument();
    expect(screen.getByText(/Period \d+ of \d+/)).toBeInTheDocument();
  }, 15000);

  it("switches matrix entries to evaluated values when the toggle is used", async () => {
    const user = userEvent.setup();

    const { container } = render(
      <PublicationNotebookApp
        route={{
          mode: "publish",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: null
        }}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/Running simulations/i)).not.toBeInTheDocument();
    });

    expect(container.querySelector(".publication-matrix-value")).toBeNull();

    const [matrixToggle] = screen.getAllByRole("button", { name: /Matrix cell display:/i });
    await user.click(matrixToggle);

    expect(container.querySelector(".publication-matrix-value")).not.toBeNull();
  }, 15000);
});
