// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DependencyGraphCanvas } from "../src/components/DependencyGraphCanvas";
import type { ParsedDependencyGraph } from "../src/notebook/dependencyGraph";
import type { DependencyRowTopology } from "../src/notebook/dependencyRows";

afterEach(() => {
  cleanup();
});

describe("DependencyGraphCanvas", () => {
  it("renders compact matrix badges for explicit transaction and balance membership", () => {
    const graph: ParsedDependencyGraph = {
      nodes: [
        {
          id: "t",
          name: "TNode",
          label: "TNode",
          variableType: "auxiliary",
          equationRole: null,
          equationIndex: 0,
          layer: 0,
          order: 0,
          cluster: "equation",
          degree: 0,
          currentDependencyNames: [],
          lagDependencyNames: [],
          hasSelfLag: false,
          isCyclic: false
        },
        {
          id: "b",
          name: "BNode",
          label: "BNode",
          variableType: "auxiliary",
          equationRole: null,
          equationIndex: 1,
          layer: 1,
          order: 0,
          cluster: "equation",
          degree: 0,
          currentDependencyNames: [],
          lagDependencyNames: [],
          hasSelfLag: false,
          isCyclic: false
        },
        {
          id: "tb",
          name: "BothNode",
          label: "BothNode",
          variableType: "auxiliary",
          equationRole: null,
          equationIndex: 2,
          layer: 2,
          order: 0,
          cluster: "equation",
          degree: 0,
          currentDependencyNames: [],
          lagDependencyNames: [],
          hasSelfLag: false,
          isCyclic: false
        }
      ],
      edges: [],
      errors: [],
      layerCount: 3
    };

    const rowTopology: DependencyRowTopology = {
      bands: ["Transactions", "Balance"],
      variables: {
        TNode: {
          primaryBand: "Transactions",
          memberships: [
            {
              band: "Transactions",
              weight: 1,
              source: "transaction-row",
              confidence: "high"
            }
          ]
        },
        BNode: {
          primaryBand: "Balance",
          memberships: [
            {
              band: "Balance",
              weight: 1,
              source: "balance-row",
              confidence: "high"
            }
          ]
        },
        BothNode: {
          primaryBand: "Transactions",
          memberships: [
            {
              band: "Transactions",
              weight: 1,
              source: "transaction-row",
              confidence: "high"
            },
            {
              band: "Balance",
              weight: 1,
              source: "balance-row",
              confidence: "high"
            }
          ]
        }
      }
    };

    render(<DependencyGraphCanvas graph={graph} rowTopology={rowTopology} />);

    expect(screen.getByLabelText("Matrix badge: T")).toBeInTheDocument();
    expect(screen.getByLabelText("Matrix badge: B")).toBeInTheDocument();
    expect(screen.getByLabelText("Matrix badge: TB")).toBeInTheDocument();
  });

  it("renders superscripted node labels with the shared SVG renderer", () => {
    const graph: ParsedDependencyGraph = {
      nodes: [
        {
          id: "hp",
          name: "H^P",
          label: "H^P",
          variableType: "stock",
          equationRole: null,
          equationIndex: 0,
          layer: 0,
          order: 0,
          cluster: "equation",
          degree: 0,
          currentDependencyNames: [],
          lagDependencyNames: [],
          hasSelfLag: false,
          isCyclic: false
        }
      ],
      edges: [],
      errors: [],
      layerCount: 1
    };

    render(<DependencyGraphCanvas graph={graph} />);

    expect(document.querySelector('tspan[baseline-shift="super"]')?.textContent).toBe("P");
  });
});