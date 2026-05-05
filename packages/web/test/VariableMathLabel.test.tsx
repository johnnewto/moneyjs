// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VariableMathLabel } from "../src/components/VariableMathLabel";

afterEach(() => {
  cleanup();
});

describe("VariableMathLabel", () => {
  it("renders grouped superscripts and subscripts locally", () => {
    render(<VariableMathLabel name="yd^{HS}_1" />);

    expect(screen.getByText("HS", { selector: "sup" })).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "sub" })).toBeInTheDocument();
  });
});