// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runBaseline as runCoreBaseline } from "@sfcr/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";
import { App } from "../src/app/App";

const runBaseline = vi.fn();
const runScenario = vi.fn();
const validate = vi.fn();
const bmwNotebookBaselineResult = runCoreBaseline(bmwBaselineModel, bmwBaselineOptions);
let notebookRunnerMock: {
  outputs: Record<string, { type: "result"; result: typeof bmwNotebookBaselineResult }>;
  status: Record<string, "idle" | "running" | "success" | "error">;
  errors: Record<string, string | undefined>;
  runCell: ReturnType<typeof vi.fn>;
  runAll: ReturnType<typeof vi.fn>;
  getResult: (cellId: string) => typeof bmwNotebookBaselineResult | null;
};

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

vi.mock("../src/notebook/useNotebookRunner", () => ({
  useNotebookRunner: () => notebookRunnerMock
}));

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "#/workspace";
    window.localStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    runBaseline.mockReset();
    runScenario.mockReset();
    validate.mockReset();
    notebookRunnerMock = {
      outputs: {},
      status: {},
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: () => null
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders the editable browser workspace", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /sfcr browser workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run baseline/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /equations/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /import \/ export/i })).toBeInTheDocument();
  });

  it("renders the experimental chat builder route", () => {
    window.location.hash = "#/chat-builder";

    render(<App />);

    expect(screen.getByRole("heading", { name: /sfcr chat builder/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /conversation/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /draft model preview/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /prompt/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start draft/i })).toBeInTheDocument();
  });

  it("stores a chat builder API key locally and enables draft start", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/chat-builder";

    render(<App />);

    const apiKeyInput = screen.getByLabelText(/api key/i);
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    const startDraftButton = screen.getByRole("button", { name: /start draft/i });

    expect(startDraftButton).toBeDisabled();
    await user.type(apiKeyInput, "sk-test-chat-builder");
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    expect(window.localStorage.getItem("sfcr:chat-builder-api-key")).toBe("sk-test-chat-builder");
    expect(screen.getByText(/api key saved locally for this browser/i)).toBeInTheDocument();
    expect(startDraftButton).toBeEnabled();
  });

  it("requests a draft from the model and updates the chat builder preview", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/chat-builder";
    window.localStorage.setItem("sfcr:chat-builder-api-key", "sk-existing-chat-builder");
    const origin = window.location.origin;
    const fetchMock = vi.fn(async (input: string) => {
      if (input === `${origin}/.well-known/sfcr.json`) {
        return {
          ok: true,
          json: async () => ({
            resources: {
              notebooks: {
                manifest: "./sfcr-notebook-guide.json",
                guide: "../notebook-guide.md",
                schema: "../sfcr-notebook.schema.json",
                prompt: "../ai-prompts/create-sfcr-notebook.md",
                examples: [{ id: "bmw", url: "../notebook-examples/bmw.notebook.json" }]
              }
            }
          })
        };
      }

      if (input === `${origin}/.well-known/sfcr-notebook-guide.json`) {
        return {
          ok: true,
          json: async () => ({
            guideUrl: "../notebook-guide.md",
            schemaUrl: "../sfcr-notebook.schema.json",
            promptUrl: "../ai-prompts/create-sfcr-notebook.md",
            examples: [{ id: "bmw", url: "../notebook-examples/bmw.notebook.json" }]
          })
        };
      }

      if (input === `${origin}/notebook-guide.md`) {
        return {
          ok: true,
          text: async () => "# AI Guide: Creating SFC Model JSON Notebooks"
        };
      }

      if (input === `${origin}/sfcr-notebook.schema.json`) {
        return {
          ok: true,
          text: async () => '{"title":"SFCR notebook schema"}'
        };
      }

      if (input === `${origin}/ai-prompts/create-sfcr-notebook.md`) {
        return {
          ok: true,
          text: async () => "# SFCR notebook JSON generation prompt"
        };
      }

      if (input === `${origin}/notebook-examples/bmw.notebook.json`) {
        return {
          ok: true,
          text: async () => '{"id":"bmw","title":"BMW notebook"}'
        };
      }

      if (input === "https://api.openai.com/v1/responses") {
        return {
          ok: true,
          json: async () => ({
            output: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      assistantText:
                        "Draft plan: create equations, solver options, externals, initial values, and a baseline run.",
                      summary:
                        "Closed-economy draft with a government spending shock and a baseline chart.",
                      equations: [
                        {
                          name: "Y",
                          expression: "Cd + G",
                          desc: "Income equals demand"
                        },
                        {
                          name: "YD",
                          expression: "Y",
                          desc: "Disposable income"
                        },
                        {
                          name: "Cd",
                          expression: "alpha1 * YD + alpha2 * lag(Hh)",
                          desc: "Consumption out of income and wealth"
                        },
                        {
                          name: "Hh",
                          expression: "lag(Hh) + YD - Cd",
                          desc: "Household wealth"
                        }
                      ],
                      externals: [
                        {
                          name: "G",
                          kind: "series",
                          valueText: "20, 20, 20, 30, 30, 20",
                          desc: "Government spending path"
                        },
                        {
                          name: "alpha1",
                          kind: "constant",
                          valueText: "0.6"
                        },
                        {
                          name: "alpha2",
                          kind: "constant",
                          valueText: "0.4"
                        }
                      ],
                      initialValues: [
                        {
                          name: "Hh",
                          valueText: "80"
                        }
                      ],
                      solverOptions: {
                        periods: 24,
                        solverMethod: "NEWTON",
                        toleranceText: "1e-8",
                        maxIterations: 120,
                        defaultInitialValueText: "0.1"
                      },
                      sections: [
                        "Overview markdown",
                        "Equations",
                        "Solver options",
                        "Externals",
                        "Initial values",
                        "Baseline run",
                        "Baseline chart"
                      ]
                    })
                  }
                ]
              }
            ]
          })
        };
      }

      throw new Error(`Unexpected fetch call: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const clipboardWriteSpy = vi.spyOn(navigator.clipboard, "writeText");

    const promptInput = screen.getByRole("textbox", { name: /prompt/i });
    const startDraftButton = screen.getByRole("button", { name: /start draft/i });

    await user.clear(promptInput);
    await user.type(
      promptInput,
      "Build a small SFC model with government spending and a baseline chart."
    );
    await user.click(startDraftButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.any(Object));
    });

    expect(fetchMock).toHaveBeenCalledWith(`${origin}/.well-known/sfcr.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${origin}/.well-known/sfcr-notebook-guide.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${origin}/notebook-guide.md`);
    expect(fetchMock).toHaveBeenCalledWith(`${origin}/sfcr-notebook.schema.json`);
    expect(fetchMock).toHaveBeenCalledWith(`${origin}/ai-prompts/create-sfcr-notebook.md`);
    expect(fetchMock).toHaveBeenCalledWith(`${origin}/notebook-examples/bmw.notebook.json`);

    const openAiCall = fetchMock.mock.calls.find(
      ([url]) => url === "https://api.openai.com/v1/responses"
    ) as [string, RequestInit?] | undefined;
    const url = openAiCall?.[0];
    const request = openAiCall?.[1];
    const requestHeaders = request?.headers as Record<string, string> | undefined;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(requestHeaders?.Authorization).toBe("Bearer sk-existing-chat-builder");
    expect(requestHeaders?.["Content-Type"]).toBe("application/json");
    expect(request?.body).toContain("gpt-4.1");
    expect(request?.body).toContain("Build a small SFC model with government spending and a baseline chart.");
    expect(request?.body).toContain("SFCR discovery bundle");
    expect(request?.body).toContain("AI Guide: Creating SFC Model JSON Notebooks");
    expect(request?.body).toContain("SFCR notebook JSON generation prompt");
    expect(request?.body).toContain('{\\"title\\":\\"SFCR notebook schema\\"}');
    expect(request?.body).toContain('{\\"id\\":\\"bmw\\",\\"title\\":\\"BMW notebook\\"}');

    expect(screen.getByText(/draft generated from model response\./i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/build a small sfc model with government spending and a baseline chart\./i)
    ).toHaveLength(2);
    expect(
      screen.getByText(
        /draft plan: create equations, solver options, externals, initial values, and a baseline run\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/closed-economy draft with a government spending shock and a baseline chart\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/overview markdown/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent?.trim())).toContain(
      "Baseline chart"
    );
    expect(screen.getByText(/draft equations/i)).toBeInTheDocument();
    expect(screen.getByText(/income equals demand/i)).toBeInTheDocument();
    expect(screen.getByText(/consumption out of income and wealth/i)).toBeInTheDocument();
    expect(screen.getByText(/draft externals/i)).toBeInTheDocument();
    expect(screen.getByText(/government spending path/i)).toBeInTheDocument();
    expect(screen.getByText(/draft initial values/i)).toBeInTheDocument();
    expect(screen.getByText(/draft solver options/i)).toBeInTheDocument();
    expect(screen.getByText(/periods: 24/i)).toBeInTheDocument();
    expect(screen.getByText(/method: NEWTON/i)).toBeInTheDocument();
    expect(screen.getByText(/validation: ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply to draft notebook/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /export sections/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /apply to draft notebook/i }));
    expect(screen.getByText(/applied validated draft to notebook json preview\./i)).toBeInTheDocument();
    expect(
      (screen.getByRole("textbox", { name: /draft notebook json/i }) as HTMLTextAreaElement).value
    ).toContain('"type": "equations"');

    await user.click(screen.getByRole("button", { name: /export sections/i }));
    await waitFor(() => {
      expect(clipboardWriteSpy).toHaveBeenCalled();
    });
    expect(screen.getByText(/copied validated draft sections to the clipboard\./i)).toBeInTheDocument();
    expect(promptInput).toHaveValue("");
  });

  it("shows validation issues and blocks actions for an invalid draft", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/chat-builder";
    window.localStorage.setItem("sfcr:chat-builder-api-key", "sk-existing-chat-builder");
    const origin = window.location.origin;
    const fetchMock = vi.fn(async (input: string) => {
      if (input === `${origin}/.well-known/sfcr.json`) {
        return {
          ok: true,
          json: async () => ({
            resources: {
              notebooks: {
                manifest: "./sfcr-notebook-guide.json",
                guide: "../notebook-guide.md",
                schema: "../sfcr-notebook.schema.json",
                prompt: "../ai-prompts/create-sfcr-notebook.md"
              }
            }
          })
        };
      }

      if (input === `${origin}/.well-known/sfcr-notebook-guide.json`) {
        return {
          ok: true,
          json: async () => ({ guideUrl: "../notebook-guide.md", schemaUrl: "../sfcr-notebook.schema.json", promptUrl: "../ai-prompts/create-sfcr-notebook.md" })
        };
      }

      if (input === `${origin}/notebook-guide.md`) {
        return { ok: true, text: async () => "# Guide" };
      }
      if (input === `${origin}/sfcr-notebook.schema.json`) {
        return { ok: true, text: async () => "{}" };
      }
      if (input === `${origin}/ai-prompts/create-sfcr-notebook.md`) {
        return { ok: true, text: async () => "# Prompt" };
      }
      if (input === "https://api.openai.com/v1/responses") {
        return {
          ok: true,
          json: async () => ({
            output: [
              {
                content: [
                  {
                    text: JSON.stringify({
                      assistantText: "Draft with missing equation expression.",
                      summary: "Invalid draft.",
                      equations: [{ name: "Y", expression: "" }],
                      externals: [{ name: "G", kind: "constant", valueText: "20" }],
                      sections: ["Equations", "Externals"]
                    })
                  }
                ]
              }
            ]
          })
        };
      }

      throw new Error(`Unexpected fetch call: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const promptInput = screen.getByRole("textbox", { name: /prompt/i });
    await user.clear(promptInput);
    await user.type(promptInput, "Build an invalid draft.");
    await user.click(screen.getByRole("button", { name: /start draft/i }));

    await waitFor(() => {
      expect(screen.getByText(/validation: issues found/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/equation expression is required\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply to draft notebook/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /export sections/i })).toBeDisabled();
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

    expect(screen.getByText(/editor validation: 1 error\(s\), 0 warning\(s\)\./i)).toBeInTheDocument();
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
    expect(screen.getByText(/editor validation: 1 error\(s\), 0 warning\(s\)\./i)).toBeInTheDocument();
    expect(screen.getAllByText(/unexpected character: \[/i).length).toBeGreaterThan(0);
  });

  it("renders the BMW notebook route", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.getByRole("combobox", { name: /notebook template/i })).toHaveValue("bmw");
    expect(screen.getAllByText(/bmw browser notebook/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^run all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /validate/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /chat builder/i })).toHaveAttribute(
      "href",
      "#/chat-builder"
    );
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
    expect(screen.getAllByRole("button", { name: /^show$/i }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: /^show$/i })[0]);
    expect(screen.getAllByText("Variable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expression").length).toBeGreaterThan(0);
    const yToken = screen
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

    const equationsCell = document.getElementById("equations-newton");
    expect(equationsCell).not.toBeNull();
    if (!(equationsCell instanceof HTMLElement)) {
      throw new Error("Expected equations cell article.");
    }

    const equationsHelpText = within(equationsCell).getByText(
      /hover previews inputs\. click shows both, shift\+click pins outputs, ctrl\/cmd\+click pins inputs\./i
    );
    expect(equationsHelpText).not.toBeVisible();

    await user.click(within(equationsCell).getByText(/^help$/i));
    expect(equationsHelpText).toBeVisible();

    const editEquationsButton = within(equationsCell).getByRole("button", { name: /^edit$/i });
    await user.click(editEquationsButton);
    expect(screen.queryByText(/compact read-only equation list/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("Description").length).toBeGreaterThan(0);
    expect(within(equationsCell).queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(within(equationsCell).getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
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

    expect(within(equationsCell).queryByText("alpha0")).not.toBeInTheDocument();
    expect(within(equationsCell).queryByText("alpha1")).not.toBeInTheDocument();
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

    await user.click(
      within(equationsCell).getByRole("button", { name: /show external names/i })
    );

    expect(within(equationsCell).getByText("alpha0")).toBeInTheDocument();
    expect(within(equationsCell).getByText("alpha1")).toBeInTheDocument();

    await user.click(
      within(equationsCell).getByRole("button", { name: /show external values/i })
    );

    expect(within(equationsCell).queryByText("alpha0")).not.toBeInTheDocument();
    expect(within(equationsCell).queryByText("alpha1")).not.toBeInTheDocument();
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

  it("switches the notebook rail to the contents tab", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    expect(screen.queryByRole("button", { name: /bmw model/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^contents$/i }));

    expect(screen.getByRole("tab", { name: /^contents$/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getAllByRole("button", { name: /bmw model/i }).length).toBeGreaterThan(0);
  });

  it("wires drag-scroll surfaces in notebook mode", () => {
    window.location.hash = "#/notebook";

    render(<App />);

    const notebookSheet = screen.getByRole("region", { name: /notebook sheet/i }).parentElement;
    expect(notebookSheet).not.toBeNull();
    expect(notebookSheet?.className).toContain("notebook-main-column");
    expect(notebookSheet?.className).toContain("drag-scroll-surface");

    const notebookRail = screen.getByRole("tablist", {
      name: /notebook sidebar panels/i
    }).parentElement;
    expect(notebookRail).not.toBeNull();
    expect(notebookRail?.className).toContain("notebook-outline");
    expect(notebookRail?.className).toContain("drag-scroll-surface");
  });

  it("renders BMW transaction-flow matrix values with flow units inferred from the full expression", () => {
    window.location.hash = "#/notebook";
    notebookRunnerMock = {
      outputs: {
        "baseline-newton": { type: "result", result: bmwNotebookBaselineResult }
      },
      status: { "baseline-newton": "success" },
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: (cellId: string) => (cellId === "baseline-newton" ? bmwNotebookBaselineResult : null)
    };

    render(<App />);

    const matrixHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const matrixCell = matrixHeading.closest("article");
    expect(matrixCell).not.toBeNull();
    if (!matrixCell) {
      throw new Error("Expected BMW transactions-flow matrix article.");
    }

    const interestDepositsRow = within(matrixCell)
      .getByText("Interest on deposits")
      .closest("tr");
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
    notebookRunnerMock = {
      outputs: {
        "baseline-newton": { type: "result", result: bmwNotebookBaselineResult }
      },
      status: { "baseline-newton": "success" },
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: (cellId: string) => (cellId === "baseline-newton" ? bmwNotebookBaselineResult : null)
    };

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
    notebookRunnerMock = {
      outputs: {
        "baseline-newton": { type: "result", result: bmwNotebookBaselineResult }
      },
      status: { "baseline-newton": "success" },
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: (cellId: string) => (cellId === "baseline-newton" ? bmwNotebookBaselineResult : null)
    };

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
    notebookRunnerMock = {
      outputs: {
        "baseline-newton": { type: "result", result: bmwNotebookBaselineResult }
      },
      status: { "baseline-newton": "success" },
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: (cellId: string) => (cellId === "baseline-newton" ? bmwNotebookBaselineResult : null)
    };

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
    notebookRunnerMock = {
      outputs: {
        "baseline-newton": { type: "result", result: bmwNotebookBaselineResult }
      },
      status: { "baseline-newton": "success" },
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: (cellId: string) => (cellId === "baseline-newton" ? bmwNotebookBaselineResult : null)
    };

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
    notebookRunnerMock = {
      outputs: {
        "baseline-newton": { type: "result", result: bmwNotebookBaselineResult }
      },
      status: { "baseline-newton": "success" },
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: (cellId: string) => (cellId === "baseline-newton" ? bmwNotebookBaselineResult : null)
    };

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
    expect(
      screen.getByRole("heading", { name: /dis transactions-flow matrix/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /dis equation dependency graph/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /^dis model$/i }).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe("#/notebook/gl6-dis");
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

  it("exports notebook JSON into the import area", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    expect(screen.getByDisplayValue(/"title": "BMW Browser Notebook"/i)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/\{ "id": "intro", "type": "markdown", "title": "Overview", "source":/i)
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    const exportArea = screen.getByDisplayValue(/"title": "BMW Browser Notebook"/i) as HTMLTextAreaElement;
    expect(exportArea.value).not.toContain('"viewMode": "strips"');
    expect(exportArea.value).toContain('"stripSectorSource": "columns"');
    expect(exportArea.value).toContain('"showAccountingStrips": true');
    expect(exportArea.value).not.toContain('"accountingBandGrouping": "family"');
    expect(exportArea.value).toContain('"showExogenous": false');
  });

  it("exports notebook Markdown into the import area", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("button", { name: /^import$/i }));
    await user.click(screen.getByRole("button", { name: /^markdown$/i }));
    await user.click(screen.getByRole("button", { name: /export to text/i }));

    expect(screen.getByDisplayValue(/```sfcr-equations/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/```sfcr-solver/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/```sfcr-externals/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/```sfcr-initial-values/i)).toBeInTheDocument();
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

    expect(screen.getAllByText(/^Imported Notebook$/i).length).toBeGreaterThan(0);
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

    expect(screen.getAllByText(/^Draft Notebook$/i).length).toBeGreaterThan(0);

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

  it("keeps linked equation edits local until apply and discards them on cancel", async () => {
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

    await user.click(screen.getByRole("button", { name: /^export$/i }));
    const draftExport = screen.getByPlaceholderText(
      /paste a notebook json document/i
    ) as HTMLTextAreaElement;
    expect(draftExport.value).not.toContain(`"name": "${draftValue}"`);

    await user.click(screen.getByRole("button", { name: /^close$/i }));
    await user.click(within(equationsCell).getByRole("button", { name: /^cancel$/i }));
    await user.click(within(equationsCell).getByRole("button", { name: /^edit$/i }));

    expect(
      (within(equationsCell).getByRole("textbox", {
        name: /equation 1 variable/i
      }) as HTMLTextAreaElement).value
    ).toBe(originalValue);

    fireEvent.change(within(equationsCell).getByRole("textbox", { name: /equation 1 variable/i }), {
      target: { value: draftValue }
    });
    await user.click(within(equationsCell).getByRole("button", { name: /^apply$/i }));

    await user.click(screen.getByRole("button", { name: /^export$/i }));
    const appliedExport = screen.getByPlaceholderText(
      /paste a notebook json document/i
    ) as HTMLTextAreaElement;
    expect(appliedExport.value).toContain(`"name": "${draftValue}"`);
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
