// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useFloatingPanelSize } from "../src/hooks/useFloatingPanelSize";

afterEach(() => {
  cleanup();
  document.body.classList.remove("floating-panel-resize-body-lock");
  document.body.innerHTML = "";
  window.sessionStorage.clear();
});

function SizeFixture({
  position = { x: 48, y: 72 },
  storageKey = "test-floating-panel-size"
}: {
  position?: { x: number; y: number };
  storageKey?: string;
}) {
  const { size, resizeHandleProps } = useFloatingPanelSize({
    position,
    storageKey
  });

  return (
    <div
      data-testid="panel"
      style={{ height: size.height, width: size.width }}
    >
      <div {...resizeHandleProps} />
    </div>
  );
}

describe("useFloatingPanelSize", () => {
  it("restores size from session storage", () => {
    window.sessionStorage.setItem(
      "test-floating-panel-size",
      JSON.stringify({ width: 640, height: 360 })
    );

    render(<SizeFixture />);

    expect(screen.getByTestId("panel")).toHaveStyle({ width: "640px", height: "360px" });
  });

  it("grows the panel when dragging the resize handle", () => {
    render(<SizeFixture />);

    const panel = screen.getByTestId("panel");
    const handle = screen.getByRole("separator", { name: "Resize pinned panel" });

    expect(panel).toHaveStyle({ width: "720px", height: "480px" });

    fireEvent.mouseDown(handle, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(document, { clientX: 500, clientY: 380 });
    fireEvent.mouseUp(document);

    expect(panel).toHaveStyle({ width: "820px", height: "560px" });
    expect(document.body).not.toHaveClass("floating-panel-resize-body-lock");
  });
});
