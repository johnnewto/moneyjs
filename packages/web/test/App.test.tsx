// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/app/App";

const runBaseline = vi.fn();
const runScenario = vi.fn();
const validate = vi.fn();

vi.mock("../src/hooks/useSolver", () => ({
  useSolver: () => ({
    status: "idle" as const,
    result: null,
    error: null,
    progress: null,
    runBaseline,
    runScenario,
    validate
  })
}));

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "#/workspace";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    runBaseline.mockReset();
    runScenario.mockReset();
    validate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the editable browser workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /sfcr browser workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run baseline/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /equations/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /import \/ export/i })).toBeInTheDocument();
  });

  it("switches presets and updates visible editor content", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getAllByDisplayValue("TXs").length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText(/model preset/i), "bmw");

    expect(screen.getAllByDisplayValue("WBd").length).toBeGreaterThan(0);
    expect(screen.queryAllByDisplayValue("TXs")).toHaveLength(0);
  });

  it("shows validation issues when the editor becomes invalid", async () => {
    const user = userEvent.setup();
    render(<App />);

    const firstEquationName = screen.getAllByDisplayValue("TXs")[0];
    expect(firstEquationName).toBeDefined();
    if (!firstEquationName) {
      throw new Error("Expected at least one TXs input");
    }
    await user.clear(firstEquationName);

    expect(screen.getByText(/editor validation: 1 issue\(s\)\./i)).toBeInTheDocument();
    expect(screen.getAllByText(/equation name is required/i)).not.toHaveLength(0);
  });

  it("surfaces parser build errors inside the model editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    const firstExpression = screen.getAllByDisplayValue("TXd")[0];
    expect(firstExpression).toBeDefined();
    if (!firstExpression) {
      throw new Error("Expected at least one TXd expression input");
    }

    await user.clear(firstExpression);
    fireEvent.change(firstExpression, { target: { value: "[" } });

    expect(screen.getByText(/model build error: unexpected character: \[/i)).toBeInTheDocument();
    expect(screen.getByText(/editor validation: 1 issue\(s\)\./i)).toBeInTheDocument();
    expect(screen.getAllByText(/unexpected character: \[/i).length).toBeGreaterThan(0);
  });

  it("renders the BMW notebook route", () => {
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByText(/bmw browser notebook/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /validate/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /bmw balance sheet/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /bmw transactions-flow matrix/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /bmw transaction flow sequence/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /baseline run with newton/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/edit model cell/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /add equation/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Variable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Description").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expression").length).toBeGreaterThan(0);
  });

  it("switches notebook templates from the command bar", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByText(/bmw browser notebook/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl6-dis");

    expect(screen.getByText(/gl6 dis notebook/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dis balance sheet/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /dis transactions-flow matrix/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^dis model$/i })).toBeInTheDocument();
  });

  it("exports notebook JSON into the import area", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    expect(screen.getByDisplayValue(/"title": "BMW Browser Notebook"/i)).toBeInTheDocument();
  });

  it("exports notebook Markdown into the import area", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^import$/i }));
    await user.click(screen.getByRole("button", { name: /^markdown$/i }));
    await user.click(screen.getByRole("button", { name: /export to text/i }));

    expect(screen.getByDisplayValue(/```sfcr-model/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/```sfcr-matrix/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/```sfcr-sequence/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/# BMW Browser Notebook/i)).toBeInTheDocument();
  });

  it("auto-detects Markdown during preview import even when JSON is selected", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^import$/i }));
    await user.click(screen.getByRole("button", { name: /^markdown$/i }));
    await user.click(screen.getByRole("button", { name: /export to text/i }));
    const markdownTextarea = screen.getByPlaceholderText(
      /paste notebook markdown with headings and fenced sfcr-\* blocks/i
    ) as HTMLTextAreaElement;
    const markdownSource = markdownTextarea.value;

    await user.click(screen.getByRole("button", { name: /^json$/i }));
    fireEvent.change(screen.getByPlaceholderText(/paste a notebook json document/i), {
      target: { value: markdownSource }
    });
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(screen.getByText(/Types: markdown/i)).toBeInTheDocument();
  });

  it("previews and applies imported notebook JSON before replacing the document", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    const textarea = screen.getByPlaceholderText(
      /paste a notebook json document/i
    ) as HTMLTextAreaElement;
    const nextValue = textarea.value.replace("BMW Browser Notebook", "Imported Notebook");

    if (!nextValue) {
      throw new Error("Expected notebook export text.");
    }

    fireEvent.change(textarea, { target: { value: nextValue } });
    await user.click(screen.getByRole("button", { name: /preview import/i }));

    expect(screen.getByRole("heading", { name: /import preview/i })).toBeInTheDocument();
    expect(screen.getByText(/Title: Imported Notebook/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /apply preview/i })[0]);

    expect(screen.getByText(/^Imported Notebook$/i)).toBeInTheDocument();
  });

  it("shows apply and discard actions when the import text is edited", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    const textarea = screen.getByPlaceholderText(
      /paste a notebook json document/i
    ) as HTMLTextAreaElement;
    const originalValue = textarea.value;
    const editedValue = textarea.value.replace("BMW Browser Notebook", "Draft Notebook");

    fireEvent.change(textarea, { target: { value: editedValue } });

    expect(screen.getByRole("button", { name: /apply text/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard text/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply text/i }));

    expect(screen.getByText(/^Draft Notebook$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    const refreshedTextarea = screen.getByPlaceholderText(
      /paste a notebook json document/i
    ) as HTMLTextAreaElement;
    fireEvent.change(refreshedTextarea, { target: { value: originalValue } });

    await user.click(screen.getByRole("button", { name: /discard text/i }));

    expect(refreshedTextarea.value).toBe(editedValue);
  });

  it("edits a markdown cell through the per-cell source editor", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /edit source/i })[0]);

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for overview/i
    }) as HTMLTextAreaElement;
    const titleEditor = screen.getByRole("textbox", {
      name: /title editor for overview/i
    }) as HTMLInputElement;

    fireEvent.change(titleEditor, { target: { value: "Updated overview" } });
    fireEvent.change(sourceEditor, { target: { value: "Updated notebook overview." } });
    await user.click(screen.getByRole("button", { name: /apply source/i }));

    expect(screen.getByRole("heading", { name: /updated overview/i })).toBeInTheDocument();
    expect(screen.getByText(/updated notebook overview\./i)).toBeInTheDocument();
  });

  it("edits a run cell title through the per-cell source editor", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const runHeading = screen.getByRole("heading", { name: /baseline run with newton/i });
    const runArticle = runHeading.closest("article");
    expect(runArticle).not.toBeNull();
    if (!runArticle) {
      throw new Error("Expected run cell article.");
    }

    await user.click(within(runArticle).getByRole("button", { name: /edit source/i }));

    const titleEditor = screen.getByRole("textbox", {
      name: /title editor for baseline run with newton/i
    }) as HTMLInputElement;

    fireEvent.change(titleEditor, { target: { value: "Updated baseline run" } });
    await user.click(screen.getByRole("button", { name: /apply source/i }));

    expect(screen.getByRole("heading", { name: /updated baseline run/i })).toBeInTheDocument();
  });

  it("shows source helpers and live validation for chart cells", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl6-dis");

    const chartHeading = screen.getByRole("heading", { name: /baseline headline variables/i });
    const chartArticle = chartHeading.closest("article");
    expect(chartArticle).not.toBeNull();
    if (!chartArticle) {
      throw new Error("Expected chart cell article.");
    }

    await user.click(within(chartArticle).getByRole("button", { name: /edit source/i }));
    await user.click(screen.getByText(/^insert$/i));

    expect(screen.getByRole("button", { name: /add axismode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /axis snap/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shared range/i })).toBeInTheDocument();
    expect(screen.getByText(/live validation: ready to apply/i)).toBeInTheDocument();
    expect(screen.getByText(/^syntax help$/i)).toBeInTheDocument();

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for baseline headline variables/i
    });
    fireEvent.change(
      sourceEditor,
      {
        target: {
          value: `{
  "id": "baseline-chart",
  "type": "chart",
  "sourceRunCellId": "baseline-run",
  "variables": ["ydhs", "c", "p", "Mh"],
  "sharedRange": {
    "mode": "manual",
    "min": 10,
    "max": 0
  }
}`
        }
      }
    );

    expect(screen.getByText(/live validation:/i)).not.toHaveTextContent(/ready to apply/i);
  });

  it("can switch the notebook source editor into compact mode", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl6-dis");

    const chartHeading = screen.getByRole("heading", { name: /baseline headline variables/i });
    const chartArticle = chartHeading.closest("article");
    expect(chartArticle).not.toBeNull();
    if (!chartArticle) {
      throw new Error("Expected chart cell article.");
    }

    await user.click(within(chartArticle).getByRole("button", { name: /edit source/i }));
    await user.click(screen.getByRole("radio", { name: /compact/i }));

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for baseline headline variables/i
    }) as HTMLTextAreaElement;

    expect(sourceEditor.value.startsWith("{\n")).toBe(true);
    expect(sourceEditor.value).toContain('"id": "baseline-chart"');
    expect(sourceEditor.value).toContain('"seriesRanges": { "p": { "mode": "auto", "includeZero": true } }');
  });

  it("closes source popups on escape and outside click", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl6-dis");

    const chartHeading = screen.getByRole("heading", { name: /baseline headline variables/i });
    const chartArticle = chartHeading.closest("article");
    expect(chartArticle).not.toBeNull();
    if (!chartArticle) {
      throw new Error("Expected chart cell article.");
    }

    await user.click(within(chartArticle).getByRole("button", { name: /edit source/i }));
    await user.click(screen.getByRole("button", { name: /^insert$/i }));
    expect(screen.getByLabelText(/source insert actions/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText(/source insert actions/i)).not.toBeInTheDocument();

    await user.click(screen.getByText(/^syntax help$/i));
    expect(screen.getByText(/required fields:/i)).toBeInTheDocument();
  });
});
