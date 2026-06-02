// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PinToggleIcon } from "../src/components/PinToggleIcon";

describe("PinToggleIcon", () => {
  it("renders outline and filled variants for unpinned and pinned states", () => {
    const { rerender } = render(<PinToggleIcon pinned={false} />);
    expect(document.querySelector(".pin-toggle-icon-off")).toBeInTheDocument();
    expect(document.querySelector(".pin-toggle-icon-on")).not.toBeInTheDocument();

    rerender(<PinToggleIcon pinned={true} />);
    expect(document.querySelector(".pin-toggle-icon-on")).toBeInTheDocument();
    expect(document.querySelector(".pin-toggle-icon-off")).not.toBeInTheDocument();
  });

  it("is decorative and hidden from the accessibility tree", () => {
    render(<PinToggleIcon pinned={false} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
