// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExternalRow } from "../src/lib/editorModel";
import { ExternalEditor } from "../src/components/ExternalEditor";

afterEach(() => {
  cleanup();
});

describe("ExternalEditor", () => {
  it("renders externals in a compact grid with status cells", () => {
    render(
      <ExternalEditor
        externals={[
          {
            id: "ext-1",
            name: "alpha1",
            desc: "Propensity to consume out of income",
            kind: "constant",
            valueText: "0.6"
          },
          { id: "ext-2", name: "Gd", kind: "series", valueText: "20, 21, 22" }
        ]}
        issues={{ "externals.1.valueText": "series values are invalid" }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
    expect(screen.getByLabelText(/external 1 name/i)).toHaveValue("alpha1");
    expect(screen.getByLabelText(/external 1 description/i)).toHaveValue(
      "Propensity to consume out of income"
    );
    expect(screen.getByLabelText(/external 2 kind/i)).toHaveValue("series");
    expect(screen.getByText(/series values are invalid/i)).toBeInTheDocument();
  });

  it("edits an external description", () => {
    const onChange = vi.fn();

    render(
      <ExternalEditor
        externals={[{ id: "ext-1", name: "alpha1", kind: "constant", valueText: "0.6" }]}
        issues={{}}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText(/external 1 description/i), {
      target: { value: "Updated description" }
    });

    expect(onChange).toHaveBeenCalledWith([
      {
        id: "ext-1",
        name: "alpha1",
        desc: "Updated description",
        kind: "constant",
        valueText: "0.6"
      }
    ]);
  });

  it("adds a new external row", () => {
    const onChange = vi.fn();

    render(<ExternalEditor externals={[]} issues={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add external/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("supports right-click external actions for adding, moving, and deleting rows", async () => {
    const user = userEvent.setup();
    const initialExternals: ExternalRow[] = [
      { id: "ext-g", name: "G", kind: "constant", valueText: "20" },
      { id: "ext-alpha1", name: "alpha1", kind: "constant", valueText: "0.6" }
    ];

    function StatefulExternalEditor() {
      const [externals, setExternals] = useState(initialExternals);
      return <ExternalEditor externals={externals} issues={{}} onChange={setExternals} />;
    }

    render(<StatefulExternalEditor />);

    const getDataRows = () => screen.getAllByRole("row").slice(1);
    const gRow = () => getDataRows()[0]!;

    fireEvent.contextMenu(gRow());
    await user.click(
      within(screen.getByRole("menu", { name: /external actions for row 1/i })).getByRole("menuitem", {
        name: /^add external$/i
      })
    );
    expect(getDataRows()).toHaveLength(3);
    expect(within(getDataRows()[0]!).getByDisplayValue("G")).toBeInTheDocument();
    expect(within(getDataRows()[1]!).getByLabelText(/external 2 name/i)).toHaveValue("");

    fireEvent.contextMenu(gRow());
    await user.click(
      within(screen.getByRole("menu", { name: /external actions for row 1/i })).getByRole("menuitem", {
        name: /delete/i
      })
    );
    await user.click(within(screen.getByRole("dialog", { name: /delete g/i })).getByRole("button", {
      name: /^delete$/i
    }));
    expect(getDataRows()).toHaveLength(2);
    expect(screen.queryByDisplayValue("G")).not.toBeInTheDocument();
  });
});
