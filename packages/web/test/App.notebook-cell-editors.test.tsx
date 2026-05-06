// @vitest-environment jsdom

import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  App,
  fireEvent,
  getNotebookSourceTextArea,
  screen,
  setNotebookSourceFormat,
  setupAppTestEnv,
  userEvent
} from "./appTestUtils";

setupAppTestEnv();

describe("App per-cell source editors", () => {
  it("edits a markdown cell through the per-cell source editor", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const overviewHeading = screen.getByRole("heading", { name: /overview/i });
    const overviewArticle = overviewHeading.closest("article");
    expect(overviewArticle).not.toBeNull();
    if (!overviewArticle) {
      throw new Error("Expected overview cell article.");
    }

    await user.click(within(overviewArticle).getByRole("button", { name: /^edit$/i }));

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for overview/i
    }) as HTMLTextAreaElement;
    const titleEditor = screen.getByRole("textbox", {
      name: /title editor for overview/i
    }) as HTMLInputElement;
    const applyButton = screen.getByRole("button", { name: /^apply$/i });

    expect(applyButton).toBeDisabled();
    expect(sourceEditor.closest(".notebook-source-editor")?.querySelector(".notebook-source-gutter")).not.toBeNull();

    fireEvent.change(titleEditor, { target: { value: "Updated overview" } });
    fireEvent.change(sourceEditor, { target: { value: "Updated notebook overview." } });
    expect(applyButton).toBeEnabled();
    await user.click(applyButton);

    expect(screen.getByRole("heading", { name: /updated overview/i })).toBeInTheDocument();
    expect(within(overviewArticle).getByText(/updated notebook overview\./i)).toBeInTheDocument();
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

    await user.click(within(runArticle).getByRole("button", { name: /^edit$/i }));

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for baseline run with newton/i
    }) as HTMLTextAreaElement;

    fireEvent.change(sourceEditor, {
      target: {
        value: sourceEditor.value.replace(
          '"title": "Baseline run with Newton"',
          '"title": "Updated baseline run"'
        )
      }
    });
    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(screen.getByRole("heading", { name: /updated baseline run/i })).toBeInTheDocument();
  });

  it("edits a matrix cell through the grid source editor", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const balanceSheetArticle = document.getElementById("balance-sheet");
    expect(balanceSheetArticle).not.toBeNull();
    if (!(balanceSheetArticle instanceof HTMLElement)) {
      throw new Error("Expected balance sheet matrix article.");
    }

    await user.click(within(balanceSheetArticle).getByRole("button", { name: /^edit$/i }));

    expect(
      within(balanceSheetArticle).queryByRole("textbox", {
        name: /source editor for bmw balance sheet/i
      })
    ).not.toBeInTheDocument();

    const firstColumnInput = within(balanceSheetArticle).getByRole("textbox", {
      name: /matrix column 1/i
    }) as HTMLInputElement;
    const firstSectorInput = within(balanceSheetArticle).getByRole("textbox", {
      name: /matrix sector 1/i
    }) as HTMLInputElement;

    expect(
      within(balanceSheetArticle).getByRole("button", {
        name: /move matrix column 1 right/i
      })
    ).toBeInTheDocument();
    expect(
      within(balanceSheetArticle).getByRole("button", {
        name: /move matrix row 1 down/i
      })
    ).toBeInTheDocument();

    fireEvent.change(firstColumnInput, { target: { value: "Households edited" } });
    fireEvent.change(firstSectorInput, { target: { value: "Households sector edited" } });
    await user.click(within(balanceSheetArticle).getByRole("button", { name: /^apply$/i }));

    expect(within(balanceSheetArticle).getByText(/households edited/i)).toBeInTheDocument();
  });

  it("does not leak linked equation drafts into notebook source before apply", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));
    await user.click(within(equationsCell).getByRole("button", { name: /^edit$/i }));

    const firstVariableInput = within(equationsCell).getByRole("textbox", {
      name: /equation 1 variable/i
    }) as HTMLTextAreaElement;
    const originalValue = firstVariableInput.value;
    const draftValue = `${originalValue}Draft`;

    fireEvent.change(firstVariableInput, { target: { value: draftValue } });
    expect(within(equationsCell).getByRole("button", { name: /^apply$/i })).toBeEnabled();

    await setNotebookSourceFormat(user, "json");
    const draftExport = getNotebookSourceTextArea();
    expect(draftExport.value).not.toContain(`"name": "${draftValue}"`);
  });

  it("discards linked equation drafts on cancel", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));
    await user.click(within(equationsCell).getByRole("button", { name: /^edit$/i }));

    const firstVariableInput = within(equationsCell).getByRole("textbox", {
      name: /equation 1 variable/i
    }) as HTMLTextAreaElement;
    const originalValue = firstVariableInput.value;
    const draftValue = `${originalValue}Draft`;

    fireEvent.change(firstVariableInput, { target: { value: draftValue } });

    await user.click(within(equationsCell).getByRole("button", { name: /^cancel$/i }));
    await user.click(within(equationsCell).getByRole("button", { name: /^edit$/i }));

    expect(
      (within(equationsCell).getByRole("textbox", {
        name: /equation 1 variable/i
      }) as HTMLTextAreaElement).value
    ).toBe(originalValue);
  });

  it("applies linked equation edits into notebook source", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));
    await user.click(within(equationsCell).getByRole("button", { name: /^edit$/i }));

    const firstVariableInput = within(equationsCell).getByRole("textbox", {
      name: /equation 1 variable/i
    }) as HTMLTextAreaElement;
    const draftValue = `${firstVariableInput.value}Draft`;

    fireEvent.change(within(equationsCell).getByRole("textbox", { name: /equation 1 variable/i }), {
      target: { value: draftValue }
    });
    await user.click(within(equationsCell).getByRole("button", { name: /^apply$/i }));

    await setNotebookSourceFormat(user, "json");
    expect(getNotebookSourceTextArea().value).toContain(`"name": "${draftValue}"`);
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

    await user.click(within(chartArticle).getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByText(/^insert$/i));

    expect(screen.getByRole("button", { name: /add axismode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /axis snap/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shared range/i })).toBeInTheDocument();
    expect(screen.getByText(/live validation: ready to apply/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^help$/i })).toBeInTheDocument();

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for baseline headline variables/i
    });
    fireEvent.change(sourceEditor, {
      target: {
        value: `{
  "id": "baseline-chart",
  "type": "chart",
  "sourceRunCellId": "baseline-run",
  "variables": ["ydhs", "c", "p", "Mh"],
  "sharedRange": {
    "min": 10,
    "max": 0
  }
}`
      }
    });

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

    await user.click(within(chartArticle).getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("radio", { name: /compact/i }));

    const sourceEditor = screen.getByRole("textbox", {
      name: /source editor for baseline headline variables/i
    }) as HTMLTextAreaElement;

    expect(sourceEditor.value.startsWith("{\n")).toBe(true);
    expect(sourceEditor.value).toContain('"id": "baseline-chart"');
    expect(sourceEditor.value).toContain('"seriesRanges": { "p": { "includeZero": true } }');
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

    await user.click(within(chartArticle).getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /^insert$/i }));
    expect(screen.getByLabelText(/source insert actions/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText(/source insert actions/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^help$/i }));
    expect(screen.getByText(/required fields:/i)).toBeInTheDocument();
  });
});
