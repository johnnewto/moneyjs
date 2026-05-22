// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY,
  useEquationGridColumnResize
} from "../src/hooks/useEquationGridColumnResize";

afterEach(() => {
  cleanup();
  document.body.classList.remove("panel-splitter-body-lock");
  window.localStorage.clear();
});

function EquationGridResizeFixture({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const columnResize = useEquationGridColumnResize({ isEmbedded });

  return (
    <div
      ref={columnResize.shellRef}
      className={`equation-grid-shell${columnResize.shellClassName ? ` ${columnResize.shellClassName}` : ""}`.trim()}
      style={{ width: 960 }}
    >
      <div className="equation-grid-header" role="row">
        <span>#</span>
        <span ref={columnResize.variableHeaderRef}>Variable</span>
        <span>Expression</span>
        <span>Role</span>
        <span>Description</span>
        <span>Status</span>
        <span />
        <div {...columnResize.resizeHandleProps} />
      </div>
    </div>
  );
}

describe("useEquationGridColumnResize", () => {
  it("updates variable column width while dragging", () => {
    const { container } = render(<EquationGridResizeFixture />);
    const shell = container.querySelector(".equation-grid-shell");
    const separator = screen.getByRole("separator", { name: /resize variable column/i });

    expect(shell).toBeInstanceOf(HTMLDivElement);
    if (!(shell instanceof HTMLDivElement)) {
      throw new Error("Expected equation grid shell.");
    }

    expect(shell.style.getPropertyValue("--eq-col-variable-width")).toBe("140px");

    fireEvent.mouseDown(separator, { button: 0, clientX: 300 });
    fireEvent.mouseMove(document, { clientX: 360 });

    expect(shell.style.getPropertyValue("--eq-col-variable-width")).toBe("200px");
    expect(separator).toHaveAttribute("aria-valuenow", "200");
    expect(document.body).toHaveClass("panel-splitter-body-lock");

    fireEvent.mouseUp(document);

    expect(document.body).not.toHaveClass("panel-splitter-body-lock");
    expect(window.localStorage.getItem(EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.workspace)).toBe(
      "200"
    );
  });

  it("uses separate storage for embedded grids", () => {
    const { unmount } = render(<EquationGridResizeFixture isEmbedded />);
    const separator = screen.getByRole("separator", { name: /resize variable column/i });

    fireEvent.mouseDown(separator, { button: 0, clientX: 300 });
    fireEvent.mouseMove(document, { clientX: 330 });
    fireEvent.mouseUp(document);

    expect(
      window.localStorage.getItem(EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.embedded)
    ).toBe("190");
    expect(
      window.localStorage.getItem(EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.workspace)
    ).toBeNull();

    unmount();
    cleanup();

    render(<EquationGridResizeFixture />);
    const workspaceShell = document.querySelector(".equation-grid-shell");
    expect(workspaceShell).toHaveStyle({ "--eq-col-variable-width": "140px" });
  });

  it("supports keyboard resizing", () => {
    const { container } = render(<EquationGridResizeFixture />);
    const shell = container.querySelector(".equation-grid-shell");
    const separator = screen.getByRole("separator", { name: /resize variable column/i });

    expect(shell).toBeInstanceOf(HTMLDivElement);
    if (!(shell instanceof HTMLDivElement)) {
      throw new Error("Expected equation grid shell.");
    }

    separator.focus();
    fireEvent.keyDown(separator, { key: "ArrowRight" });

    expect(shell.style.getPropertyValue("--eq-col-variable-width")).toBe("148px");
    expect(separator).toHaveAttribute("aria-valuenow", "148");
  });
});
