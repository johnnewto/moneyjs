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
    expect(body.context).toContain("Assistant mode: Ask");
    expect(body.context).toContain("Do not create or return notebook patch proposals in Ask mode.");
    expect(body.context).toContain("Notebook title: BMW Browser Notebook");
    expect(body.context).toContain("Available notebook assistant tools:");
    expect(body.context).toContain("getSeriesWindow");
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

  it("runs assistant-requested notebook tools and loads returned patch proposals", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      const responseText = fetchMock.mock.calls.length === 1
        ? "```json\n{\"notebookAssistantToolRequests\":[{\"name\":\"createAddChartPatch\",\"args\":{\"runId\":\"baseline-newton\",\"title\":\"Disposable income\",\"variables\":[\"YD\",\"Cd\"]}}]}\n```"
        : "I prepared a validated chart patch for `YD` and `Cd`. It is ready to preview and apply.";

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: responseText
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Add a chart for disposable income.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondBody = JSON.parse(String(secondRequest?.body)) as { question?: string };
    expect(secondBody.question).toContain("Tool results JSON");
    expect(secondBody.question).toContain("createAddChartPatch");
    expect(secondBody.question).toContain("disposable-income");

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            value: expect.objectContaining({ id: "disposable-income" })
          })
        ]
      })
    );
    const patchText = document.getElementById("notebook-assistant-patch-json") as HTMLTextAreaElement;
    expect(patchText.value).toBe("");
    expect(screen.queryByRole("heading", { name: /^disposable income$/i })).not.toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /^apply$/i }));
    expect(screen.getByRole("heading", { name: /^disposable income$/i })).toBeInTheDocument();
    expect(screen.getByText(/notebook tools: createaddchartpatch completed/i)).toBeInTheDocument();
    expect(screen.getByText(/prepared a validated chart patch/i)).toBeInTheDocument();
    expect(screen.queryByText(/notebookAssistantToolRequests/)).not.toBeInTheDocument();
  }, 10000);

  it("blocks patch helper tool requests in Ask mode", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: "```json\n{\"notebookAssistantToolRequests\":[{\"name\":\"createAddChartPatch\",\"args\":{\"runId\":\"baseline-newton\",\"title\":\"Disposable income\",\"variables\":[\"YD\",\"Cd\"]}}]}\n```"
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Add a chart for disposable income.");
    await user.click(screen.getByRole("button", { name: /^ask$/i }));

    await waitFor(() => {
      expect(screen.getByText(/ask mode can inspect notebook state/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const patchText = document.getElementById("notebook-assistant-patch-json") as HTMLTextAreaElement;
    expect(patchText.value).toBe("");
  }, 10000);

  it("loads unsupported direct assistant notebook patch proposals inline", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const patch = {
      operations: [
        {
          op: "replace",
          path: "/title",
          value: "BMW Browser Notebook - edited"
        }
      ]
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: `Here is a patch proposal.\n\n\`\`\`json\n${JSON.stringify(patch)}\n\`\`\``
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Suggest a direct title patch.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(inlinePatchJson.value).toContain('"path": "/title"');
  }, 10000);

  it("edits, previews, and applies assistant patch JSON inline", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const patch = {
      operations: [
        {
          op: "replace",
          path: "/title",
          value: "BMW Browser Notebook - edited"
        }
      ]
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: `Here is a patch proposal.\n\n\`\`\`json\n${JSON.stringify(patch)}\n\`\`\``
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Suggest a direct title patch.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;

    fireEvent.change(inlinePatchJson, {
      target: { value: inlinePatchJson.value.replace("BMW Browser Notebook - edited", "BMW Browser Notebook - inline edit") }
    });

    expect(within(patchCard).getByText(/edited\. preview json before applying/i)).toBeInTheDocument();
    expect(within(patchCard).getByRole("button", { name: /^apply$/i })).toBeDisabled();

    await user.click(within(patchCard).getByRole("button", { name: /preview json/i }));
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();

    await user.click(within(patchCard).getByRole("button", { name: /^apply$/i }));
    expect(screen.getAllByText(/bmw browser notebook - inline edit/i).length).toBeGreaterThan(0);

    const manualPatchText = document.getElementById("notebook-assistant-patch-json") as HTMLTextAreaElement;
    expect(manualPatchText.value).toBe("");
  }, 10000);

  it("translates direct chart patches through helper tools", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const patch = {
      operations: [
        {
          op: "add",
          path: "/cells/-",
          value: {
            id: "chart-direct-disposable-income",
            type: "chart",
            title: "Direct disposable income",
            sourceRunCellId: "baseline-newton",
            variables: ["YD", "Cd"]
          }
        }
      ]
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: `Here is a patch proposal.\n\n\`\`\`json\n${JSON.stringify(patch)}\n\`\`\``
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Suggest a direct chart patch.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(screen.getByText(/prepared a validated patch with the notebook helper tools/i)).toBeInTheDocument();
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            value: expect.objectContaining({ id: "chart-direct-disposable-income" })
          })
        ]
      })
    );
  }, 10000);

  it("translates direct chart variable patches with stale cell indexes through helper tools", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const patch = {
      operations: [
        {
          op: "replace",
          path: "/cells/16/variables",
          value: ["W"]
        }
      ]
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: `Here is the baseline chart patch.\n\n\`\`\`json\n${JSON.stringify(patch)}\n\`\`\``
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(
      screen.getByRole("textbox", { name: /question/i }),
      "Use the helper tools to update the existing baseline chart so it shows wages. Prepare the patch for preview."
    );
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/prepared a validated patch with the notebook helper tools/i)).toBeInTheDocument();
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            path: "/cells/by-id/baseline-chart/variables",
            value: ["W"]
          })
        ]
      })
    );
  }, 10000);

  it("translates semantic notebook patch proposals through helper tools", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      const responseText = fetchMock.mock.calls.length === 1
        ? `Here is the helper-generated patch proposal:\n\n{\n  "notebookPatchProposal": {\n    "description": "Add WBs to the baseline headline variables chart.",\n    "patches": [\n      {\n        "kind": "chart-variables-update",\n        "chartId": "baseline-chart",\n        "variables": ["Y", "Cd", "Mh", "W", "WBs"]\n      }\n    ]\n  }\n}`
        : "I prepared the baseline chart update for review.";

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: responseText
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Proceed with adding wages to the baseline chart.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondBody = JSON.parse(String(secondRequest?.body)) as { question?: string };
    expect(secondBody.question).toContain("createUpdateChartVariablesPatch");
    expect(secondBody.question).toContain("WBs");

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            path: "/cells/by-id/baseline-chart/variables",
            value: ["Y", "Cd", "Mh", "W", "WBs"]
          })
        ]
      })
    );
  }, 10000);

  it("translates top-level semantic chart variable patches through helper tools", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      const responseText = fetchMock.mock.calls.length === 1
        ? `Here is a preview of the proposed patch:\n\n{\n  "patchKind": "updateChartVariables",\n  "chartId": "baseline-chart",\n  "variables": ["Y", "Cd", "Mh", "W", "WBd"]\n}`
        : "I prepared the baseline chart update for review.";

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: responseText
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Yes, remove wages from the baseline chart.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            path: "/cells/by-id/baseline-chart/variables",
            value: ["Y", "Cd", "Mh", "W", "WBd"]
          })
        ]
      })
    );
  }, 10000);

  it("shows inline patch cards for validated variable unit metadata patches", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();
    const patch = {
      operations: [
        {
          op: "replace",
          path: "/cells/by-id/equations-newton/equations/14/unitMeta",
          value: {
            displayUnit: "%",
            stockFlow: "aux",
            units: {}
          }
        }
      ]
    };
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      const responseText = fetchMock.mock.calls.length === 1
        ? JSON.stringify({
          notebookAssistantToolRequests: [
            { name: "validateNotebookPatch", args: { patch } },
            { name: "previewNotebookPatch", args: { patch } }
          ]
        })
        : "The percent unit metadata change is valid and ready for review.";

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: responseText
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Yes, change W units to percent.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            path: "/cells/by-id/equations-newton/equations/14/unitMeta",
            value: expect.objectContaining({
              displayUnit: "%",
              stockFlow: "aux"
            })
          })
        ]
      })
    );
  }, 10000);

  it("translates plain-text chart variable proposals into inline helper patches", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: 'You can now review and apply this change. Update the "Baseline headline variables" chart variables to: ["Y", "Cd", "Mh", "W", "WBs"].'
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Yes, proceed with adding wages to the baseline chart.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const patchCard = screen.getByRole("group", { name: /assistant patch proposal/i });
    expect(within(patchCard).getByText(/valid\. operations: 1/i)).toBeInTheDocument();
    await user.click(within(patchCard).getByRole("button", { name: /edit json/i }));
    const inlinePatchJson = within(patchCard).getByRole("textbox", { name: /inline assistant patch json/i }) as HTMLTextAreaElement;
    expect(JSON.parse(inlinePatchJson.value)).toEqual(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            path: "/cells/by-id/baseline-chart/variables",
            value: ["Y", "Cd", "Mh", "W", "WBs"]
          })
        ]
      })
    );
  }, 10000);

  it("reports malformed assistant notebook tool requests without sending a follow-up", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: "```json\n{\"notebookAssistantToolRequests\":[}\n```"
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Inspect the notebook with a tool.");
    await user.click(screen.getByRole("button", { name: /^ask$/i }));

    await waitFor(() => {
      expect(screen.getByText(/request json could not be parsed/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/notebookAssistantToolRequests/)).not.toBeInTheDocument();
  }, 10000);

  it("surfaces unknown assistant notebook tool failures in the follow-up", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      const responseText = fetchMock.mock.calls.length === 1
        ? "```json\n{\"notebookAssistantToolRequests\":[{\"name\":\"missingTool\",\"args\":{}}]}\n```"
        : "I could not run the requested notebook tool.";

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: responseText
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Use a missing notebook tool.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    const secondBody = JSON.parse(String(secondRequest?.body)) as { question?: string };
    expect(secondBody.question).toContain("Unknown notebook assistant tool: missingTool");
    expect(screen.getByText(/notebook tools: missingtool\. 1 failed/i)).toBeInTheDocument();
    expect(screen.getByText(/could not run the requested notebook tool/i)).toBeInTheDocument();
  }, 10000);

  it("surfaces assistant helper validation failures without loading a patch", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }

      const responseText = fetchMock.mock.calls.length === 1
        ? "```json\n{\"notebookAssistantToolRequests\":[{\"name\":\"createAddChartPatch\",\"args\":{\"runId\":\"baseline-newton\",\"title\":\"Missing variable\",\"variables\":[\"not_a_variable\"]}}]}\n```"
        : "The requested chart variable was not available in the run result.";

      return new Response(
        `data: ${JSON.stringify({
          type: "response.output_text.delta",
          delta: responseText
        })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream"
          }
        }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    await user.type(screen.getByRole("textbox", { name: /question/i }), "Add a chart for a missing variable.");
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const patchText = document.getElementById("notebook-assistant-patch-json") as HTMLTextAreaElement;
    expect(patchText.value).toBe("");
    expect(screen.getByText(/notebook tools: createaddchartpatch\. 1 failed/i)).toBeInTheDocument();
    expect(screen.getByText(/not available in the run result/i)).toBeInTheDocument();
  }, 10000);

  it("previews, applies, and undoes an assistant notebook patch", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByText(/manual patch json/i));

    const patch = JSON.stringify([
      {
        op: "add",
        path: "/cells/-",
        value: {
          id: "chart-disposable-income",
          type: "chart",
          title: "Disposable income",
          sourceRunCellId: "baseline-newton",
          variables: ["YD", "Cd"]
        }
      }
    ]);

    fireEvent.change(document.getElementById("notebook-assistant-patch-json") as HTMLTextAreaElement, {
      target: { value: patch }
    });
    await user.click(screen.getByRole("button", { name: /preview patch/i }));

    expect(screen.getByText(/patch preview: valid/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^disposable income$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /apply patch/i }));

    expect(screen.getByRole("heading", { name: /^disposable income$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /undo patch/i }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /^disposable income$/i })).not.toBeInTheDocument();
    });
  });

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
    expect(screen.getByRole("tooltip").textContent).toMatch(/Rate of interest on bank deposits\s*1\/yr/i);
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
    expect(inspectorTooltip).toHaveTextContent("Bank deposits held by households : $0");
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
