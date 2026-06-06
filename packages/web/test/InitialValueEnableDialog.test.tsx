// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InitialValueEnableDialog } from "../src/notebook/components/InitialValueEnableDialog";

afterEach(() => {
  cleanup();
});

describe("InitialValueEnableDialog", () => {
  it("shows checklist checkboxes and applies selected criteria", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(
      <InitialValueEnableDialog
        cells={[]}
        equations={[{ id: "eq-mh", name: "Mh", expression: "Mh' + YD - Cd" }]}
        initialValues={[{ id: "init-mh", name: "Mh", valueText: "80" }]}
        isOpen
        onApply={onApply}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole("dialog", { name: /enable needed initial values/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^lagged$/i)).toBeChecked();
    expect(screen.getByLabelText(/^stock$/i)).toBeChecked();
    expect(screen.getByLabelText(/^denominator$/i)).toBeChecked();
    expect(screen.getByLabelText(/^balance sheet$/i)).toBeChecked();

    await user.click(screen.getByLabelText(/^stock$/i));
    await user.click(screen.getByLabelText(/^denominator$/i));
    await user.click(screen.getByLabelText(/^balance sheet$/i));
    await user.click(screen.getByRole("button", { name: /enable matching/i }));

    expect(onApply).toHaveBeenCalledWith({
      lagged: true,
      stock: false,
      denominator: false,
      balanceSheet: false
    });
  });
});
