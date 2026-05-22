// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  App,
  fireEvent,
  notebookRunnerMock,
  screen,
  setSuccessfulNotebookRunner,
  setupAppTestEnv,
  userEvent
} from "./appTestUtils";

setupAppTestEnv();

describe("App notebook assistant", () => {
  it("keeps the scrubber visible when undo clears runner outputs before rerun", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    expect(screen.getByLabelText(/simulation period navigation/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByText(/manual patch json/i));

    const patch = JSON.stringify([
      {
        op: "replace",
        path: "/cells/8/periods",
        value: 40
      }
    ]);

    fireEvent.change(document.getElementById("notebook-assistant-patch-json") as HTMLTextAreaElement, {
      target: { value: patch }
    });

    await user.click(screen.getByRole("button", { name: /preview patch/i }));
    await user.click(screen.getByRole("button", { name: /apply patch/i }));

    notebookRunnerMock.outputs = {};
    notebookRunnerMock.status = {};
    notebookRunnerMock.errors = {};

    await user.click(screen.getByRole("button", { name: /undo patch/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/simulation period navigation/i)).toBeInTheDocument();
    });
  }, 15000);

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
  }, 15000);

  it("continues through response.completed SSE follow-up tool rounds before preparing a patch", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";

    const responses = [
      {
        output_text: `\`\`\`json
{
  "notebookAssistantToolRequests": [
    {
      "name": "getMatrix",
      "args": {
        "cellId": "matrix"
      }
    }
  ]
}
\`\`\``
      },
      {
        output_text: `\`\`\`json
{
  "notebookAssistantToolRequests": [
    {
      "name": "getMatrix",
      "args": {}
    }
  ]
}
\`\`\``
      },
      {
        output_text: `\`\`\`json
{
  "notebookAssistantToolRequests": [
    {
      "name": "createUpdateMatrixPatch",
      "args": {
        "matrixId": "balance-sheet",
        "columns": ["Households", "Production firms", "Banks", "Government", "Sum"],
        "sectors": ["Households", "Firms", "Banks", "Government", ""],
        "rows": [
          { "band": "Deposits", "label": "Money deposits", "values": ["+Mh", "", "-Ms", "", "0"] },
          { "band": "Loans", "label": "Loans", "values": ["", "-Ld", "+Ls", "", "0"] },
          { "band": "Government bills", "label": "Government bills", "values": ["+Bh", "", "+Bb", "-Bs", "0"] },
          { "band": "Investment", "label": "Fixed capital", "values": ["", "+K", "", "", "+K"] },
          { "band": "Balance", "label": "Balance (net worth)", "values": ["-Vh", "-V", "0", "+Vg", "0"] },
          { "band": "Sum", "label": "Sum", "values": ["0", "0", "0", "0", "0"] }
        ]
      }
    }
  ]
}
\`\`\``
      }
    ];
    const fetchMock = vi.fn(async (input: string) => {
      if (input !== "http://localhost:8787/v1/notebook-assistant/ask") {
        throw new Error(`Unexpected fetch call: ${input}`);
      }
      const next = responses.shift();
      if (!next) {
        throw new Error("Unexpected extra assistant request.");
      }
      return completedSseResponse(next.output_text);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^assistant$/i }));
    await user.click(screen.getByRole("button", { name: /edit mode/i }));
    fireEvent.change(screen.getByLabelText(/question/i), {
      target: { value: "add a govt sector to the matricies" }
    });
    await user.click(screen.getByRole("button", { name: /prepare edit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    expect(screen.getByText(/proposed change prepared/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /apply patch/i }).length).toBeGreaterThan(0);
  }, 15000);

});

function completedSseResponse(outputText: string): Response {
  return new Response(
    [
      `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          output_text: outputText
        }
      })}\n\n`,
      "data: [DONE]\n\n"
    ].join(""),
    {
      headers: {
        "Content-Type": "text/event-stream"
      }
    }
  );
}
