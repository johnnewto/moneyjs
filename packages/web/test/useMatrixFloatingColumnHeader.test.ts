// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";

import { useNotebookFloatingHeaderRow } from "../src/notebook/useNotebookFloatingHeaderRow";

describe("useNotebookFloatingHeaderRow", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn()
      }))
    );
    vi.stubGlobal(
      "ResizeObserver",
      vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn()
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("starts hidden when the column row is still below the sticky surface", () => {
    const scrollRoot = document.createElement("div");
    scrollRoot.style.setProperty("--notebook-sticky-surface-top", "0px");
    document.body.appendChild(scrollRoot);

    const columnRow = document.createElement("tr");
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.appendChild(columnRow);
    table.appendChild(thead);

    const wrap = document.createElement("div");
    wrap.appendChild(table);
    scrollRoot.appendChild(wrap);

    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      value: () => ({ top: 0, bottom: 800, left: 0, right: 400 } as DOMRect)
    });
    Object.defineProperty(columnRow, "getBoundingClientRect", {
      value: () => ({ top: 40, bottom: 72, left: 0, right: 400 } as DOMRect)
    });
    Object.defineProperty(wrap, "getBoundingClientRect", {
      value: () => ({ top: 20, bottom: 500, left: 8, right: 408, width: 400 } as DOMRect)
    });

    const headerRowRef = createRef<HTMLTableRowElement>();
    headerRowRef.current = columnRow;
    const tableWrapRef = createRef<HTMLDivElement>();
    tableWrapRef.current = wrap;
    const cellRootRef = createRef<HTMLDivElement>();

    const { result } = renderHook(() =>
      useNotebookFloatingHeaderRow({
        scrollRoot,
        headerRowRef,
        tableWrapRef,
        cellRootRef,
        enabled: true
      })
    );

    expect(result.current.visible).toBe(false);
    document.body.removeChild(scrollRoot);
  });

  it("shows when the supplied root is not the scrolling viewport", () => {
    const scrollRoot = document.createElement("div");
    scrollRoot.style.overflowY = "visible";
    document.body.appendChild(scrollRoot);

    const columnRow = document.createElement("tr");
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.appendChild(columnRow);
    table.appendChild(thead);

    const wrap = document.createElement("div");
    wrap.appendChild(table);
    scrollRoot.appendChild(wrap);

    const cellRoot = document.createElement("div");
    cellRoot.className = "notebook-cell";
    scrollRoot.appendChild(cellRoot);

    Object.defineProperty(window, "innerHeight", {
      value: 600,
      configurable: true
    });
    Object.defineProperty(scrollRoot, "clientHeight", {
      value: 900,
      configurable: true
    });
    Object.defineProperty(scrollRoot, "scrollHeight", {
      value: 900,
      configurable: true
    });
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      value: () => ({ top: -120, bottom: 900, left: 0, right: 400 } as DOMRect)
    });
    Object.defineProperty(columnRow, "getBoundingClientRect", {
      value: () => ({ top: -40, bottom: -8, left: 0, right: 400 } as DOMRect)
    });
    Object.defineProperty(wrap, "getBoundingClientRect", {
      value: () => ({ top: -64, bottom: 500, left: 8, right: 408, width: 400 } as DOMRect)
    });
    Object.defineProperty(cellRoot, "getBoundingClientRect", {
      value: () => ({ top: -80, bottom: 520, left: 0, right: 400 } as DOMRect)
    });

    const headerRowRef = createRef<HTMLTableRowElement>();
    headerRowRef.current = columnRow;
    const tableWrapRef = createRef<HTMLDivElement>();
    tableWrapRef.current = wrap;
    const cellRootRef = createRef<HTMLDivElement>();
    cellRootRef.current = cellRoot;

    const { result } = renderHook(() =>
      useNotebookFloatingHeaderRow({
        scrollRoot,
        headerRowRef,
        tableWrapRef,
        cellRootRef,
        enabled: true
      })
    );

    expect(result.current.visible).toBe(true);
    expect(result.current.anchor.top).toBe(0);
    document.body.removeChild(scrollRoot);
  });

  it("observes layout changes on the scroll root and table wrap", () => {
    const scrollRoot = document.createElement("div");
    document.body.appendChild(scrollRoot);
    const wrap = document.createElement("div");
    scrollRoot.appendChild(wrap);

    const headerRow = document.createElement("div");
    const headerRowRef = createRef<HTMLDivElement>();
    headerRowRef.current = headerRow;
    const tableWrapRef = createRef<HTMLDivElement>();
    tableWrapRef.current = wrap;
    const cellRootRef = createRef<HTMLDivElement>();

    renderHook(() =>
      useNotebookFloatingHeaderRow({
        scrollRoot,
        headerRowRef,
        tableWrapRef,
        cellRootRef,
        enabled: true
      })
    );

    const ResizeObserverMock = ResizeObserver as unknown as ReturnType<typeof vi.fn>;
    const instance = ResizeObserverMock.mock.results[0]?.value;
    expect(instance.observe).toHaveBeenCalledWith(scrollRoot);
    expect(instance.observe).toHaveBeenCalledWith(wrap);

    document.body.removeChild(scrollRoot);
  });
});
