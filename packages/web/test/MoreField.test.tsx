// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NotebookCellMore } from "../src/notebook/components/NotebookCellMore";
import { PublicationMore } from "../src/publication/components/PublicationMore";
import type { PublicationVariableInteraction } from "../src/publication/publicationInspect";

const interaction: PublicationVariableInteraction = {
  currentValues: {},
  highlightedVariable: null,
  parameterNames: new Set<string>(),
  variableDescriptions: new Map(),
  variableUnitMetadata: new Map()
};

afterEach(() => {
  cleanup();
});

describe("PublicationMore", () => {
  it("renders the panel open by default with a `less` toggle and collapses on click", () => {
    render(<PublicationMore interaction={interaction} source="Extended explanation." />);

    expect(screen.getByText("Extended explanation.")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "less" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    expect(screen.queryByText("Extended explanation.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "more" })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders nothing for blank source", () => {
    const { container } = render(<PublicationMore interaction={interaction} source="   " />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("NotebookCellMore", () => {
  it("renders the panel open by default and toggles `less`/`more`", () => {
    render(<NotebookCellMore text="Run-view detail." />);

    expect(screen.getByText("Run-view detail.")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "less" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    expect(screen.queryByText("Run-view detail.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "more" })).toBeInTheDocument();
  });

  it("renders nothing for blank text", () => {
    const { container } = render(<NotebookCellMore text="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
