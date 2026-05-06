// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App, fireEvent, screen, setupAppTestEnv, userEvent } from "./appTestUtils";

setupAppTestEnv();

describe("App workspace and chat builder", () => {
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
    expect(screen.getByRole("option", { name: /gpt-5\.5/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/beta password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start draft/i })).toBeInTheDocument();
  });

  it("uses the serverless chat builder endpoint and enables draft start", () => {
    window.location.hash = "#/chat-builder";

    render(<App />);

    const endpointInput = screen.getByLabelText(/serverless endpoint/i);
    const startDraftButton = screen.getByRole("button", { name: /start draft/i });

    expect(endpointInput).toHaveValue("http://localhost:8787/v1/chat-builder/draft");
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("sfcr:chat-builder-api-key")).toBeNull();
    expect(window.localStorage.getItem("sfcr:chat-builder-beta-password")).toBeNull();
    expect(screen.getByText(/serverless endpoint configured/i)).toBeInTheDocument();
    expect(startDraftButton).toBeEnabled();
  });

  it("requests a draft from the model and updates the chat builder preview", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/chat-builder";
    const origin = window.location.origin;
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "http://localhost:8787/v1/chat-builder/draft") {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify({
              id: "closed-economy-draft",
              title: "Closed Economy Draft",
              metadata: { version: 1 },
              cells: [
                {
                  id: "overview",
                  type: "markdown",
                  title: "Overview",
                  source: "Closed-economy draft with a government spending shock and a baseline chart."
                },
                {
                  id: "equations",
                  type: "equations",
                  title: "Equations",
                  modelId: "draft-model",
                  equations: [
                    { id: "eq-Y", name: "Y", expression: "Cd + G", desc: "Income equals demand" },
                    { id: "eq-YD", name: "YD", expression: "Y", desc: "Disposable income" },
                    {
                      id: "eq-Cd",
                      name: "Cd",
                      expression: "alpha1 * YD + alpha2 * lag(Hh)",
                      desc: "Consumption out of income and wealth"
                    },
                    { id: "eq-Hh", name: "Hh", expression: "lag(Hh) + YD - Cd", desc: "Household wealth" }
                  ]
                },
                {
                  id: "solver",
                  type: "solver",
                  title: "Solver options",
                  modelId: "draft-model",
                  options: {
                    periods: 24,
                    solverMethod: "NEWTON",
                    toleranceText: "1e-8",
                    maxIterations: 120,
                    defaultInitialValueText: "0.1",
                    hiddenLeftVariable: "",
                    hiddenRightVariable: "",
                    hiddenToleranceText: "0.00001",
                    relativeHiddenTolerance: false
                  }
                },
                {
                  id: "externals",
                  type: "externals",
                  title: "Externals",
                  modelId: "draft-model",
                  externals: [
                    {
                      id: "ext-G",
                      name: "G",
                      kind: "series",
                      valueText: "20, 20, 20, 30, 30, 20",
                      desc: "Government spending path"
                    },
                    { id: "ext-alpha1", name: "alpha1", kind: "constant", valueText: "0.6" },
                    { id: "ext-alpha2", name: "alpha2", kind: "constant", valueText: "0.4" }
                  ]
                },
                {
                  id: "initial-values",
                  type: "initial-values",
                  title: "Initial values",
                  modelId: "draft-model",
                  initialValues: [{ id: "init-Hh", name: "Hh", valueText: "80" }]
                },
                {
                  id: "baseline-run",
                  type: "run",
                  title: "Baseline run",
                  mode: "baseline",
                  resultKey: "draft_baseline",
                  sourceModelId: "draft-model"
                },
                {
                  id: "baseline-chart",
                  type: "chart",
                  title: "Baseline chart",
                  sourceRunCellId: "baseline-run",
                  variables: ["Y", "Cd", "Hh"]
                }
              ]
            })
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
    const clipboardWriteSpy = vi.spyOn(navigator.clipboard, "writeText");

    const promptInput = screen.getByRole("textbox", { name: /prompt/i });
    const betaPasswordInput = screen.getByLabelText(/beta password/i);
    const startDraftButton = screen.getByRole("button", { name: /start draft/i });

    await user.type(betaPasswordInput, "beta-test-password");
    await user.clear(promptInput);
    await user.type(
      promptInput,
      "Build a small SFC model with government spending and a baseline chart."
    );
    await user.click(startDraftButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8787/v1/chat-builder/draft",
        expect.any(Object)
      );
    });

    const chatApiCall = fetchMock.mock.calls.find(
      ([url]) => url === "http://localhost:8787/v1/chat-builder/draft"
    ) as [string, RequestInit?] | undefined;
    const url = chatApiCall?.[0];
    const request = chatApiCall?.[1];
    const requestHeaders = request?.headers as Record<string, string> | undefined;
    expect(url).toBe("http://localhost:8787/v1/chat-builder/draft");
    expect(requestHeaders?.Authorization).toBeUndefined();
    expect(requestHeaders?.["Content-Type"]).toBe("application/json");
    const requestBody = JSON.parse(String(request?.body)) as {
      betaPassword?: string;
      discoveryUrl?: string;
      model?: string;
      prompt?: string;
    };
    expect(requestBody.betaPassword).toBe("beta-test-password");
    expect(requestBody.model).toBe("gpt-4.1");
    expect(requestBody.discoveryUrl).toBe(`${origin}/.well-known/sfcr.json`);
    expect(requestBody.prompt).toBe("Build a small SFC model with government spending and a baseline chart.");
    expect(window.localStorage.getItem("sfcr:chat-builder-beta-password")).toBeNull();

    expect(screen.getByText(/draft generated from model response\./i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/build a small sfc model with government spending and a baseline chart\./i)
    ).toHaveLength(2);
    expect(screen.getByText(/generated notebook: closed economy draft/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /closed economy draft \(7 cells, 1 equation cells, 1 run cells\)\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/overview/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent?.trim())).toContain(
      "Baseline chart"
    );
    expect(screen.getByText(/notebook cells/i)).toBeInTheDocument();
    expect(screen.getByText(/total:\s*7/i)).toBeInTheDocument();
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
    expect(
      (screen.getByRole("textbox", { name: /draft notebook json/i }) as HTMLTextAreaElement).value
    ).toContain('"type": "chart"');

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
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "http://localhost:8787/v1/chat-builder/draft") {
        return new Response(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify({
              assistantText: "Draft with missing equation expression.",
              summary: "Invalid draft.",
              equations: [{ name: "Y", expression: "" }],
              externals: [{ name: "G", kind: "constant", valueText: "20" }],
              sections: ["Equations", "Externals"]
            })
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
});
