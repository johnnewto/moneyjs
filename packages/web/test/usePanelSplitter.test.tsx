// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { usePanelSplitter } from "../src/hooks/usePanelSplitter";

afterEach(() => {
  cleanup();
  document.body.classList.remove("panel-splitter-body-lock");
  window.localStorage.clear();
});

function PanelSplitterFixture({ storageKey }: { storageKey?: string } = {}) {
  const splitter = usePanelSplitter({
    defaultLeftWidthPercent: 55,
    minLeftWidthPx: 400,
    minRightWidthPx: 300,
    storageKey
  });

  return (
    <div ref={splitter.layoutRef}>
      <div>Left panel</div>
      <div {...splitter.splitterProps} />
      <div>Right panel</div>
    </div>
  );
}

function setLayoutBounds(element: HTMLElement, width: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 600,
      height: 600,
      left: 100,
      right: 100 + width,
      top: 0,
      width,
      x: 100,
      y: 0,
      toJSON: () => ({})
    })
  });
}

describe("usePanelSplitter", () => {
  it("updates the separator value while dragging", () => {
    const { container } = render(<PanelSplitterFixture />);
    const layout = container.firstElementChild;
    const separator = screen.getByRole("separator", { name: /resize panels/i });

    expect(layout).toBeInstanceOf(HTMLDivElement);
    if (!(layout instanceof HTMLDivElement)) {
      throw new Error("Expected layout element.");
    }

    setLayoutBounds(layout, 1200);

    fireEvent.mouseDown(separator, { button: 0, clientX: 760 });
    fireEvent.mouseMove(document, { clientX: 940 });

    expect(separator).toHaveAttribute("aria-valuenow", "70");
    expect(document.body).toHaveClass("panel-splitter-body-lock");

    fireEvent.mouseUp(document);

    expect(document.body).not.toHaveClass("panel-splitter-body-lock");
  });

  it("supports keyboard resizing", () => {
    const { container } = render(<PanelSplitterFixture />);
    const layout = container.firstElementChild;
    const separator = screen.getByRole("separator", { name: /resize panels/i });

    expect(layout).toBeInstanceOf(HTMLDivElement);
    if (!(layout instanceof HTMLDivElement)) {
      throw new Error("Expected layout element.");
    }

    setLayoutBounds(layout, 1200);

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeGreaterThan(55);

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "34");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "75");
  });

  it("restores the splitter position from localStorage", () => {
    window.localStorage.setItem("test-splitter", "63");

    render(<PanelSplitterFixture storageKey="test-splitter" />);

    expect(screen.getByRole("separator", { name: /resize panels/i })).toHaveAttribute(
      "aria-valuenow",
      "63"
    );
  });

  it("persists the splitter position to localStorage after resizing", () => {
    const { container } = render(<PanelSplitterFixture storageKey="test-splitter" />);
    const layout = container.firstElementChild;
    const separator = screen.getByRole("separator", { name: /resize panels/i });

    expect(layout).toBeInstanceOf(HTMLDivElement);
    if (!(layout instanceof HTMLDivElement)) {
      throw new Error("Expected layout element.");
    }

    setLayoutBounds(layout, 1200);

    fireEvent.mouseDown(separator, { button: 0, clientX: 760 });
    fireEvent.mouseMove(document, { clientX: 880 });
    fireEvent.mouseUp(document);

    expect(window.localStorage.getItem("test-splitter")).toBe("65");
  });
});