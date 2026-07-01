// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { buildOrderedBlocks, graphOrderingFixture, parseEquation } from "@sfcr/core";

import { SolverBlockDagPanel } from "../src/components/SolverBlockDagPanel";

afterEach(() => {
  cleanup();
});

describe("SolverBlockDagPanel", () => {
  it("renders the block legend and dependency graph dialog", () => {
    const { blocks } = buildOrderedBlocks(
      graphOrderingFixture.map((equation) => parseEquation(equation.name, equation.expression))
    );

    render(
      <SolverBlockDagPanel
        blocks={blocks}
        label="Baseline run"
        model={{
          equations: graphOrderingFixture,
          externals: {},
          initialValues: {}
        }}
        onClose={() => undefined}
      />
    );

    expect(screen.getByRole("dialog", { name: /solver block dependency graph/i })).toBeInTheDocument();
    expect(screen.getByText(/Block 2 \(cyclic\): c, d/i)).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /solver block dependency graph/i })).toBeInTheDocument();
  });
});
