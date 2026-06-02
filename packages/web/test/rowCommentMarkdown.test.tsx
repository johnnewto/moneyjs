// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RowCommentMarkdown } from "../src/notebook/components/RowCommentMarkdown";

describe("RowCommentMarkdown", () => {
  it("renders inline markdown without heading hashes", () => {
    render(<RowCommentMarkdown text="**Supply** block for `Y`" />);

    expect(screen.getByText("Supply").tagName).toBe("STRONG");
    expect(screen.getByText("Y").tagName).toBe("CODE");
    expect(screen.queryByText(/^##/)).toBeNull();
  });

  it("unwraps markdown headings to plain inline text", () => {
    render(<RowCommentMarkdown text="## Equalize supply" />);

    expect(screen.getByText("Equalize supply")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
