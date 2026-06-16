import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import {
  measureNotebookFloatingHeaderTopPx,
  syncNotebookStickySurfaceTop
} from "./notebookStickySurface";
import { resolveNotebookFloatingHeaderAnchor, syncMatrixFloatingTableColumnWidths } from "./syncMatrixFloatingTableLayout";

function scrollRootUsesOwnViewport(scrollRoot: Element): boolean {
  if (!(scrollRoot instanceof HTMLElement)) {
    return false;
  }

  const overflowY = getComputedStyle(scrollRoot).overflowY;
  const canScroll = scrollRoot.scrollHeight > scrollRoot.clientHeight + 1;
  return canScroll && (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay");
}

function resolveScrollViewport(
  scrollRoot: Element
): { top: number; bottom: number; usesOwnViewport: boolean } {
  const usesOwnViewport = scrollRootUsesOwnViewport(scrollRoot);
  if (usesOwnViewport) {
    const rootRect = scrollRoot.getBoundingClientRect();
    return { top: rootRect.top, bottom: rootRect.bottom, usesOwnViewport };
  }

  const view = scrollRoot.ownerDocument.defaultView ?? window;
  return { top: 0, bottom: view.innerHeight, usesOwnViewport };
}

function resolveFloatingHeaderTop(scrollRoot: Element, usesOwnViewport: boolean): number {
  if (usesOwnViewport) {
    return measureNotebookFloatingHeaderTopPx(scrollRoot);
  }

  const tray = scrollRoot.querySelector<HTMLElement>(".notebook-top-tray.has-period-scrubber");
  if (tray) {
    return tray.getBoundingClientRect().bottom;
  }

  return 0;
}

export function useNotebookFloatingHeaderRow({
  scrollRoot,
  headerRowRef,
  tableWrapRef,
  cellRootRef,
  enabled
}: {
  scrollRoot: Element | null;
  headerRowRef: RefObject<HTMLElement | null>;
  tableWrapRef: RefObject<HTMLElement | null>;
  cellRootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}): {
  visible: boolean;
  anchor: { left: number; width: number; top: number };
} {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, width: 0, top: 0 });

  useLayoutEffect(() => {
    if (!enabled || !scrollRoot) {
      setVisible(false);
      return;
    }

    const update = () => {
      const headerRow = headerRowRef.current;
      const tableWrap = tableWrapRef.current;
      const cellRoot = cellRootRef.current;
      if (!headerRow || !tableWrap) {
        setVisible(false);
        return;
      }

      if (scrollRoot instanceof HTMLElement) {
        syncNotebookStickySurfaceTop(scrollRoot);
      }

      const scrollViewport = resolveScrollViewport(scrollRoot);
      const stickyTop = resolveFloatingHeaderTop(scrollRoot, scrollViewport.usesOwnViewport);
      const rowRect = headerRow.getBoundingClientRect();
      const wrapRect = tableWrap.getBoundingClientRect();
      const cellElement = cellRoot?.closest(".notebook-cell") ?? cellRoot;
      const cellRect = cellElement?.getBoundingClientRect();

      const rowScrolledPast = rowRect.bottom <= stickyTop + 0.5;
      const cellStillVisible =
        cellRect != null &&
        cellRect.bottom > stickyTop + 4 &&
        cellRect.top < scrollViewport.bottom &&
        cellRect.bottom > scrollViewport.top;

      setVisible(rowScrolledPast && cellStillVisible);

      const table = tableWrap.querySelector("table");
      const tableRect = table?.getBoundingClientRect() ?? null;
      const { left, width } = resolveNotebookFloatingHeaderAnchor(wrapRect, tableRect);

      setAnchor({
        left,
        width,
        top: stickyTop
      });
    };

    update();
    const view = scrollRoot.ownerDocument.defaultView ?? window;

    const tableWrapElement = tableWrapRef.current;
    scrollRoot.addEventListener("scroll", update, { passive: true });
    tableWrapElement?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    view.addEventListener("scroll", update, { capture: true, passive: true });

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);

    if (resizeObserver) {
      resizeObserver.observe(scrollRoot);
      const tableWrap = tableWrapRef.current;
      if (tableWrap) {
        resizeObserver.observe(tableWrap);
        const table = tableWrap.querySelector("table");
        if (table) {
          resizeObserver.observe(table);
        }
      }
      const cellElement = cellRootRef.current?.closest(".notebook-cell") ?? cellRootRef.current;
      if (cellElement) {
        resizeObserver.observe(cellElement);
      }
    }

    if (typeof IntersectionObserver === "undefined") {
      return () => {
        resizeObserver?.disconnect();
        scrollRoot.removeEventListener("scroll", update);
        tableWrapElement?.removeEventListener("scroll", update);
        window.removeEventListener("resize", update);
        view.removeEventListener("scroll", update, { capture: true });
      };
    }

    const observer = new IntersectionObserver(update, {
      root: scrollRoot,
      threshold: [0, 1]
    });

    const headerRow = headerRowRef.current;
    if (headerRow) {
      observer.observe(headerRow);
    }
    const cellElement = cellRootRef.current?.closest(".notebook-cell") ?? cellRootRef.current;
    if (cellElement) {
      observer.observe(cellElement);
    }

    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      scrollRoot.removeEventListener("scroll", update);
      tableWrapElement?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      view.removeEventListener("scroll", update, { capture: true });
    };
  }, [cellRootRef, enabled, headerRowRef, scrollRoot, tableWrapRef]);

  return { visible, anchor };
}

export function useSyncedHorizontalScroll(
  sourceRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useEffect(() => {
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!enabled || !source || !target) {
      return;
    }

    const sync = () => {
      target.scrollLeft = source.scrollLeft;
    };

    sync();
    source.addEventListener("scroll", sync, { passive: true });
    return () => source.removeEventListener("scroll", sync);
  }, [enabled, sourceRef, targetRef]);
}

export function useSyncedMatrixFloatingTableLayout({
  enabled,
  sourceHeaderRowRef,
  targetTableRef,
  syncKey
}: {
  enabled: boolean;
  sourceHeaderRowRef: RefObject<HTMLTableRowElement | null>;
  targetTableRef: RefObject<HTMLTableElement | null>;
  syncKey?: string;
}): void {
  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const sourceHeaderRow = sourceHeaderRowRef.current;
    const targetTable = targetTableRef.current;
    if (!sourceHeaderRow || !targetTable) {
      return;
    }

    const sync = () => {
      const row = sourceHeaderRowRef.current;
      const table = targetTableRef.current;
      if (!row || !table) {
        return;
      }
      syncMatrixFloatingTableColumnWidths(row, table);
    };

    sync();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);

    resizeObserver?.observe(sourceHeaderRow);
    const sourceTable = sourceHeaderRow.closest("table");
    if (sourceTable) {
      resizeObserver?.observe(sourceTable);
    }
    resizeObserver?.observe(targetTable);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [enabled, sourceHeaderRowRef, syncKey, targetTableRef]);
}
