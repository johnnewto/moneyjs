// @vitest-environment jsdom

import { useState } from "react";

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDragScroll } from "../src/hooks/useDragScroll";

afterEach(() => {
  cleanup();
  document.body.classList.remove("drag-scroll-body-lock");
});

function DragScrollFixture() {
  const dragScroll = useDragScroll<HTMLDivElement>();
  const [buttonClicks, setButtonClicks] = useState(0);

  return (
    <div
      ref={dragScroll.dragScrollRef}
      className={dragScroll.dragScrollProps.className}
      onClickCapture={dragScroll.dragScrollProps.onClickCapture}
      onMouseDown={dragScroll.dragScrollProps.onMouseDown}
    >
      <div>Scrollable content</div>
      <button type="button" onClick={() => setButtonClicks((current) => current + 1)}>
        Interactive button {buttonClicks}
      </button>
      <input aria-label="Interactive input" />
    </div>
  );
}

function getSurface(container: HTMLElement): HTMLDivElement {
  const surface = container.firstElementChild;

  expect(surface).toBeInstanceOf(HTMLDivElement);
  if (!(surface instanceof HTMLDivElement)) {
    throw new Error("Expected drag-scroll surface.");
  }

  return surface;
}

function setVerticalOverflow(surface: HTMLDivElement) {
  Object.defineProperty(surface, "scrollHeight", {
    configurable: true,
    value: 1000
  });
  Object.defineProperty(surface, "clientHeight", {
    configurable: true,
    value: 120
  });
}

describe("useDragScroll", () => {
  it("scrolls the container when dragging with the mouse", () => {
    const { container } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    setVerticalOverflow(surface);
    surface.scrollTop = 180;

    fireEvent.mouseDown(surface, { button: 0, clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 136 });

    expect(surface.scrollTop).toBe(144);
    expect(surface).toHaveClass("drag-scroll-active");
    expect(document.body).toHaveClass("drag-scroll-body-lock");

    fireEvent.mouseUp(document);

    expect(surface).not.toHaveClass("drag-scroll-active");
    expect(document.body).not.toHaveClass("drag-scroll-body-lock");
  });

  it("does not start drag scrolling from text entry controls", () => {
    const { container, getByRole } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    setVerticalOverflow(surface);
    surface.scrollTop = 180;

    fireEvent.mouseDown(getByRole("textbox", { name: /interactive input/i }), {
      button: 0,
      clientY: 100
    });
    fireEvent.mouseMove(document, { clientY: 140 });

    expect(surface.scrollTop).toBe(180);
    expect(surface).not.toHaveClass("drag-scroll-active");
  });

  it("allows dragging from buttons and suppresses the click after a drag", () => {
    const { container, getByRole } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    setVerticalOverflow(surface);
    surface.scrollTop = 180;

    const button = getByRole("button", { name: /interactive button 0/i });

    fireEvent.mouseDown(button, { button: 0, clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 140 });
    fireEvent.mouseUp(document);
    fireEvent.click(button);

    expect(surface.scrollTop).toBe(140);
    expect(getByRole("button", { name: /interactive button 0/i })).toBeInTheDocument();
  });

  it("does not start drag scrolling when Ctrl is held for native selection", () => {
    const { container } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    setVerticalOverflow(surface);
    surface.scrollTop = 180;

    fireEvent.mouseDown(surface, { button: 0, clientY: 100, ctrlKey: true });
    fireEvent.mouseMove(document, { clientY: 140 });

    expect(surface.scrollTop).toBe(180);
    expect(surface).not.toHaveClass("drag-scroll-active");
  });

  it("does not start drag scrolling when Meta is held for native selection", () => {
    const { container } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    setVerticalOverflow(surface);
    surface.scrollTop = 180;

    fireEvent.mouseDown(surface, { button: 0, clientY: 100, metaKey: true });
    fireEvent.mouseMove(document, { clientY: 140 });

    expect(surface.scrollTop).toBe(180);
    expect(surface).not.toHaveClass("drag-scroll-active");
  });

  it("switches to selection cursor mode while Ctrl is held", () => {
    const { container } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    expect(surface).toHaveClass("drag-scroll-select-mode");

    fireEvent.keyUp(window, { key: "Control", ctrlKey: false });
    expect(surface).not.toHaveClass("drag-scroll-select-mode");
  });

  it("scrolls horizontally when the surface overflows on the x axis", () => {
    const { container } = render(<DragScrollFixture />);
    const surface = getSurface(container);

    Object.defineProperty(surface, "scrollWidth", {
      configurable: true,
      value: 1000
    });
    Object.defineProperty(surface, "clientWidth", {
      configurable: true,
      value: 120
    });
    Object.defineProperty(surface, "scrollHeight", {
      configurable: true,
      value: 120
    });
    Object.defineProperty(surface, "clientHeight", {
      configurable: true,
      value: 120
    });
    surface.scrollLeft = 180;

    fireEvent.mouseDown(surface, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 136, clientY: 100 });

    expect(surface.scrollLeft).toBe(144);
    expect(surface).toHaveClass("drag-scroll-active");
  });
});
