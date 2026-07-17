// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicationEquations } from "../src/publication/components/PublicationEquations";
import type { EquationsCell } from "../src/notebook/types";
import { createTestPublicationInteraction } from "./publicationTestUtils";

afterEach(() => {
  cleanup();
});

describe("PublicationEquations", () => {
  it("renders Greek prefixes and subscripts in equation expressions", () => {
    const cell: EquationsCell = {
      id: "eq",
      modelId: "model-1",
      title: "Model",
      type: "equations",
      equations: [
        {
          id: "row-1",
          name: "Cd",
          expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh)",
          desc: "Consumption demand"
        }
      ]
    };

    render(<PublicationEquations cell={cell} interaction={createTestPublicationInteraction()} />);

    expect(screen.getAllByText("α").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("0", { selector: "sub" }).length).toBeGreaterThan(0);
    const block = screen.getByText("Consumption demand").closest(".publication-equation-block");
    expect(block).not.toBeNull();
    const children = [...block!.children].map((child) => child.className);
    expect(children[0]).toContain("publication-equation-expression");
    expect(children[1]).toContain("publication-equation-description");
  });

  it("highlights related equation rows that share variables on hover", () => {
    const cell: EquationsCell = {
      id: "eq",
      modelId: "model-1",
      title: "Model",
      type: "equations",
      equations: [
        { id: "eq-y", name: "Y", expression: "C + I", desc: "National output" },
        { id: "eq-c", name: "C", expression: "alpha1 * YD", desc: "Household consumption" },
        { id: "eq-tax", name: "Tax", expression: "tau * Y", desc: "Income tax" }
      ]
    };

    render(<PublicationEquations cell={cell} interaction={createTestPublicationInteraction()} />);

    const yBlock = screen.getByText("National output").closest(".publication-equation-block");
    const cBlock = screen.getByText("Household consumption").closest(".publication-equation-block");
    const taxBlock = screen.getByText("Income tax").closest(".publication-equation-block");
    expect(yBlock).not.toBeNull();
    expect(cBlock).not.toBeNull();
    expect(taxBlock).not.toBeNull();

    fireEvent.mouseEnter(yBlock!);
    expect(yBlock).toHaveClass("trace-root");
    expect(yBlock).toHaveClass("is-hovered");
    expect(cBlock).toHaveClass("trace-input");
    expect(taxBlock).toHaveClass("trace-output");

    fireEvent.mouseLeave(yBlock!);
    expect(yBlock).not.toHaveClass("trace-root");
    expect(cBlock).not.toHaveClass("trace-input");
    expect(taxBlock).not.toHaveClass("trace-output");
  });

  it("pins link highlighting on click and clears it on a second click", () => {
    const cell: EquationsCell = {
      id: "eq",
      modelId: "model-1",
      title: "Model",
      type: "equations",
      equations: [
        { id: "eq-y", name: "Y", expression: "C + I", desc: "National output" },
        { id: "eq-c", name: "C", expression: "alpha1 * YD", desc: "Household consumption" },
        { id: "eq-tax", name: "Tax", expression: "tau * Y", desc: "Income tax" }
      ]
    };

    render(<PublicationEquations cell={cell} interaction={createTestPublicationInteraction()} />);

    const yBlock = screen.getByText("National output").closest(".publication-equation-block")!;
    const cBlock = screen.getByText("Household consumption").closest(".publication-equation-block")!;
    const taxBlock = screen.getByText("Income tax").closest(".publication-equation-block")!;

    fireEvent.click(yBlock);
    expect(yBlock).toHaveClass("trace-root");
    expect(cBlock).toHaveClass("trace-input");
    expect(taxBlock).toHaveClass("trace-output");

    fireEvent.mouseEnter(cBlock);
    expect(yBlock).toHaveClass("trace-root");
    expect(cBlock).toHaveClass("trace-input");

    fireEvent.click(yBlock);
    fireEvent.mouseLeave(yBlock);
    expect(yBlock).not.toHaveClass("trace-root");
    expect(cBlock).not.toHaveClass("trace-input");
    expect(taxBlock).not.toHaveClass("trace-output");
  });
});
