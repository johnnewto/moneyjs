// @vitest-environment jsdom

import { render, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  App,
  getNotebookSourceEditor,
  getNotebookSourceTextArea,
  screen,
  setNotebookSourceFormat,
  setNotebookSourceValue,
  setupAppTestEnv,
  userEvent
} from "./appTestUtils";

setupAppTestEnv();

describe("App notebook source and import workflows", () => {
  it("renders notebook JSON in the editor when JSON is selected", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "json");

    expect(getNotebookSourceEditor()).toBeInTheDocument();
    expect(getNotebookSourceTextArea().value).toMatch(/"title": "BMW Browser Notebook"/i);
    expect(getNotebookSourceTextArea().value).toMatch(
      /\{ "id": "intro", "type": "markdown", "title": "Overview", "source":/i
    );
    expect(document.querySelector(".notebook-code-editor .cm-lineWrapping")).toBeNull();
    expect(document.querySelector(".notebook-code-editor .cm-scroller")).toBeTruthy();
  });

  it("renders and previews notebook JSON from the editor tab", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: /^editor$/i }));

    expect(screen.getByRole("tab", { name: /^editor$/i })).toHaveAttribute("aria-selected", "true");

    const textarea = getNotebookSourceTextArea();

    expect(textarea.value).toContain('"title": "BMW Browser Notebook"');
    expect(textarea.value).toContain('"type": "equations"');

    setNotebookSourceValue(textarea.value.replace("BMW Browser Notebook", "JSON Notebook"));
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /previewed notebook json\. apply to replace the current notebook\./i
    );
    expect(screen.getByRole("button", { name: /apply preview/i })).toBeInTheDocument();
  });

  it("highlights the selected notebook cell in the JSON source editor without switching tabs", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const overviewHeading = screen.getByRole("heading", { name: /^overview$/i });
    const overviewArticle = overviewHeading.closest("article");
    expect(overviewArticle).not.toBeNull();
    if (!(overviewArticle instanceof HTMLElement)) {
      throw new Error("Expected overview notebook cell article.");
    }

    await user.click(overviewArticle);

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute("aria-selected", "true");
    expect(overviewArticle.className).toContain("notebook-cell-is-selected");

    await user.click(screen.getByRole("tab", { name: /^editor$/i }));

    await waitFor(() => {
      expect(document.querySelector(".notebook-source-selected-cell-line")).not.toBeNull();
    });
  });

  it("shows live schema validation and blocks applying invalid JSON", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "json");
    const textarea = getNotebookSourceTextArea();

    setNotebookSourceValue(textarea.value.replace('"version": 1', '"version": 2'));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /notebook source validation/i })).toHaveTextContent(
        /schema validation failed/i
      );
      expect(screen.getByRole("button", { name: /apply text/i })).toBeDisabled();
    });
  });

  it("shows detailed model validation issues for invalid notebook JSON", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "json");
    const textarea = getNotebookSourceTextArea();

    setNotebookSourceValue(textarea.value.replace(/"expression":\s*"[^"]+"/, '"expression": ""'));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /notebook source validation/i })).toHaveTextContent(
        /equation expression is required/i
      );
      expect(screen.getByRole("button", { name: /apply text/i })).toBeDisabled();
    });
  });

  it("persists dependency toolbar choices into the notebook document", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const sequenceHeading = screen.getByRole("heading", { name: /bmw equation dependency graph/i });
    const sequenceCell = sequenceHeading.closest("article");
    expect(sequenceCell).not.toBeNull();
    if (!(sequenceCell instanceof HTMLElement)) {
      throw new Error("Expected BMW equation dependency graph article.");
    }

    const showButton = within(sequenceCell).queryByRole("button", { name: /^show$/i });
    if (showButton) {
      await user.click(showButton);
    }

    expect(within(sequenceCell).getByRole("button", { name: /accounting bands/i })).toHaveClass("is-active");
    expect(within(sequenceCell).getByRole("button", { name: /^sectors$/i })).toHaveClass("is-active");
    expect(within(sequenceCell).getByRole("button", { name: /show exogenous/i })).toBeInTheDocument();

    await user.click(within(sequenceCell).getByRole("button", { name: /^sectors$/i }));
    expect(within(sequenceCell).getByRole("button", { name: /^columns$/i })).not.toHaveClass("is-active");

    await setNotebookSourceFormat(user, "json");

    const exportArea = getNotebookSourceTextArea();
    expect(exportArea.value).not.toContain('"viewMode": "strips"');
    expect(exportArea.value).toContain('"stripSectorSource": "columns"');
    expect(exportArea.value).toContain('"showAccountingStrips": true');
    expect(exportArea.value).not.toContain('"accountingBandGrouping": "family"');
    expect(exportArea.value).toContain('"showExogenous": false');
  });

  it("renders notebook Markdown in the editor when Markdown is selected", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "markdown");

    expect(getNotebookSourceTextArea().value).toMatch(/```sfcr-equations/i);
    expect(getNotebookSourceTextArea().value).toMatch(/```sfcr-solver/i);
    expect(getNotebookSourceTextArea().value).toMatch(/```sfcr-externals/i);
    expect(getNotebookSourceTextArea().value).toMatch(/```sfcr-initial-values/i);
    expect(getNotebookSourceTextArea().value).toMatch(/```sfcr-matrix/i);
    expect(getNotebookSourceTextArea().value).toMatch(/```sfcr-sequence/i);
    expect(getNotebookSourceTextArea().value).toMatch(/# BMW Browser Notebook/i);
  });

  it("auto-detects Markdown during preview import even when JSON is selected", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "markdown");
    const markdownTextarea = getNotebookSourceTextArea();
    const markdownSource = markdownTextarea.value;

    await setNotebookSourceFormat(user, "json");
    setNotebookSourceValue(markdownSource);
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes("Types: markdown") ?? false).length
    ).toBeGreaterThan(0);
  });

  it("previews and applies imported notebook JSON before replacing the document", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "json");

    const textarea = getNotebookSourceTextArea();
    const nextValue = textarea.value.replace("BMW Browser Notebook", "Imported Notebook");

    if (!nextValue) {
      throw new Error("Expected notebook export text.");
    }

    setNotebookSourceValue(nextValue);
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Imported Notebook/i).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: /apply preview/i })[0]);

    expect(screen.getAllByText(/^Imported Notebook$/i).length).toBeGreaterThan(0);
  });

  it("shows apply and discard actions when the import text is edited", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "json");

    const textarea = getNotebookSourceTextArea();
    const originalValue = textarea.value;
    const editedValue = textarea.value.replace("BMW Browser Notebook", "Draft Notebook");

    setNotebookSourceValue(editedValue);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply text/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /discard text/i })).toBeInTheDocument();
    });
    await setNotebookSourceFormat(user, "markdown");
    expect(screen.getByRole("status")).toHaveTextContent(
      /apply or discard the source draft before changing format/i
    );
    expect(getNotebookSourceTextArea()).toHaveValue(editedValue);

    await user.click(screen.getByRole("button", { name: /apply text/i }));

    expect(screen.getAllByText(/^Draft Notebook$/i).length).toBeGreaterThan(0);

    await setNotebookSourceFormat(user, "json");

    const refreshedTextarea = getNotebookSourceTextArea();
    setNotebookSourceValue(originalValue);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /discard text/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /discard text/i }));

    expect(refreshedTextarea.value).toBe(editedValue);
  });
});
