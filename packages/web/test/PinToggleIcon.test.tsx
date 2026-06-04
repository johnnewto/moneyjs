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

  it("uses a filled pushpin head when pinned and outline when unpinned", () => {
    const { rerender } = render(<PinToggleIcon pinned={false} />);
    const outlineIcon = document.querySelector(".pin-toggle-icon-off");
    expect(outlineIcon).toHaveAttribute("width", "16");
    expect(outlineIcon?.querySelector("circle[fill='currentColor']")).not.toBeInTheDocument();

    rerender(<PinToggleIcon pinned={true} />);
    const pinnedIcon = document.querySelector(".pin-toggle-icon-on");
    expect(pinnedIcon?.querySelector("circle[fill='currentColor']")).toBeInTheDocument();
  });
});
