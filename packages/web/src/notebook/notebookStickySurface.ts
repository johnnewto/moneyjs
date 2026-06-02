/** Offset from the main column top for `position: sticky` row headers (px). */
export function measureNotebookStickySurfaceTopPx(scrollRoot: Element): number {
  const tray = scrollRoot.querySelector<HTMLElement>(".notebook-top-tray.has-period-scrubber");
  if (!tray) {
    return 0;
  }

  const rootRect = scrollRoot.getBoundingClientRect();
  return Math.max(0, tray.getBoundingClientRect().bottom - rootRect.top);
}

/** Viewport `top` for fixed floating matrix column headers (px). */
export function measureNotebookFloatingHeaderTopPx(scrollRoot: Element): number {
  const tray = scrollRoot.querySelector<HTMLElement>(".notebook-top-tray.has-period-scrubber");
  if (tray) {
    return tray.getBoundingClientRect().bottom;
  }

  return scrollRoot.getBoundingClientRect().top;
}

export function syncNotebookStickySurfaceTop(scrollRoot: HTMLElement): void {
  scrollRoot.style.setProperty(
    "--notebook-sticky-surface-top",
    `${measureNotebookStickySurfaceTopPx(scrollRoot)}px`
  );
}
