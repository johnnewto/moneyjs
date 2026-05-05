// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssistantMarkdown } from "../src/components/AssistantMarkdown";

afterEach(() => {
  cleanup();
});

describe("AssistantMarkdown", () => {
  it("renders known variable mentions in plain prose as variable labels", () => {
    render(
      <AssistantMarkdown
        text="Watch H^P as yd^{HS} adjusts."
        variableDescriptions={new Map([
          ["H^P", "High-powered money"],
          ["yd^{HS}", "Household disposable income"]
        ])}
      />
    );

    expect(screen.getByText("P", { selector: ".assistant-variable-code sup" })).toBeInTheDocument();
    expect(screen.getByText("HS", { selector: ".assistant-variable-code sup" })).toBeInTheDocument();
  });
});