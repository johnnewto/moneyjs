// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoveInitialValueExternalOverlapDialog } from "../src/notebook/components/RemoveInitialValueExternalOverlapDialog";

afterEach(() => {
  cleanup();
});

describe("RemoveInitialValueExternalOverlapDialog", () => {
  it("shows overlapping rows and applies removal", () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(
      <RemoveInitialValueExternalOverlapDialog
        externals={[{ id: "ext-y", name: "Y", kind: "constant", valueText: "0" }]}
        initialValues={[
          { id: "init-y", name: "Y", valueText: "100" },
          { id: "init-h", name: "H", valueText: "50" }
        ]}
        isOpen
        onApply={onApply}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(/1 initial value row overlaps/i)).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
    expect(screen.getByText(/External \(constant\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove overlapping rows/i }));
    expect(onApply).toHaveBeenCalledWith({
      overlaps: [
        {
          name: "Y",
          externalKind: "constant",
          initialValueText: "100",
          initialValueEnabled: true
        }
      ]
    });
  });
});
