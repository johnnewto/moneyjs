// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PinnedCellPanel } from "../src/notebook/components/PinnedCellPanel";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.sessionStorage.clear();
});

describe("PinnedCellPanel", () => {
  it("renders pinned cell content in a portal with title and close control", () => {
    const onClose = vi.fn();

    render(
      <PinnedCellPanel
        cellTitle="Balance sheet"
        cellType="matrix"
        maxPeriodIndex={4}
        selectedPeriodIndex={2}
        onClose={onClose}
        renderContent={() => <div>Pinned matrix body</div>}
      />
    );

    expect(screen.getByRole("dialog", { name: "Pinned view: Balance sheet" })).toBeInTheDocument();
    expect(screen.getByText("Balance sheet")).toBeInTheDocument();
    expect(screen.getByText("Period 3 of 5")).toBeInTheDocument();
    expect(screen.getByText("Pinned matrix body")).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: "Close pinned view" });
    fireEvent.pointerDown(closeButton, { button: 0, pointerId: 1 });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();

    render(
      <PinnedCellPanel
        cellTitle="Run baseline"
        cellType="run"
        maxPeriodIndex={0}
        selectedPeriodIndex={0}
        onClose={onClose}
        renderContent={() => <div>Run body</div>}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("passes the scroll root element to renderContent", () => {
    let capturedRoot: HTMLElement | null = null;

    render(
      <PinnedCellPanel
        cellTitle="Chart"
        cellType="chart"
        maxPeriodIndex={0}
        selectedPeriodIndex={0}
        onClose={() => {}}
        renderContent={(viewportRoot) => {
          capturedRoot = viewportRoot;
          return <div data-testid="pinned-body">Chart body</div>;
        }}
      />
    );

    expect(capturedRoot).toBeInstanceOf(HTMLElement);
    expect(capturedRoot).toHaveClass("notebook-pinned-cell-panel-body");
    expect(screen.getByTestId("pinned-body")).toBeInTheDocument();
  });

  it("exposes a resize handle on the panel", () => {
    render(
      <PinnedCellPanel
        cellTitle="Matrix"
        cellType="matrix"
        maxPeriodIndex={0}
        selectedPeriodIndex={0}
        onClose={() => {}}
        renderContent={() => <div>Body</div>}
      />
    );

    const panel = screen.getByRole("dialog", { name: "Pinned view: Matrix" });
    expect(screen.getByRole("separator", { name: "Resize pinned panel" })).toBeInTheDocument();
    expect(panel).toHaveStyle({ width: "720px", height: "480px" });
  });
});
