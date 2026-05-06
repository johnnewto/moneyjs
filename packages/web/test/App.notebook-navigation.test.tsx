// @vitest-environment jsdom

import { render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  App,
  bmwNotebookBaselineResult,
  fireEvent,
  getFormulaTokensByText,
  notebookRunnerMock,
  screen,
  setSuccessfulNotebookRunner,
  setupAppTestEnv,
  userEvent
} from "./appTestUtils";

setupAppTestEnv();

describe("App notebook navigation and inspection", () => {
  it("renders the BMW notebook route", async () => {
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByRole("combobox", { name: /notebook template/i })).toHaveValue("bmw");
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

    const equationsHelpText = within(equationsCell).getByText(
      /hover previews inputs\. click shows both, shift\+click pins outputs, ctrl\/cmd\+click pins inputs\./i
    );
    expect(equationsHelpText).not.toBeVisible();

    await user.click(within(equationsCell).getByText(/^help$/i));
    expect(equationsHelpText).toBeVisible();
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
  });

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
  });

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

  it("switches the notebook rail back to the contents tab", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));

    expect(screen.queryByRole("button", { name: /bmw model/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^contents$/i }));

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("button", { name: /bmw model/i }).length).toBeGreaterThan(0);
  });

  it("asks the notebook assistant with current notebook context", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "http://localhost:8787/v1/notebook-assistant/ask") {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta:
              "The BMW notebook includes:\n\n- equations\n- solver options\n\nVariable `Y` is the income anchor.\n\nX = exp(epsilon0 + epsilon1 * log(lag(XR)) + epsilon2 * log(Yf))\n\n| Area | Included |\n| --- | --- |\n| Matrices | yes |"
          })}\n\n`,
          {
            headers: {
              "Content-Type": "text/event-stream"
            }
          }
        );
      }

      throw new Error(`Unexpected fetch call: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.type(screen.getByLabelText(/beta password/i), "beta-test-password");
    await user.type(screen.getByRole("textbox", { name: /question/i }), "What is this notebook?");
    await user.click(screen.getByRole("button", { name: /^ask$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8787/v1/notebook-assistant/ask",
        expect.any(Object)
      );
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body)) as {
      betaPassword?: string;
      context?: string;
      model?: string;
      question?: string;
    };
    expect(body.betaPassword).toBe("beta-test-password");
    expect(body.model).toBe("gpt-4.1");
    expect(body.question).toBe("What is this notebook?");
    expect(body.context).toContain("Notebook title: BMW Browser Notebook");
    expect(body.context).toContain('"type": "matrix"');
    expect(window.localStorage.getItem("sfcr:notebook-assistant-beta-password")).toBeNull();
    const assistantLog = within(screen.getByRole("log", { name: /notebook assistant conversation/i }));
    const assistantLogElement = screen.getByRole("log", { name: /notebook assistant conversation/i });
    expect(assistantLog.getByText(/the bmw notebook includes:/i)).toBeInTheDocument();
    expect(assistantLog.getByText(/equations/i).closest("li")).not.toBeNull();
    expect(assistantLogElement.querySelector(".katex")).toBeNull();
    expect(assistantLogElement.querySelector(".assistant-variable-code .variable-label-inline")).not.toBeNull();
    expect(assistantLog.getByRole("cell", { name: /matrices/i })).toBeInTheDocument();
  }, 10000);

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

  it("opens the notebook variable inspector from the model equations table", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const modelHeading = screen.getAllByRole("heading", { name: /bmw model/i })[0];
    const modelCell = modelHeading.closest("article");
    expect(modelCell).not.toBeNull();
    if (!modelCell) {
      throw new Error("Expected BMW model article.");
    }

    await user.click(within(modelCell).getByRole("button", { name: /^show$/i }));
    expect(within(modelCell).getByText(/^Role$/i)).toBeInTheDocument();

    const yRowButton = within(modelCell).getByRole("button", { name: /^Y\b/i });
    const yRow = yRowButton.closest('[role="row"]');
    expect(yRow).not.toBeNull();
    if (!(yRow instanceof HTMLElement)) {
      throw new Error("Expected Y row in model equations table.");
    }
    expect(within(yRow).getByText(/^Identity$/i)).toBeInTheDocument();

    await user.click(within(modelCell).getByRole("button", { name: /^Y\b/i }));

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
  });

  it("shows variable descriptions for lowercase rate tokens in the BMW transaction-flow matrix", () => {
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
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rate of interest on bank deposits");
    expect(screen.getByRole("tooltip").textContent).toMatch(/Rate of interest on bank deposits\s*:\s*[-$\d]/i);
    fireEvent.mouseLeave(rmToken);
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

    await user.click(rmToken);

    expect(screen.getByText("Selected variable")).toBeInTheDocument();
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
      within(affectedEquationsSection).getByRole("button", { name: /^Inspect variable YD$/i })
    ).toBeInTheDocument();
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
    expect(inspectorTooltip.textContent).toMatch(/Bank deposits held by households\s*:\s*[$\d-]/i);
  });

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
      within(affectedEquationsSection).getByRole("button", { name: /^Inspect variable YD$/i })
    ).toBeInTheDocument();
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
