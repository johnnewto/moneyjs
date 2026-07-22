// @vitest-environment jsdom

import { render, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  App,
  setSuccessfulNotebookRunner,
  setupAppTestEnv,
  screen,
  userEvent
} from "./appTestUtils";

setupAppTestEnv();

describe("Notebook graph floating pin", () => {
  it("pins the graph rail into a floating panel and docks it again", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    await user.click(screen.getByRole("tab", { name: /^Graph$/i }));

    const railGraph = document.getElementById("notebook-graph-panel");
    expect(railGraph).not.toBeNull();
    if (!(railGraph instanceof HTMLElement)) {
      throw new Error("Expected graph panel in the rail.");
    }

    await user.click(within(railGraph).getByRole("button", { name: /pin in floating panel/i }));

    const floatingDialog = await screen.findByRole("dialog", { name: "Graph" });
    expect(floatingDialog).toBeInTheDocument();
    expect(document.getElementById("notebook-graph-pinned-placeholder")).not.toBeNull();
    expect(document.querySelector(".notebook-rail #notebook-graph-panel")).toBeNull();

    await user.click(within(floatingDialog).getByRole("button", { name: /^dock graph$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Graph" })).not.toBeInTheDocument();
    });
    expect(document.getElementById("notebook-graph-pinned-placeholder")).toBeNull();
    expect(document.querySelector(".notebook-rail #notebook-graph-panel")).not.toBeNull();
  }, 15000);
});
