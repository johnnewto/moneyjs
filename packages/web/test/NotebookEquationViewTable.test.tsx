// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NotebookModelViewTable } from "../src/notebook/components/NotebookModelViewTable";
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
          <span className="notebook-model-view-description" role="cell">
            Income = GDP
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
    expect(
      screen.getByRole("separator", { name: /resize expression column/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /variable/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /description/i })).toBeInTheDocument();
  });

  it("renders resizable externals columns with description", () => {
    render(
      <NotebookModelViewTable ariaLabel="Externals" layout="external-view">
        <div className="notebook-model-view-row notebook-model-view-row-external" role="row">
          <span className="notebook-model-view-name" role="cell">
            alpha1
          </span>
          <span className="notebook-model-view-expression" role="cell">
            0.8
          </span>
          <span className="notebook-model-view-description" role="cell">
            Propensity to consume
          </span>
          <span className="notebook-model-view-current" role="cell">
            0.8
          </span>
          <span className="notebook-model-view-kind" role="cell">
            constant
          </span>
        </div>
      </NotebookModelViewTable>
    );

    expect(screen.getByRole("table", { name: /externals/i })).toHaveClass("layout-external-view");
    expect(
      screen.getByRole("separator", { name: /resize name column/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: /resize value column/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /description/i })).toBeInTheDocument();
  });
});
