import { useEffect, useState, type RefObject } from "react";

import {
  measureNotebookFloatingHeaderTopPx,
  syncNotebookStickySurfaceTop
} from "./notebookStickySurface";

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

  useEffect(() => {
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

      const rootRect = scrollRoot.getBoundingClientRect();
      const stickyTop = measureNotebookFloatingHeaderTopPx(scrollRoot);
      const rowRect = headerRow.getBoundingClientRect();
      const wrapRect = tableWrap.getBoundingClientRect();
      const cellElement = cellRoot?.closest(".notebook-cell") ?? cellRoot;
      const cellRect = cellElement?.getBoundingClientRect();

      const rowScrolledPast = rowRect.bottom <= stickyTop + 0.5;
      const cellStillVisible =
        cellRect != null && cellRect.bottom > stickyTop + 4 && cellRect.top < rootRect.bottom;

      setVisible(rowScrolledPast && cellStillVisible);
      setAnchor({
        left: wrapRect.left,
        width: wrapRect.width,
        top: stickyTop
      });
    };

    update();

    scrollRoot.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);

    if (resizeObserver) {
      resizeObserver.observe(scrollRoot);
      const tableWrap = tableWrapRef.current;
      if (tableWrap) {
        resizeObserver.observe(tableWrap);
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
        window.removeEventListener("resize", update);
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
      window.removeEventListener("resize", update);
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
