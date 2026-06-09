// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { InitialValuesEditor } from "../src/components/InitialValuesEditor";
import type { InitialValueRow } from "../src/lib/editorModel";

afterEach(() => {
  cleanup();
});

describe("InitialValuesEditor", () => {
  it("supports right-click initial value actions for adding, moving, and deleting rows", async () => {
    const user = userEvent.setup();
    const initialValues: InitialValueRow[] = [
      { id: "init-hh", name: "Hh", valueText: "80" },
      { id: "init-y", name: "Y", valueText: "100" }
    ];

    function StatefulInitialValuesEditor() {
      const [rows, setRows] = useState(initialValues);
      return <InitialValuesEditor initialValues={rows} issues={{}} onChange={setRows} />;
    }

    render(<StatefulInitialValuesEditor />);

    const getDataRows = () => screen.getAllByRole("row").slice(1);
    const hhRow = () => getDataRows()[0]!;

    fireEvent.contextMenu(hhRow());
    await user.click(
      within(screen.getByRole("menu", { name: /initial value actions for row 1/i })).getByRole(
        "menuitem",
        { name: /^add initial value$/i }
      )
    );
    expect(getDataRows()).toHaveLength(3);
    expect(within(getDataRows()[0]!).getByDisplayValue("Hh")).toBeInTheDocument();
    expect(within(getDataRows()[1]!).getByLabelText(/initial 2 name/i)).toHaveValue("");

    fireEvent.contextMenu(getDataRows()[2]!);
    await user.click(
      within(screen.getByRole("menu", { name: /initial value actions for row 3/i })).getByRole(
        "menuitem",
        { name: /move up/i }
      )
    );
    expect(within(getDataRows()[1]!).getByDisplayValue("Y")).toBeInTheDocument();

    fireEvent.contextMenu(hhRow());
    await user.click(
      within(screen.getByRole("menu", { name: /initial value actions for row 1/i })).getByRole(
        "menuitem",
        { name: /delete/i }
      )
    );
    await user.click(within(screen.getByRole("dialog", { name: /delete hh/i })).getByRole("button", {
      name: /cancel/i
    }));
    expect(within(getDataRows()[0]!).getByDisplayValue("Hh")).toBeInTheDocument();

    fireEvent.contextMenu(hhRow());
    await user.click(
      within(screen.getByRole("menu", { name: /initial value actions for row 1/i })).getByRole(
        "menuitem",
        { name: /delete/i }
      )
    );
    await user.click(within(screen.getByRole("dialog", { name: /delete hh/i })).getByRole("button", {
      name: /^delete$/i
    }));
    expect(getDataRows()).toHaveLength(2);
    expect(screen.queryByDisplayValue("Hh")).not.toBeInTheDocument();
  });

  it("supports enabling and disabling individual and all initial values", async () => {
    const user = userEvent.setup();
    const initialValues: InitialValueRow[] = [
      { id: "init-hh", name: "Hh", valueText: "80" },
      { id: "init-y", name: "Y", valueText: "100" }
    ];
    let latestRows = initialValues;

    function StatefulInitialValuesEditor() {
      const [rows, setRows] = useState(initialValues);
      latestRows = rows;
      return <InitialValuesEditor initialValues={rows} issues={{}} onChange={setRows} />;
    }

    render(<StatefulInitialValuesEditor />);

    await user.click(screen.getByRole("checkbox", { name: /enable initial value 1/i }));
    expect(latestRows.find((row) => row.id === "init-hh")?.enabled).toBe(false);
    expect(screen.getByText("Disabled")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /enable or disable all initial values/i }));
    expect(latestRows.every((row) => row.enabled !== false)).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: /enable or disable all initial values/i }));
    expect(latestRows.every((row) => row.enabled === false)).toBe(true);
  });

  it("shows remove external overlaps when externals are provided", () => {
    render(
      <InitialValuesEditor
        externals={[{ id: "ext-y", name: "Y", kind: "constant", valueText: "0" }]}
        initialValues={[
          { id: "init-y", name: "Y", valueText: "100" },
          { id: "init-h", name: "H", valueText: "50" }
        ]}
        issues={{}}
        onChange={() => undefined}
        onRemoveExternalOverlaps={() => undefined}
      />
    );

    expect(
      screen.getByRole("button", { name: /remove external overlaps/i })
    ).toBeEnabled();
  });

  it("disables remove external overlaps when there are no overlaps", () => {
    render(
      <InitialValuesEditor
        externals={[{ id: "ext-alpha", name: "alpha1", kind: "constant", valueText: "0.8" }]}
        initialValues={[{ id: "init-h", name: "H", valueText: "50" }]}
        issues={{}}
        onChange={() => undefined}
        onRemoveExternalOverlaps={() => undefined}
      />
    );

    expect(
      screen.getByRole("button", { name: /remove external overlaps/i })
    ).toBeDisabled();
  });
});
