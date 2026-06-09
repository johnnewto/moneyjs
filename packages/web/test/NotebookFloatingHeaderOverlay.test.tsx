// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { useRef } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookFloatingHeaderOverlay } from "../src/notebook/components/NotebookFloatingHeaderOverlay";
import { EquationsModelViewHeaderRowStatic } from "../src/notebook/components/notebookModelViewHeaderRows";

afterEach(() => {
  cleanup();
});

describe("NotebookFloatingHeaderOverlay", () => {
  it("re-syncs collapse classes when tableSyncKey changes", () => {
    const onToggleInitialColumn = vi.fn();

    function Fixture({ tableSyncKey }: { tableSyncKey: string }) {
      const sourceRef = useRef<HTMLDivElement | null>(null);

      return (
        <div>
          <div
            ref={sourceRef}
            className="notebook-model-view-table-resizable layout-equation-view initial-column-collapsed"
          />
          <NotebookFloatingHeaderOverlay
            visible
            anchor={{ left: 0, width: 400, top: 0 }}
            horizontalScrollSourceRef={sourceRef}
            resizableTableSourceRef={sourceRef}
            tableSyncKey={tableSyncKey}
            interactive
          >
            <EquationsModelViewHeaderRowStatic
              initialColumnCollapsed
              onToggleInitialColumn={onToggleInitialColumn}
            />
          </NotebookFloatingHeaderOverlay>
        </div>
      );
    }

    const { rerender, container } = render(<Fixture tableSyncKey="a" />);

    const floatingShell = container.querySelector(
      ".notebook-floating-header .notebook-model-view-table-resizable"
    );
    expect(floatingShell).toHaveClass("initial-column-collapsed");

    rerender(<Fixture tableSyncKey="b" />);
    expect(floatingShell).toHaveClass("initial-column-collapsed");
  });

  it("routes collapse toggles from the floating header", () => {
    const onToggleCurrentColumn = vi.fn();

    function Fixture() {
      const sourceRef = useRef<HTMLDivElement | null>(null);

      return (
        <div>
          <div
            ref={sourceRef}
            className="notebook-model-view-table-resizable layout-equation-view"
          />
          <NotebookFloatingHeaderOverlay
            visible
            anchor={{ left: 0, width: 400, top: 0 }}
            horizontalScrollSourceRef={sourceRef}
            resizableTableSourceRef={sourceRef}
            interactive
          >
            <EquationsModelViewHeaderRowStatic
              currentColumnCollapsed={false}
              onToggleCurrentColumn={onToggleCurrentColumn}
            />
          </NotebookFloatingHeaderOverlay>
        </div>
      );
    }

    render(<Fixture />);

    fireEvent.click(screen.getByRole("button", { name: /collapse current column/i }));
    expect(onToggleCurrentColumn).toHaveBeenCalledTimes(1);
  });
});
