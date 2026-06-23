// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationNotebookApp } from "../src/publication/PublicationNotebookApp";

const runAllMock = vi.fn(async () => undefined);

vi.mock("../src/notebook/useNotebookRunner", () => ({
  useNotebookRunner: () => ({
    errors: {},
    getPreviousResult: vi.fn(() => null),
    getResult: vi.fn(() => null),
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

describe("PublicationNotebookApp", () => {
  it("renders template markdown and auto-runs simulations", async () => {
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

    expect(screen.getByRole("heading", { level: 1, name: /BMW/i })).toBeInTheDocument();
    expect(screen.getByText(/adapts the BMW vignette/i)).toBeInTheDocument();
    expect(runAllMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByText(/Running simulations/i)).not.toBeInTheDocument();
    });

    expect(screen.getByRole("complementary", { name: "Contents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
  });

  it("renders a single embed cell when requested", async () => {
    render(
      <PublicationNotebookApp
        route={{
          mode: "embed",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: "intro"
        }}
      />
    );

    expect(screen.getByText(/adapts the BMW vignette/i)).toBeInTheDocument();
    expect(screen.queryByText(/MoneyJS publication/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Appendix$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Contents" })).not.toBeInTheDocument();
  });

  it("shows an embed hint when the cell query param is missing", () => {
    render(
      <PublicationNotebookApp
        route={{
          mode: "embed",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: null
        }}
      />
    );

    expect(screen.getByText(/requires a/i)).toBeInTheDocument();
  });
});
