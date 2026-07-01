import { describe, expect, it } from "vitest";

import { buildOrderedBlocks, graphOrderingFixture, parseEquation } from "@sfcr/core";

import { buildSolverBlockDagGraph, buildSolverBlockDagLayout } from "../src/lib/solverBlockDag";

describe("buildSolverBlockDagGraph", () => {
  it("builds current-period dependency edges grouped by solver blocks", () => {
    const parsed = graphOrderingFixture.map((equation) =>
      parseEquation(equation.name, equation.expression)
    );
    const { blocks } = buildOrderedBlocks(parsed);
    const graph = buildSolverBlockDagGraph(
      {
        equations: graphOrderingFixture,
        externals: {},
        initialValues: {}
      },
      blocks
    );

    expect(graph.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { id: "a->b", source: "a", target: "b", intraBlock: false },
        { id: "d->c", source: "d", target: "c", intraBlock: true },
        { id: "c->d", source: "c", target: "d", intraBlock: true },
        { id: "b->e", source: "b", target: "e", intraBlock: false },
        { id: "c->e", source: "c", target: "e", intraBlock: false }
      ])
    );
    expect(graph.errors).toEqual([]);
  });

  it("layers nodes by solver block order", () => {
    const parsed = graphOrderingFixture.map((equation) =>
      parseEquation(equation.name, equation.expression)
    );
    const { blocks } = buildOrderedBlocks(parsed);
    const layout = buildSolverBlockDagLayout(
      buildSolverBlockDagGraph(
        {
          equations: graphOrderingFixture,
          externals: {},
          initialValues: {}
        },
        blocks
      )
    );

    expect(layout.nodes.find((node) => node.id === "a")?.position.y).toBeLessThan(
      layout.nodes.find((node) => node.id === "b")?.position.y ?? 0
    );
    expect(layout.nodes.find((node) => node.id === "c")?.position.y).toBe(
      layout.nodes.find((node) => node.id === "d")?.position.y
    );
    expect(layout.nodes.find((node) => node.id === "e")?.position.y ?? 0).toBeGreaterThan(
      layout.nodes.find((node) => node.id === "c")?.position.y ?? 0
    );
  });
});
