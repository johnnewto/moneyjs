// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationContents } from "../src/publication/PublicationContents";
import { buildPublicationContentsEntries, buildPublicationViewModel } from "../src/publication/buildPublicationViewModel";
import { createNotebookFromTemplate } from "../src/notebook/templates";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicationContents", () => {
  it("renders body section titles and scrolls on click", () => {
    const document = createNotebookFromTemplate("bmw");
    const viewModel = buildPublicationViewModel({
      document,
      templateId: "bmw",
      mode: "publish"
    });
    const entries = buildPublicationContentsEntries(viewModel.bodySections);
    const overviewEntry = entries.find((entry) => entry.anchorId === "intro");
    expect(overviewEntry).toBeDefined();

    const target = window.document.createElement("section");
    target.id = "intro";
    window.document.body.append(target);
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    const replaceState = vi.spyOn(window.history, "replaceState");

    render(
      <PublicationContents
        activeAnchorId={null}
        entries={entries.slice(0, 3)}
        interactiveNotebookHref="/notebook/bmw"
        isPrint={false}
        printHref="/print/live"
        route={{
          mode: "publish",
          source: "live",
          templateId: null,
          cellId: null,
          embedCellId: null
        }}
      />
    );

    expect(screen.getByRole("complementary", { name: "Contents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contents" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open interactive notebook" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Print view" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("link", { name: overviewEntry!.title }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(replaceState).toHaveBeenCalledWith(null, "", expect.stringContaining("/publish/live/intro"));
  });
});
