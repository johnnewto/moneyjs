// @vitest-environment jsdom

import { render, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  App,
  fireEvent,
  getFormulaTokensByText,
  notebookRunnerMock,
  screen,
  clickForDeferredVariableInspect,
  expectVariableInspectorOpen,
  setSuccessfulNotebookRunner,
  setupAppTestEnv,
  userEvent
} from "./appTestUtils";

setupAppTestEnv();

describe("App notebook navigation and inspection", () => {
  it("renders the BMW notebook route", async () => {
    window.location.hash = "#/notebook";

    render(<App />);

    const templatePicker = screen.getByRole("combobox", { name: /notebook template/i });
    const templateOptions = within(templatePicker).getAllByRole("option");

    expect(templatePicker).toHaveValue("bmw");
    expect(templateOptions[0]).toHaveValue("sim");
    expect(templateOptions[1]).toHaveValue("bmw");
    expect(screen.getAllByText(/bmw browser notebook/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^run all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /validate/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chat builder/i })).toHaveAttribute("href", "#/chat-builder");
    expect(screen.getByRole("heading", { name: /bmw balance sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /bmw transactions-flow matrix/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /bmw transaction flow sequence/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /baseline run with newton/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^show$/i }).length).toBeGreaterThan(0);
  }, 10000);

  it("shows BMW equation details after expanding the model cell", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));

    expect(within(equationsCell).getAllByText("Variable").length).toBeGreaterThan(0);
    expect(within(equationsCell).getAllByText("Expression").length).toBeGreaterThan(0);

    const yToken = within(equationsCell)
      .getAllByText("Y")
      .find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node.classList.contains("formula-token")
      );
    expect(yToken).toBeDefined();
    if (!yToken) {
      throw new Error("Expected formula token for Y");
    }

    fireEvent.mouseEnter(yToken);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Income = GDP");
  });

  it("shows a larger equation syntax dialog from help while editing equations", async () => {
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
    await user.click(within(equationsCell).getByRole("button", { name: /^help$/i }));

    const dialog = screen.getByRole("dialog", { name: /equation syntax/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/core forms/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/I\(flowExpr\)/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/stock-flow guidance/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/equation roles/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Auto/)).toBeInTheDocument();
    expect(within(dialog).getByText(/inferred from the equation structure and description/i)).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: /equation syntax/i })).not.toBeInTheDocument();
  }, 15000);

  it("can show external values inside the notebook equations cell expression view", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));

    expect(getFormulaTokensByText(equationsCell, "α0")).toHaveLength(0);
    expect(getFormulaTokensByText(equationsCell, "α1")).toHaveLength(0);
    expect(
      within(equationsCell)
        .getAllByText("20")
        .some((node) => node.className.includes("formula-token"))
    ).toBe(true);
    expect(
      within(equationsCell)
        .getAllByText("0.75")
        .some((node) => node.className.includes("formula-token"))
    ).toBe(true);

    await user.click(within(equationsCell).getByRole("button", { name: /show external names/i }));

    expect(getFormulaTokensByText(equationsCell, "α0").length).toBeGreaterThan(0);
    expect(getFormulaTokensByText(equationsCell, "α1").length).toBeGreaterThan(0);

    await user.click(within(equationsCell).getByRole("button", { name: /show external values/i }));

    expect(getFormulaTokensByText(equationsCell, "α0")).toHaveLength(0);
    expect(getFormulaTokensByText(equationsCell, "α1")).toHaveLength(0);
  });

  it("dims other notebook cells while a linked editor is active", async () => {
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

    const notebookSheet = screen.getByRole("region", { name: /notebook sheet/i });
    expect(notebookSheet.className).toContain("notebook-has-active-editor");
    expect(equationsCell.className).toContain("notebook-cell-is-active-editor");
    await user.click(screen.getByRole("tab", { name: /^contents$/i }));
    const activeOutlineItem = screen
      .getAllByRole("button", { name: /bmw model/i })
      .map((button) => button.closest("li"))
      .find((item): item is HTMLLIElement => item instanceof HTMLLIElement);
    expect(activeOutlineItem?.className).toContain("notebook-outline-item-is-active");

    await user.click(within(equationsCell).getByRole("button", { name: /^cancel$/i }));
    expect(notebookSheet.className).not.toContain("notebook-has-active-editor");
    expect(equationsCell.className).not.toContain("notebook-cell-is-active-editor");
  }, 15000);

  it("auto-runs notebook cells on load", async () => {
    window.location.hash = "#/notebook";

    render(<App />);

    await waitFor(() => {
      expect(notebookRunnerMock.runAll).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a toast with wall time after running all notebook cells", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    notebookRunnerMock.runAll.mockClear();

    await user.click(screen.getByRole("button", { name: /^run all$/i }));

    await waitFor(() => {
      expect(notebookRunnerMock.runAll).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent(/ran all notebook cells in /i);
    });
  });

  it("opens the notebook rail on the contents tab by default", () => {
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("button", { name: /bmw model/i }).length).toBeGreaterThan(0);
  });

  it("supports right-click cell actions for moving and deleting notebook cells", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const introCell = document.getElementById("intro");
    expect(introCell).toBeInstanceOf(HTMLElement);
    if (!(introCell instanceof HTMLElement)) {
      throw new Error("Expected intro notebook cell article.");
    }

    fireEvent.contextMenu(introCell);

    const initialMenu = screen.getByRole("menu", { name: /cell actions for overview/i });
    expect(within(initialMenu).getByRole("menuitem", { name: /move up/i })).toBeDisabled();

    await user.click(within(initialMenu).getByRole("menuitem", { name: /move down/i }));

    const cellsAfterMove = Array.from(document.querySelectorAll(".notebook-canvas article"));
    expect(cellsAfterMove[1]).toHaveAttribute("id", "intro");

    const movedIntroCell = document.getElementById("intro");
    expect(movedIntroCell).toBeInstanceOf(HTMLElement);
    if (!(movedIntroCell instanceof HTMLElement)) {
      throw new Error("Expected moved intro notebook cell article.");
    }

    fireEvent.contextMenu(movedIntroCell);

    const movedMenu = screen.getByRole("menu", { name: /cell actions for overview/i });
    await user.click(within(movedMenu).getByRole("menuitem", { name: /delete/i }));
    const deleteDialog = screen.getByRole("dialog", { name: /delete overview/i });
    expect(deleteDialog).toHaveTextContent(/delete overview from this notebook/i);

    await user.click(within(deleteDialog).getByRole("button", { name: /cancel/i }));
    expect(document.getElementById("intro")).not.toBeNull();

    fireEvent.contextMenu(movedIntroCell);
    await user.click(within(screen.getByRole("menu", { name: /cell actions for overview/i })).getByRole("menuitem", { name: /delete/i }));
    await user.click(within(screen.getByRole("dialog", { name: /delete overview/i })).getByRole("button", { name: /^delete$/i }));

    expect(document.getElementById("intro")).toBeNull();
    expect(screen.queryByRole("heading", { name: /^overview$/i })).not.toBeInTheDocument();
  });

  it("supports adding notebook cells from the right-click type picker", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    const introCell = document.getElementById("intro");
    expect(introCell).toBeInstanceOf(HTMLElement);
    if (!(introCell instanceof HTMLElement)) {
      throw new Error("Expected intro notebook cell article.");
    }

    fireEvent.contextMenu(introCell);
    const introMenu = screen.getByRole("menu", { name: /cell actions for overview/i });

    fireEvent.mouseEnter(within(introMenu).getByRole("menuitem", { name: /add cell/i }));
    const introInsertMenu = screen.getByRole("menu", { name: /add cell below options/i });

    expect(within(introInsertMenu).getByRole("menuitem", { name: /^run$/i })).toBeEnabled();
    expect(within(introInsertMenu).getByRole("menuitem", { name: /^chart$/i })).toBeEnabled();

    await user.click(within(introInsertMenu).getByRole("menuitem", { name: /^markdown$/i }));

    const cellsAfterMarkdownInsert = Array.from(document.querySelectorAll(".notebook-canvas article"));
    expect(cellsAfterMarkdownInsert[1]).toHaveAttribute("id", "note");
    expect(screen.getByRole("heading", { name: /^new note$/i })).toBeInTheDocument();

    const noteCell = document.getElementById("note");
    expect(noteCell).toBeInstanceOf(HTMLElement);
    if (!(noteCell instanceof HTMLElement)) {
      throw new Error("Expected inserted note cell article.");
    }

    fireEvent.contextMenu(noteCell);
    const noteMenu = screen.getByRole("menu", { name: /cell actions for new note/i });
    fireEvent.mouseEnter(within(noteMenu).getByRole("menuitem", { name: /add cell/i }));
    const noteInsertMenu = screen.getByRole("menu", { name: /add cell below options/i });
    await user.click(within(noteInsertMenu).getByRole("menuitem", { name: /^chart$/i }));

    const cellsAfterChartInsert = Array.from(document.querySelectorAll(".notebook-canvas article"));
    expect(cellsAfterChartInsert[2]).toHaveAttribute("id", "chart");
    expect(screen.getByRole("heading", { name: /^new chart$/i })).toBeInTheDocument();
  });

  it("switches the notebook rail back to the contents tab", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));

    expect(screen.queryByRole("button", { name: /bmw model/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^contents$/i }));

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("button", { name: /bmw model/i }).length).toBeGreaterThan(0);
  }, 15000);

  it("renders BMW transaction-flow matrix values with flow units inferred from the full expression", () => {
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell).not.toBeNull();
    if (!matrixCell) {
      throw new Error("Expected BMW transactions-flow matrix article.");
    }

    const interestDepositsRow = within(matrixCell).getByText("Interest on deposits").closest("tr");
    expect(interestDepositsRow).not.toBeNull();
    expect(interestDepositsRow?.textContent).toContain("-rm[-1] * Ms[-1]");
    expect(interestDepositsRow?.textContent).toMatch(/= \$[0-9.,]+\/yr/);

    const changeDepositsRow = within(matrixCell).getByText("Ch. deposits").closest("tr");
    expect(changeDepositsRow).not.toBeNull();
    expect(changeDepositsRow?.textContent).toContain("-d(Mh)");
    expect(changeDepositsRow?.textContent).toMatch(/= \$[0-9.,]+\/yr/);
  });

  it("opens the notebook variable inspector from the baseline variable summary table", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const summaryHeading = screen.getAllByRole("heading", { name: /baseline variable summary/i })[0];
    const summaryCell = summaryHeading.closest("article");
    expect(summaryCell).not.toBeNull();
    if (!summaryCell) {
      throw new Error("Expected baseline variable summary article.");
    }

    await user.click(within(summaryCell).getByRole("button", { name: /^Y\b/i }));

    expect(screen.getByText("Selected variable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Y\b/i })).toBeInTheDocument();
    expect(screen.getAllByText(/income = gdp/i).length).toBeGreaterThan(0);
    expect(document.querySelector("code.inspector-equation")).toHaveTextContent(/Y.*=\s*Cs\s*\+\s*Is/);
  });

  it("opens the notebook variable inspector from markdown variable mentions", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const scenarioHeading = screen.getByRole("heading", { name: /^scenario 1$/i });
    const scenarioArticle = scenarioHeading.closest("article");
    expect(scenarioArticle).not.toBeNull();
    if (!(scenarioArticle instanceof HTMLElement)) {
      throw new Error("Expected scenario markdown article.");
    }

    await user.click(
      within(scenarioArticle).getByRole("button", { name: /^Inspect variable alpha0$/i })
    );

    expect(screen.getByText("Selected variable")).toBeInTheDocument();
    const inspectorHeading = document.querySelector(".variable-inspector-panel h3");
    expect(inspectorHeading).not.toBeNull();
    expect(inspectorHeading?.textContent).toMatch(/α|alpha/i);
    expect(inspectorHeading?.querySelector("sub")?.textContent).toBe("0");
  });

  it("opens the notebook variable inspector from scenario run shock variables", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const scenarioRunHeading = screen.getByRole("heading", {
      name: /scenario 1: autonomous consumption shock/i
    });
    const scenarioRunArticle = scenarioRunHeading.closest("article");
    expect(scenarioRunArticle).not.toBeNull();
    if (!(scenarioRunArticle instanceof HTMLElement)) {
      throw new Error("Expected scenario run article.");
    }

    const shockVariableList = within(scenarioRunArticle).getByRole("list");

    await user.click(
      within(shockVariableList).getByRole("button", { name: /^Inspect variable alpha0$/i })
    );

    expect(screen.getByText("Selected variable")).toBeInTheDocument();
    const inspectorHeading = document.querySelector(".variable-inspector-panel h3");
    expect(inspectorHeading).not.toBeNull();
    expect(inspectorHeading?.textContent).toMatch(/α|alpha/i);
    expect(inspectorHeading?.querySelector("sub")?.textContent).toBe("0");
  });

  it("opens the notebook variable inspector from the model equations table", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected BMW equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));
    expect(within(equationsCell).getByText(/^Role$/i)).toBeInTheDocument();

    const yRowButton = within(equationsCell).getByRole("button", { name: /^Y\b/i });
    const yRow = yRowButton.closest('[role="row"]');
    expect(yRow).not.toBeNull();
    if (!(yRow instanceof HTMLElement)) {
      throw new Error("Expected Y row in model equations table.");
    }
    expect(within(yRow).getByText(/^Identity$/i)).toBeInTheDocument();

    fireEvent.click(yRowButton);
    await expectVariableInspectorOpen();

    const inspectorHeading = screen.getByRole("heading", { name: /^Y\b/i });
    expect(inspectorHeading).toBeInTheDocument();
    const selectedVariableLabel = screen.getByText(/^Selected variable$/i);
    const inspector = selectedVariableLabel.closest(".variable-inspector-panel");
    expect(inspector).not.toBeNull();
    if (!(inspector instanceof HTMLElement)) {
      throw new Error("Expected variable inspector container.");
    }

    expect(within(inspector).getByText(/^Endogenous$/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/^Flow$/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/^Equation role$/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/^Identity$/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/^Declared$/i)).toBeInTheDocument();
  }, 15000);

  it("edits the defining equation expression from the inspect panel", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected BMW equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));
    const yRowButton = within(equationsCell).getByRole("button", { name: /^Y\b/i });
    fireEvent.click(yRowButton);
    await expectVariableInspectorOpen();

    const inspector = screen.getByText(/^Selected variable$/i).closest(".variable-inspector-panel");
    expect(inspector).not.toBeNull();
    if (!(inspector instanceof HTMLElement)) {
      throw new Error("Expected variable inspector container.");
    }

    await user.click(within(inspector).getByRole("checkbox", { name: /^Edit expression$/i }));
    const expressionField = within(inspector).getByRole("textbox", { name: /^Expression for Y$/i });
    fireEvent.change(expressionField, { target: { value: "Cs + Is + G" } });
    await user.click(within(inspector).getByRole("button", { name: /^Apply$/i }));

    const inspectorEquation = inspector.querySelector(".inspector-equation-display");
    expect(inspectorEquation?.textContent).toMatch(/Cs/);
    expect(inspectorEquation?.textContent).toMatch(/Is/);
    expect(inspectorEquation?.textContent).toMatch(/G/);

    const yRowAfterEdit = within(equationsCell).getByRole("button", { name: /^Y\b/i }).closest('[role="row"]');
    expect(yRowAfterEdit?.textContent).toMatch(/G/);
  }, 15000);

  it("shows variable descriptions for lowercase rate tokens in the BMW transaction-flow matrix", async () => {
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell).not.toBeNull();
    if (!matrixCell) {
      throw new Error("Expected BMW transactions-flow matrix article.");
    }

    const rmToken = within(matrixCell)
      .getAllByText("rm")
      .find((node) => node.className.includes("formula-token"));
    expect(rmToken).toBeDefined();
    if (!rmToken) {
      throw new Error("Expected matrix token for rm.");
    }

    fireEvent.mouseEnter(rmToken);
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Rate of interest on bank deposits");
    });
    expect(screen.getByRole("tooltip").textContent).toMatch(/Rate of interest on bank deposits.*1\/yr/i);
    fireEvent.mouseLeave(rmToken);
  });

  it("edits a matrix entry inline in the run view with per-cell apply and cancel", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell).not.toBeNull();
    if (!matrixCell) {
      throw new Error("Expected BMW transactions-flow matrix article.");
    }

    const consumptionRow = within(matrixCell).getByText("Consumption").closest("tr");
    expect(consumptionRow).not.toBeNull();
    if (!consumptionRow) {
      throw new Error("Expected consumption row in BMW transaction-flow matrix.");
    }

    const firmsDemandEntry = within(consumptionRow)
      .getAllByTitle("Double-click to edit")
      .find((node) => node.textContent?.includes("Cd"));
    expect(firmsDemandEntry).toBeDefined();
    if (!firmsDemandEntry) {
      throw new Error("Expected editable +Cd matrix entry.");
    }
    fireEvent.doubleClick(firmsDemandEntry);

    const entryInput = within(matrixCell).getByRole("textbox", {
      name: /matrix entry for row/i
    });
    expect(entryInput).toHaveValue("+Cd");

    fireEvent.change(entryInput, { target: { value: "+CdEdited" } });
    await user.click(within(matrixCell).getByRole("button", { name: /^apply$/i }));

    const updatedEntry = within(consumptionRow)
      .getAllByTitle("Double-click to edit")
      .find((node) => node.textContent?.includes("CdEdited"));
    expect(updatedEntry).toBeDefined();
    expect(within(matrixCell).queryByRole("button", { name: /^apply$/i })).not.toBeInTheDocument();

    if (!updatedEntry) {
      throw new Error("Expected editable +CdEdited matrix entry for cancel test.");
    }
    fireEvent.doubleClick(updatedEntry);
    const cancelInput = within(matrixCell).getByRole("textbox", {
      name: /matrix entry for row/i
    });
    fireEvent.change(cancelInput, { target: { value: "+CdDraft" } });
    await user.click(within(matrixCell).getByRole("button", { name: /^cancel$/i }));

    expect(
      within(consumptionRow)
        .getAllByTitle("Double-click to edit")
        .some((node) => node.textContent?.includes("CdEdited"))
    ).toBe(true);
    expect(
      within(consumptionRow)
        .getAllByTitle("Double-click to edit")
        .some((node) => node.textContent?.includes("CdDraft"))
    ).toBe(false);
  });

  it("edits an equation row inline without opening cell edit mode", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!equationsCell) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));

    const yRowButton = within(equationsCell).getByRole("button", { name: /^Y\b/i });
    const yRow = yRowButton.closest('[role="row"]');
    expect(yRow).not.toBeNull();
    if (!yRow) {
      throw new Error("Expected Y equation row.");
    }

    const yExpression = within(yRow)
      .getAllByTitle("Double-click to edit")
      .find((node) => node.classList.contains("notebook-model-view-expression"));
    expect(yExpression).toBeDefined();
    if (!yExpression) {
      throw new Error("Expected Y expression cell.");
    }
    fireEvent.doubleClick(yExpression);

    const expressionInput = within(equationsCell).getByRole("textbox", {
      name: /equation \d+ expression/i
    });
    fireEvent.change(expressionInput, { target: { value: "WBd + AF + 1" } });
    await user.click(within(equationsCell).getByRole("button", { name: /^apply$/i }));

    expect(yRow.textContent).toMatch(/AF \+ 1/);
    expect(within(equationsCell).queryByRole("button", { name: /^edit$/i })).toBeInTheDocument();
  });

  it("renames a variable only in the edited row when rename dialog answer is No", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!equationsCell) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));

    const yRowButton = within(equationsCell).getByRole("button", { name: /^Y\b/i });
    const yRow = yRowButton.closest('[role="row"]');
    expect(yRow).not.toBeNull();
    if (!yRow) {
      throw new Error("Expected Y equation row.");
    }

    fireEvent.doubleClick(within(yRow).getAllByTitle("Double-click to edit")[0] ?? yRowButton);

    const variableInput = within(equationsCell).getByRole("textbox", {
      name: /equation \d+ variable/i
    });
    fireEvent.change(variableInput, { target: { value: "YOnly" } });
    await user.click(within(equationsCell).getByRole("button", { name: /^apply$/i }));

    expect(screen.getByRole("dialog", { name: /rename variable across notebook/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^no$/i }));

    expect(within(equationsCell).getByRole("button", { name: /^YOnly\b/i })).toBeInTheDocument();
    const cdRow = within(equationsCell).getByRole("button", { name: /^Cd\b/i }).closest('[role="row"]');
    expect(cdRow?.textContent).toMatch(/YD/);
    expect(cdRow?.textContent).not.toMatch(/YOnly/);
  });

  it("renames a variable across the model when rename dialog answer is Yes", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!equationsCell) {
      throw new Error("Expected equations cell article.");
    }

    await user.click(within(equationsCell).getByRole("button", { name: /^show$/i }));

    const mhRowButton = within(equationsCell).getByRole("button", { name: /^Mh\b/i });
    const mhRow = mhRowButton.closest('[role="row"]');
    expect(mhRow).not.toBeNull();
    if (!mhRow) {
      throw new Error("Expected Mh equation row.");
    }

    fireEvent.doubleClick(within(mhRow).getAllByTitle("Double-click to edit")[0] ?? mhRowButton);

    const variableInput = within(equationsCell).getByRole("textbox", {
      name: /equation \d+ variable/i
    });
    fireEvent.change(variableInput, { target: { value: "Mh2" } });
    await user.click(within(equationsCell).getByRole("button", { name: /^apply$/i }));

    expect(screen.getByRole("dialog", { name: /rename variable across notebook/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    expect(within(equationsCell).getByRole("button", { name: /^Mh2\b/i })).toBeInTheDocument();
    const cdRow = within(equationsCell).getByRole("button", { name: /^Cd\b/i }).closest('[role="row"]');
    expect(cdRow?.textContent).toMatch(/Mh2/);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell?.textContent).toMatch(/Mh2/);
  });

  it("opens the notebook variable inspector from matrix table variables", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell).not.toBeNull();
    if (!matrixCell) {
      throw new Error("Expected BMW transactions-flow matrix article.");
    }

    const rmToken = within(matrixCell)
      .getAllByText("rm")
      .find((node) => node.className.includes("formula-token"));
    expect(rmToken).toBeDefined();
    if (!rmToken) {
      throw new Error("Expected matrix token for rm.");
    }

    await clickForDeferredVariableInspect(rmToken);

    const inspectorHeading = screen.getByRole("heading", { name: /^rm\b/i });
    expect(inspectorHeading).toBeInTheDocument();
    const selectedVariableLabel = screen.getByText(/^Selected variable$/i);
    const inspector = selectedVariableLabel.closest(".variable-inspector-panel");
    expect(inspector).not.toBeNull();
    if (!(inspector instanceof HTMLElement)) {
      throw new Error("Expected variable inspector container.");
    }

    expect(within(inspector).getByText(/^Accounting terms$/i)).toBeInTheDocument();
    const affectedEquationsHeading = within(inspector).getByText(/^Affected equations$/i);
    expect(affectedEquationsHeading).toBeInTheDocument();
    expect(within(inspector).getByText(/^rm\*Mh$/i)).toBeInTheDocument();
    expect(within(inspector).getByText(/^rm\*Ms$/i)).toBeInTheDocument();
    const affectedEquationsSection = affectedEquationsHeading.closest(".inspector-section");
    expect(affectedEquationsSection).not.toBeNull();
    if (!(affectedEquationsSection instanceof HTMLElement)) {
      throw new Error("Expected affected equations section.");
    }
    expect(
      within(affectedEquationsSection).getAllByRole("button", { name: /^Inspect variable YD$/i }).length
    ).toBeGreaterThanOrEqual(2);

    const ydEquation = within(affectedEquationsSection)
      .getAllByRole("code")
      .find((node) => node.textContent?.includes("YD"));
    expect(ydEquation).toBeDefined();
    if (!ydEquation) {
      throw new Error("Expected affected equation code block for YD.");
    }
    await user.click(within(ydEquation).getByRole("button", { name: /^Inspect variable YD$/i }));
    expect(screen.getByRole("heading", { name: /^YD\b/i })).toBeInTheDocument();

    fireEvent.click(rmToken);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^rm\b/i })).toBeInTheDocument();
    });
    expect(inspector.querySelector(".inspector-related-equation.trace-output")).not.toBeNull();

    const mhToken = within(affectedEquationsSection)
      .getAllByText("Mh")
      .find((node) => node.className.includes("formula-token"));
    expect(mhToken).toBeDefined();
    if (!mhToken) {
      throw new Error("Expected inspector RHS token for Mh.");
    }

    fireEvent.mouseEnter(mhToken);
    const inspectorTooltip = screen.getAllByRole("tooltip").at(-1);
    expect(inspectorTooltip).toBeDefined();
    if (!inspectorTooltip) {
      throw new Error("Expected inspector tooltip.");
    }
    expect(inspectorTooltip).toHaveTextContent("Bank deposits held by households");
    expect(inspectorTooltip).toHaveTextContent("Bank deposits held by households : $0");
  }, 15000);

  it("navigates notebook variable inspector history with go back and go forward", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell).not.toBeNull();
    if (!matrixCell) {
      throw new Error("Expected BMW transactions-flow matrix article.");
    }

    const rmToken = within(matrixCell)
      .getAllByText("rm")
      .find((node) => node.className.includes("formula-token"));
    expect(rmToken).toBeDefined();
    if (!rmToken) {
      throw new Error("Expected matrix token for rm.");
    }

    await clickForDeferredVariableInspect(rmToken);

    const inspector = screen.getByText(/^Selected variable$/i).closest(".variable-inspector-panel");
    expect(inspector).not.toBeNull();
    if (!(inspector instanceof HTMLElement)) {
      throw new Error("Expected variable inspector container.");
    }

    const backButton = within(inspector).getByRole("button", { name: /^Go back$/i });
    const forwardButton = within(inspector).getByRole("button", { name: /^Go forward$/i });
    expect(backButton).toHaveAttribute("title", "Go back");
    expect(forwardButton).toHaveAttribute("title", "Go forward");
    expect(backButton).toBeDisabled();
    expect(forwardButton).toBeDisabled();

    const affectedEquationsHeading = within(inspector).getByText(/^Affected equations$/i);
    const affectedEquationsSection = affectedEquationsHeading.closest(".inspector-section");
    expect(affectedEquationsSection).not.toBeNull();
    if (!(affectedEquationsSection instanceof HTMLElement)) {
      throw new Error("Expected affected equations section.");
    }

    const ydEquation = within(affectedEquationsSection)
      .getAllByRole("code")
      .find((node) => node.textContent?.includes("YD"));
    expect(ydEquation).toBeDefined();
    if (!ydEquation) {
      throw new Error("Expected affected equation code block for YD.");
    }

    await user.click(within(ydEquation).getByRole("button", { name: /^Inspect variable YD$/i }));
    expect(screen.getByRole("heading", { name: /^YD\b/i })).toBeInTheDocument();
    expect(backButton).not.toBeDisabled();
    expect(forwardButton).toBeDisabled();

    await user.click(backButton);
    expect(screen.getByRole("heading", { name: /^rm\b/i })).toBeInTheDocument();
    expect(backButton).toBeDisabled();
    expect(forwardButton).not.toBeDisabled();

    await user.click(forwardButton);
    expect(screen.getByRole("heading", { name: /^YD\b/i })).toBeInTheDocument();
    expect(backButton).not.toBeDisabled();
    expect(forwardButton).toBeDisabled();
  }, 15000);

  it("opens the notebook variable inspector from dependency graph nodes", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const dependencyHeading = screen.getByRole("heading", { name: /bmw equation dependency graph/i });
    const dependencyCell = dependencyHeading.closest("article");
    expect(dependencyCell).not.toBeNull();
    if (!(dependencyCell instanceof HTMLElement)) {
      throw new Error("Expected BMW equation dependency graph article.");
    }

    await user.click(within(dependencyCell).getByRole("button", { name: /^show$/i }));

    await user.click(within(dependencyCell).getByText(/^rm$/i));

    expect(screen.getByText("Selected variable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^rm\b/i })).toBeInTheDocument();
    const inspectorHeading = screen.getByText(/^Selected variable$/i);
    const inspector = inspectorHeading.closest(".variable-inspector-panel");
    expect(inspector).not.toBeNull();
    if (!(inspector instanceof HTMLElement)) {
      throw new Error("Expected variable inspector container.");
    }
    const affectedEquationsHeading = within(inspector).getByText(/^Affected equations$/i);
    const affectedEquationsSection = affectedEquationsHeading.closest(".inspector-section");
    expect(affectedEquationsSection).not.toBeNull();
    if (!(affectedEquationsSection instanceof HTMLElement)) {
      throw new Error("Expected affected equations section.");
    }
    expect(
      within(affectedEquationsSection).getAllByRole("button", { name: /^Inspect variable YD$/i }).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("loads a notebook template from the hash path", () => {
    window.location.hash = "#/notebook/gl2-pc";

    render(<App />);

    expect(screen.getAllByText(/gl2 pc notebook/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /pc balance sheet/i })).toBeInTheDocument();
  });

  it("switches notebook templates from the command bar", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getAllByText(/bmw browser notebook/i).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl6-dis");

    expect(screen.getAllByText(/gl6 dis notebook/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /dis balance sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dis transactions-flow matrix/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dis equation dependency graph/i })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^dis model$/i }).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe("#/notebook/gl6-dis");
  });

  it("renders notebook contents titles through the shared math label component", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "opensimplest-levy");
    await user.click(screen.getByRole("tab", { name: /^contents$/i }));

    const outlinePanel = document.getElementById("notebook-outline-panel");
    expect(outlinePanel).not.toBeNull();
    if (!(outlinePanel instanceof HTMLElement)) {
      throw new Error("Expected notebook outline panel.");
    }

    expect(within(outlinePanel).getByText(/^overview$/i).closest(".variable-math-label")).not.toBeNull();
    expect(screen.getAllByText(/opensi?mplest levy/i).length).toBeGreaterThan(0);
  });

  it("enables the sectors strip-source button when active matrices provide sectors", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl6-dis");

    const sequenceHeading = screen.getByRole("heading", { name: /dis equation dependency graph/i });
    const sequenceCell = sequenceHeading.closest("article");
    expect(sequenceCell).not.toBeNull();
    if (!(sequenceCell instanceof HTMLElement)) {
      throw new Error("Expected DIS equation dependency graph article.");
    }

    const showButton = within(sequenceCell).queryByRole("button", { name: /^show$/i });
    if (showButton) {
      await user.click(showButton);
    }

    expect(within(sequenceCell).getByRole("button", { name: /^columns$/i })).toBeEnabled();
  });

  it("renders separate externals and initial-values cells for the growth notebook", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/notebook template/i), "gl8-growth");

    expect(screen.getAllByText(/gl8 growth notebook/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: /^externals$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: /initial values/i }).length).toBeGreaterThan(0);

    const externalsCell = screen
      .getAllByRole("heading", { name: /^externals$/i })
      .map((heading) => heading.closest("article"))
      .find((article): article is HTMLElement => article instanceof HTMLElement);
    expect(externalsCell).not.toBeNull();
    if (!externalsCell) {
      throw new Error("Expected externals cell article.");
    }

    expect(within(externalsCell).getByRole("button", { name: /^show$/i })).toBeInTheDocument();
    expect(within(externalsCell).queryByRole("button", { name: /add external/i })).not.toBeInTheDocument();

    await user.click(within(externalsCell).getByRole("button", { name: /^show$/i }));

    expect(within(externalsCell).getByRole("button", { name: /^hide$/i })).toBeInTheDocument();
    expect(within(externalsCell).getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    await user.click(within(externalsCell).getByRole("button", { name: /^edit$/i }));
    expect(within(externalsCell).getByRole("button", { name: /add external/i })).toBeInTheDocument();
  });
});
