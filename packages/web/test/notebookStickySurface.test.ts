// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  measureNotebookFloatingHeaderTopPx,
  measureNotebookStickySurfaceTopPx,
  syncNotebookStickySurfaceTop
} from "../src/notebook/notebookStickySurface";

describe("notebookStickySurface", () => {
  it("measures floating header top from the scrubber tray bottom edge", () => {
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      value: () => ({ top: 100, bottom: 900, left: 0, right: 800 } as DOMRect)
    });

    const tray = document.createElement("div");
    tray.className = "notebook-top-tray has-period-scrubber";
    Object.defineProperty(tray, "getBoundingClientRect", {
      value: () => ({ top: 100, bottom: 152, left: 0, right: 800 } as DOMRect)
    });
    scrollRoot.appendChild(tray);

    expect(measureNotebookFloatingHeaderTopPx(scrollRoot)).toBe(152);
    expect(measureNotebookStickySurfaceTopPx(scrollRoot)).toBe(52);

    syncNotebookStickySurfaceTop(scrollRoot);
    expect(scrollRoot.style.getPropertyValue("--notebook-sticky-surface-top")).toBe("52px");
  });

  it("uses the scroll root top when no scrubber tray is present", () => {
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      value: () => ({ top: 40, bottom: 900, left: 0, right: 800 } as DOMRect)
    });

    expect(measureNotebookFloatingHeaderTopPx(scrollRoot)).toBe(40);
    expect(measureNotebookStickySurfaceTopPx(scrollRoot)).toBe(0);
  });
});
