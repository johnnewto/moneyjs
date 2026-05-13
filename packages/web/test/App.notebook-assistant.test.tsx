// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

    expect(screen.getByLabelText(/simulation period navigation/i)).toBeInTheDocument();
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

});
