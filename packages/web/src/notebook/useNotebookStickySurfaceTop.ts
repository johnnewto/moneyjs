import { useEffect } from "react";

import { syncNotebookStickySurfaceTop } from "./notebookStickySurface";

/** Keeps `--notebook-sticky-surface-top` aligned with the period scrubber tray height. */
export function useNotebookStickySurfaceTop(scrollRoot: HTMLElement | null): void {
  useEffect(() => {
    if (!scrollRoot) {
      return;
    }

    const update = () => {
      syncNotebookStickySurfaceTop(scrollRoot);
    };

    update();

    scrollRoot.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(update);

    if (resizeObserver) {
      resizeObserver.observe(scrollRoot);
      const tray = scrollRoot.querySelector(".notebook-top-tray.has-period-scrubber");
      if (tray) {
        resizeObserver.observe(tray);
      }
    }

    return () => {
      resizeObserver?.disconnect();
      scrollRoot.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrollRoot]);
}
