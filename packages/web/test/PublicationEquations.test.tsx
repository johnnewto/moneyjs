// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
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
    expect(children[0]).toContain("publication-equation-description");
    expect(children[1]).toContain("publication-equation-expression");
  });
});
