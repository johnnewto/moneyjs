// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationNotebookPicker } from "../src/publication/PublicationNotebookPicker";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicationNotebookPicker", () => {
  it("lists templates and navigates to /publish/<id> on change", () => {
    const pushState = vi.spyOn(window.history, "pushState");

    render(
      <PublicationNotebookPicker
        id="publication-notebook-picker-test"
        route={{
          mode: "publish",
          source: "template",
          templateId: "bmw",
          cellId: null,
          embedCellId: null
        }}
      />
    );

    const select = screen.getByRole("combobox", { name: "Notebook" });
    expect(select).toHaveValue("bmw");
    expect(screen.getByRole("option", { name: "BMW" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SIM" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Current notebook (live)" })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "sim" } });

    expect(pushState).toHaveBeenCalledWith(null, "", "/publish/sim");
  });

  it("shows a live option when viewing a live publication", () => {
    render(
      <PublicationNotebookPicker
        id="publication-notebook-picker-live"
        route={{
          mode: "publish",
          source: "live",
          templateId: null,
          cellId: null,
          embedCellId: null
        }}
      />
    );

    const select = screen.getByRole("combobox", { name: "Notebook" });
    expect(select).toHaveValue("__live__");
    expect(screen.getByRole("option", { name: "Current notebook (live)" })).toBeInTheDocument();
  });
});
