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
      options: { periods: 2 },
      series: {
        Y: [100, 110],
        Cd: [60, 66]
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

describe("PublicationNotebookApp variable inspector", () => {
  it("opens a floating inspector when a publication equation variable is clicked", async () => {
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

    const inspectButton = screen.getAllByRole("button", { name: /^Inspect variable Y$/i })[0];
    await user.click(inspectButton);

    expect(screen.getByRole("dialog", { name: "Variable inspector" })).toBeInTheDocument();
    expect(screen.getByText("Selected variable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Y\b/i })).toBeInTheDocument();
  });
});
