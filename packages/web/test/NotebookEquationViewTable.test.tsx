// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NotebookEquationViewTable } from "../src/notebook/components/NotebookEquationViewTable";

afterEach(() => {
  cleanup();
});

describe("NotebookEquationViewTable", () => {
  it("renders a resizable variable column separator in show mode", () => {
    render(
      <NotebookEquationViewTable ariaLabel="Model equations">
        <div className="notebook-model-view-row" role="row">
          <span className="notebook-model-view-name" role="cell">
            Y
          </span>
          <span className="notebook-model-view-expression" role="cell">
            C + I
          </span>
          <span className="notebook-model-view-current" role="cell">
            100
          </span>
          <span className="notebook-model-view-kind" role="cell">
            Auto
          </span>
        </div>
      </NotebookEquationViewTable>
    );

    expect(screen.getByRole("table", { name: /model equations/i })).toHaveClass(
      "notebook-model-view-table-resizable"
    );
    expect(
      screen.getByRole("separator", { name: /resize variable column/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /variable/i })).toBeInTheDocument();
  });
});
