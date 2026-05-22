// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SequenceDiagramCanvas } from "../src/components/SequenceDiagramCanvas";

afterEach(() => {
  cleanup();
});

describe("SequenceDiagramCanvas", () => {
  it("uses a narrower minimum width for small diagrams", () => {
    render(
      <SequenceDiagramCanvas
        diagram={{
          participants: [
            { id: "Households", label: "Households", order: 0 },
            { id: "Firms", label: "Firms", order: 1 }
          ],
          steps: [
            {
              type: "message",
              senderId: "Households",
              receiverId: "Firms",
              label: "Consumption",
              lineStyle: "solid"
            }
          ],
          errors: []
        }}
        visibleStepCount={1}
        highlightedStepIndex={null}
      />
    );

    expect(screen.getByRole("img", { name: "Sequence diagram" })).toHaveAttribute("width", "360");
  });

  it("keeps wider diagrams scrollable when participant spacing needs it", () => {
    render(
      <SequenceDiagramCanvas
        diagram={{
          participants: [
            { id: "Households", label: "Households", order: 0 },
            { id: "Firms", label: "Firms", order: 1 },
            { id: "Banks", label: "Banks", order: 2 },
            { id: "Government", label: "Government", order: 3 },
            { id: "RestOfWorld", label: "Rest of world", order: 4 }
          ],
          steps: [
            {
              type: "message",
              senderId: "Households",
              receiverId: "Firms",
              label: "Consumption",
              lineStyle: "solid"
            }
          ],
          errors: []
        }}
        visibleStepCount={1}
        highlightedStepIndex={null}
      />
    );

    expect(screen.getByRole("img", { name: "Sequence diagram" })).toHaveAttribute("width", "650");
  });

  it("renders negative message labels in red", () => {
    render(
      <SequenceDiagramCanvas
        diagram={{
          participants: [
            { id: "Banks", label: "Banks", order: 0 },
            { id: "Rentiers", label: "Rentiers", order: 1 }
          ],
          steps: [
            {
              type: "message",
              senderId: "Banks",
              receiverId: "Rentiers",
              label: "Bank profits (-0.20)",
              lineStyle: "solid",
              magnitude: -0.2
            }
          ],
          errors: []
        }}
        visibleStepCount={1}
        highlightedStepIndex={null}
      />
    );

    const label = screen.getByText("Bank profits (-0.20)");
    const textNode = label.closest("text");
    expect(textNode).not.toBeNull();
    if (textNode?.tagName.toLowerCase() !== "text") {
      throw new Error("Expected SVG text element for sequence label.");
    }
    expect(textNode).toHaveAttribute("fill", "#b42318");
  });
});
