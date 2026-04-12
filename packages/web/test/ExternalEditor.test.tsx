// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExternalEditor } from "../src/components/ExternalEditor";

afterEach(() => {
  cleanup();
});

describe("ExternalEditor", () => {
  it("renders externals in a compact grid with status cells", () => {
    render(
      <ExternalEditor
        externals={[
          { id: "ext-1", name: "alpha1", kind: "constant", valueText: "0.6" },
          { id: "ext-2", name: "Gd", kind: "series", valueText: "20, 21, 22" }
        ]}
        issues={{ "externals.1.valueText": "series values are invalid" }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
    expect(screen.getByLabelText(/external 1 name/i)).toHaveValue("alpha1");
    expect(screen.getByLabelText(/external 2 kind/i)).toHaveValue("series");
    expect(screen.getByText(/series values are invalid/i)).toBeInTheDocument();
  });

  it("adds a new external row", () => {
    const onChange = vi.fn();

    render(<ExternalEditor externals={[]} issues={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add external/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(1);
  });
});
