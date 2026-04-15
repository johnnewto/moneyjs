import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../src/notebook/dependencyGraph";

describe("dependency graph viewer", () => {
  it("builds layered nodes from equations, externals, and initial values", () => {
    const graph = buildDependencyGraph({
      equations: [
        { id: "eq-a", name: "a", expression: "a_level" },
        { id: "eq-b", name: "b", expression: "a + b_offset" },
        { id: "eq-c", name: "c", expression: "b + c_offset" },
        { id: "eq-d", name: "d", expression: "c + d_offset" },
        { id: "eq-e", name: "e", expression: "I(d)" }
      ],
      externals: [
        { id: "ext-a", name: "a_level", kind: "constant", valueText: "1" },
        { id: "ext-b", name: "b_offset", kind: "constant", valueText: "2" },
        { id: "ext-c", name: "c_offset", kind: "constant", valueText: "3" },
        { id: "ext-d", name: "d_offset", kind: "constant", valueText: "4" }
      ],
      initialValues: [{ id: "init-e", name: "e", valueText: "10" }]
    });

    expect(graph.errors).toEqual([]);

    const nodeByName = new Map(graph.nodes.map((node) => [node.name, node]));
    expect(nodeByName.get("a_level")?.layer).toBe(0);
    expect(nodeByName.get("a")?.layer).toBe(1);
    expect(nodeByName.get("b")?.layer).toBe(2);
    expect(nodeByName.get("c")?.layer).toBe(3);
    expect(nodeByName.get("d")?.layer).toBe(4);
    expect(nodeByName.get("e")).toMatchObject({
      variableType: "stock",
      equationRole: "accumulation",
      layer: 5,
      hasSelfLag: true,
      isCyclic: false,
      initialValue: 10
    });
    expect(nodeByName.get("d")?.variableType).toBe("flow");
    expect(nodeByName.get("d")?.equationRole).toBe("identity");

    expect(graph.edges.map((edge) => edge.id)).toContain("d->e");
    expect(graph.layerCount).toBe(6);
  });

  it("keeps lag edges distinct from current edges and reports parse failures", () => {
    const graph = buildDependencyGraph({
      equations: [
        { id: "eq-c", name: "c", expression: "alpha1 * yd + alpha2 * lag(v)" },
        { id: "eq-v", name: "v", expression: "lag(v) + (yd - c) * dt" },
        { id: "eq-bad", name: "broken", expression: "if (" }
      ],
      externals: [
        { id: "ext-a1", name: "alpha1", kind: "constant", valueText: "0.6" },
        { id: "ext-a2", name: "alpha2", kind: "constant", valueText: "0.4" },
        { id: "ext-yd", name: "yd", kind: "series", valueText: "10, 11" }
      ],
      initialValues: [{ id: "init-v", name: "v", valueText: "80" }]
    });

    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]).toContain("broken");

    const cToV = graph.edges.find((edge) => edge.id === "c->v");
    const ydToC = graph.edges.find((edge) => edge.id === "yd->c");
    const vNode = graph.nodes.find((node) => node.name === "v");

    expect(cToV).toMatchObject({ current: true, lagged: false });
    expect(ydToC).toMatchObject({ current: true, lagged: false });
    expect(vNode).toMatchObject({
      variableType: "stock",
      equationRole: "accumulation",
      hasSelfLag: true,
      isCyclic: false,
      initialValue: 80
    });
    expect(vNode?.lagDependencyNames).toContain("v");
  });

  it("keeps algebraic self-cycles separate from stock classification", () => {
    const graph = buildDependencyGraph({
      equations: [
        { id: "eq-x", name: "x", expression: "x + shock" },
        { id: "eq-y", name: "y", expression: "x + 1" }
      ],
      externals: [{ id: "ext-shock", name: "shock", kind: "constant", valueText: "1" }],
      initialValues: []
    });

    expect(graph.errors).toEqual([]);

    const xNode = graph.nodes.find((node) => node.name === "x");
    const yNode = graph.nodes.find((node) => node.name === "y");

    expect(xNode).toMatchObject({
      variableType: "auxiliary",
      equationRole: "identity",
      hasSelfLag: false,
      isCyclic: true
    });
    expect(yNode).toMatchObject({
      variableType: "auxiliary",
      equationRole: "definition",
      isCyclic: false
    });
  });

  it("prefers explicit equation roles over structural inference", () => {
    const graph = buildDependencyGraph({
      equations: [
        {
          id: "eq-kt",
          name: "KT",
          expression: "kappa * lag(Y)",
          role: "target"
        }
      ],
      externals: [
        { id: "ext-kappa", name: "kappa", kind: "constant", valueText: "1" },
        { id: "ext-y", name: "Y", kind: "constant", valueText: "100" }
      ],
      initialValues: []
    });

    expect(graph.nodes.find((node) => node.name === "KT")).toMatchObject({
      equationRole: "target"
    });
  });
});
