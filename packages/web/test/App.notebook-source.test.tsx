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
import { notebookToCompactYaml, notebookToJson } from "../src/notebook/document";
import {
  CUSTOM_NOTEBOOK_STORAGE_KEY,
  IMPORTED_NOTEBOOK_VARIANT_ID
} from "../src/notebook/notebookVariants";
import { createNotebookFromTemplate } from "../src/notebook/templates";

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
  }, 15000);

  it("renders and previews notebook YAML from the editor tab by default", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: /^editor$/i }));

    expect(screen.getByRole("tab", { name: /^editor$/i })).toHaveAttribute("aria-selected", "true");

    const textarea = getNotebookSourceTextArea();

    expect(textarea.value).toContain("format: sfcr-notebook-yaml");
    expect(textarea.value).toContain("title: BMW Browser Notebook");
    expect(textarea.value).toContain("  - equations:");
    expect(textarea.value).toContain('        - [Ls, lag(Ls) + d(Ld) * dt, "Supply of bank loans", $, stock, accumulation]');

    setNotebookSourceValue(textarea.value.replace("BMW Browser Notebook", "JSON Notebook"));
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /previewed notebook yaml\. apply to replace the current notebook\./i
    );
    expect(screen.getByRole("button", { name: /apply preview/i })).toBeInTheDocument();
  }, 15000);

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
  }, 15000);

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

    expect(within(sequenceCell).getByRole("button", { name: /show exogenous/i })).toBeInTheDocument();

    await user.click(within(sequenceCell).getByRole("button", { name: /show exogenous/i }));

    await setNotebookSourceFormat(user, "json");

    const exportArea = getNotebookSourceTextArea();
    expect(exportArea.value).toContain('"showExogenous": true');
  }, 15000);

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

  it("renders notebook YAML in the editor when YAML is selected", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "yaml");

    expect(getNotebookSourceTextArea().value).toMatch(/format: sfcr-notebook-yaml/i);
    expect(getNotebookSourceTextArea().value).toMatch(/title: BMW Browser Notebook/i);
    expect(getNotebookSourceTextArea().value).toMatch(/  - equations:/i);
    expect(getNotebookSourceTextArea().value).toMatch(
      /- \[Ls, lag\(Ls\) \+ d\(Ld\) \* dt, "Supply of bank loans", \$, stock, accumulation\]/i
    );
    expect(getNotebookSourceTextArea().value).toMatch(/method: newton/i);
    expect(document.querySelector(".notebook-code-editor .cm-scroller")).toBeTruthy();
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
  }, 15000);

  it("auto-detects YAML during preview import even when JSON is selected", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const yamlSource = notebookToCompactYaml(createNotebookFromTemplate("bmw"), { preserveIds: true }).replace(
      "BMW Browser Notebook",
      "YAML Notebook"
    );

    await setNotebookSourceFormat(user, "json");
    setNotebookSourceValue(yamlSource);
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /previewed notebook yaml\. apply to replace the current notebook\./i
    );
    expect(screen.getAllByText(/YAML Notebook/i).length).toBeGreaterThan(0);
  }, 15000);

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
  }, 15000);

  it("saves an applied custom notebook to browser storage", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await setNotebookSourceFormat(user, "json");

    const textarea = getNotebookSourceTextArea();
    const customSource = textarea.value.replace("BMW Browser Notebook", "Stored Custom Notebook");

    setNotebookSourceValue(customSource);
    await user.click(screen.getByRole("button", { name: /preview import/i }));
    await user.click(screen.getAllByRole("button", { name: /apply preview/i })[0]);

    await waitFor(() => {
      expect(
        window.localStorage.getItem(`sfcr:notebook-variant:${IMPORTED_NOTEBOOK_VARIANT_ID}`)
      ).toContain("Stored Custom Notebook");
    });
    expect(screen.getByRole("combobox", { name: /notebook template/i })).toHaveValue(
      IMPORTED_NOTEBOOK_VARIANT_ID
    );
  }, 15000);

  it("recalls a saved custom notebook from the template selector", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const customNotebook = createNotebookFromTemplate("bmw");
    customNotebook.title = "Recalled Custom Notebook";
    customNotebook.metadata = { version: 1 };
    window.localStorage.setItem(CUSTOM_NOTEBOOK_STORAGE_KEY, notebookToJson(customNotebook));

    render(<App />);

    const templatePicker = screen.getByRole("combobox", { name: /notebook template/i });
    expect(templatePicker).toHaveValue("bmw");
    expect(within(templatePicker).getByRole("option", { name: /recalled custom notebook/i })).toBeInTheDocument();

    await user.selectOptions(templatePicker, IMPORTED_NOTEBOOK_VARIANT_ID);

    expect(screen.getAllByText(/^Recalled Custom Notebook$/i).length).toBeGreaterThan(0);
    expect(templatePicker).toHaveValue(IMPORTED_NOTEBOOK_VARIANT_ID);
  }, 15000);

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

    expect(refreshedTextarea.value).toContain("Draft Notebook");
    expect(refreshedTextarea.value).not.toBe(originalValue);
  }, 15000);
});
