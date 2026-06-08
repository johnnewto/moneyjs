// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { useLayoutEffect, useRef } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EQUATION_GAIN_COLUMN_COLLAPSED_STORAGE_KEY,
  EQUATION_INITIAL_COLUMN_COLLAPSED_STORAGE_KEY,
  EQUATION_ROLE_COLUMN_COLLAPSED_STORAGE_KEY,
  getEquationViewExpandedMinWidthPx,
  getEquationViewMinWidthPx,
  useEquationValueColumnsCollapse
} from "../src/hooks/useEquationValueColumnsCollapse";
import { NotebookEquationViewTable } from "../src/notebook/components/NotebookEquationViewTable";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

class MockResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element): void {
    const width = element.getBoundingClientRect().width;
    this.callback(
      [{ contentRect: { width } as DOMRectReadOnly, target: element } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }

  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

function mockElementWidth(element: HTMLElement, widthPx: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        width: widthPx,
        height: 0,
        top: 0,
        left: 0,
        right: widthPx,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect
  });
}

describe("useEquationValueColumnsCollapse", () => {
  function CollapseFixture({ widthPx }: { widthPx: number }) {
    const shellRef = useRef<HTMLDivElement | null>(null);
    const collapse = useEquationValueColumnsCollapse(shellRef);

    useLayoutEffect(() => {
      if (!shellRef.current) {
        return;
      }
      mockElementWidth(shellRef.current, widthPx);
    }, [widthPx]);

    return (
      <div>
        <div
          ref={shellRef}
          data-testid="shell"
          data-initial-collapsed={collapse.initialColumnCollapsed ? "true" : "false"}
          data-current-collapsed={collapse.currentColumnCollapsed ? "true" : "false"}
          data-gain-collapsed={collapse.gainColumnCollapsed ? "true" : "false"}
          data-role-collapsed={collapse.roleColumnCollapsed ? "true" : "false"}
          style={{ width: `${widthPx}px` }}
        />
        <button type="button" onClick={collapse.toggleInitialColumn}>
          Toggle initial
        </button>
        <button type="button" onClick={collapse.toggleCurrentColumn}>
          Toggle current
        </button>
        <button type="button" onClick={collapse.toggleGainColumn}>
          Toggle gain
        </button>
        <button type="button" onClick={collapse.toggleRoleColumn}>
          Toggle role
        </button>
      </div>
    );
  }

  it("auto-collapses the initial column when space is moderately tight", async () => {
    render(<CollapseFixture widthPx={getEquationViewExpandedMinWidthPx() - 20} />);

    await screen.findByTestId("shell");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-initial-collapsed", "true");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-current-collapsed", "false");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-gain-collapsed", "false");
  });

  it("auto-collapses gain when space is very tight", async () => {
    const widthPx = getEquationViewMinWidthPx({
      initialCollapsed: true,
      currentCollapsed: true,
      gainCollapsed: false,
      roleCollapsed: false
    }) - 20;
    render(<CollapseFixture widthPx={widthPx} />);

    await screen.findByTestId("shell");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-gain-collapsed", "true");
  });

  it("auto-collapses role when space is extremely tight", async () => {
    const widthPx =
      getEquationViewMinWidthPx({
        initialCollapsed: true,
        currentCollapsed: true,
        gainCollapsed: true,
        roleCollapsed: false
      }) - 20;
    render(<CollapseFixture widthPx={widthPx} />);

    await screen.findByTestId("shell");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-role-collapsed", "true");
  });

  it("keeps all value columns expanded when there is enough room", async () => {
    render(<CollapseFixture widthPx={getEquationViewExpandedMinWidthPx() + 120} />);

    await screen.findByTestId("shell");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-initial-collapsed", "false");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-current-collapsed", "false");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-gain-collapsed", "false");
    expect(screen.getByTestId("shell")).toHaveAttribute("data-role-collapsed", "false");
  });

  it("persists manual role toggles in local storage", async () => {
    render(<CollapseFixture widthPx={getEquationViewExpandedMinWidthPx() + 120} />);

    await screen.findByTestId("shell");
    fireEvent.click(screen.getByRole("button", { name: /toggle role/i }));

    expect(screen.getByTestId("shell")).toHaveAttribute("data-role-collapsed", "true");
    expect(window.localStorage.getItem(EQUATION_ROLE_COLUMN_COLLAPSED_STORAGE_KEY)).toBe("true");
  });

  it("persists manual gain toggles in local storage", async () => {
    render(<CollapseFixture widthPx={getEquationViewExpandedMinWidthPx() + 120} />);

    await screen.findByTestId("shell");
    fireEvent.click(screen.getByRole("button", { name: /toggle gain/i }));

    expect(screen.getByTestId("shell")).toHaveAttribute("data-gain-collapsed", "true");
    expect(window.localStorage.getItem(EQUATION_GAIN_COLUMN_COLLAPSED_STORAGE_KEY)).toBe("true");
    expect(window.localStorage.getItem(EQUATION_INITIAL_COLUMN_COLLAPSED_STORAGE_KEY)).toBeNull();
  });
});

function TableWithMockWidth({
  widthPx,
  ariaLabel = "Model equations"
}: {
  widthPx: number;
  ariaLabel?: string;
}) {
  const tableRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (tableRef.current) {
      mockElementWidth(tableRef.current, widthPx);
    }
  });

  return (
    <NotebookEquationViewTable ariaLabel={ariaLabel} tableShellRef={tableRef}>
      <div className="notebook-model-view-row" role="row">
        <span className="notebook-model-view-name" role="cell">
          Y
        </span>
        <span className="notebook-model-view-expression" role="cell">
          C + I
        </span>
        <span className="notebook-model-view-description" role="cell">
          Income = GDP
        </span>
        <span className="notebook-model-view-initial" role="cell">
          100
        </span>
        <span className="notebook-model-view-current" role="cell">
          110
        </span>
        <span className="notebook-model-view-gain" role="cell">
          0.1000
        </span>
        <span className="notebook-model-view-kind" role="cell">
          Auto
        </span>
      </div>
    </NotebookEquationViewTable>
  );
}

describe("NotebookEquationViewTable value columns", () => {
  it("shows separate triangle toggles for initial, current, gain, and role columns", () => {
    render(<TableWithMockWidth widthPx={getEquationViewExpandedMinWidthPx() + 120} />);

    expect(screen.getByRole("button", { name: /collapse initial column/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse current column/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse gain column/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse role column/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /gain/i })).toBeInTheDocument();
  });

  it("collapses the initial column first when space is moderately tight", () => {
    render(<TableWithMockWidth widthPx={getEquationViewExpandedMinWidthPx() - 20} />);

    const table = screen.getByRole("table", { name: /model equations/i });
    expect(table).toHaveClass("initial-column-collapsed");
    expect(table).not.toHaveClass("gain-column-collapsed");
  });
});
