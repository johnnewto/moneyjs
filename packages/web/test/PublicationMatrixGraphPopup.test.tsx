// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByRole("dialog", { name: "Graph" })).toBeInTheDocument();
  });
});
