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

  it("renders math-like inline code variables even without descriptions", () => {
    render(
      <AssistantMarkdown text="`x` = exp(`eps0` + `eps1` * log(lag(`xr`)) + `eps2` * log(`y^F`))" />
    );

    expect(screen.getAllByText("ε")).toHaveLength(3);
    expect(screen.getByText("0", { selector: ".assistant-variable-code sub" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: ".assistant-variable-code sub" })).toBeInTheDocument();
    expect(screen.getByText("2", { selector: ".assistant-variable-code sub" })).toBeInTheDocument();
    expect(screen.getByText("F", { selector: ".assistant-variable-code sup" })).toBeInTheDocument();
  });

  it("renders simple lag calls in assistant prose as minus-one subscripts", () => {
    render(<AssistantMarkdown text="x = exp(eps0 + eps1 * log(lag(xr)) + eps2 * log(yF))" />);

    expect(screen.getByText("xr", { selector: ".assistant-variable-code .variable-math-label" })).toBeInTheDocument();
    expect(screen.getByText("−1", { selector: ".assistant-variable-code sub.lag-subscript" })).toBeInTheDocument();
    expect(screen.queryByText("lag")).not.toBeInTheDocument();
  });

  it("leaves ordinary inline code alone when it is not a known or math-like variable", () => {
    render(<AssistantMarkdown text="Use `exp` and `log` in formulas." />);

    expect(screen.getByText("exp", { selector: "code:not(.assistant-variable-code)" })).toBeInTheDocument();
    expect(screen.getByText("log", { selector: "code:not(.assistant-variable-code)" })).toBeInTheDocument();
  });
});
