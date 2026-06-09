import { useEffect, useRef, type JSX, type ReactNode, type RefObject } from "react";

import { syncResizableModelViewTableVars } from "../syncResizableModelViewTableVars";
import { useSyncedHorizontalScroll } from "../useNotebookFloatingHeaderRow";

export function NotebookFloatingHeaderOverlay({
  visible,
  anchor,
  horizontalScrollSourceRef,
  resizableTableSourceRef,
  tableSyncKey,
  interactive = false,
  children
}: {
  visible: boolean;
  anchor: { left: number; width: number; top: number };
  horizontalScrollSourceRef: RefObject<HTMLElement | null>;
  resizableTableSourceRef?: RefObject<HTMLElement | null>;
  /** Re-sync floating shell classes/vars when table layout state changes (e.g. column collapse). */
  tableSyncKey?: string;
  interactive?: boolean;
  children: ReactNode;
}): JSX.Element | null {
  const floatingScrollRef = useRef<HTMLDivElement | null>(null);
  const floatingTableShellRef = useRef<HTMLDivElement | null>(null);

  useSyncedHorizontalScroll(horizontalScrollSourceRef, floatingScrollRef, visible);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const source = resizableTableSourceRef?.current;
    const target = floatingTableShellRef.current;
    if (!source || !target) {
      return;
    }

    const sync = () => {
      syncResizableModelViewTableVars(source, target);
    };

    sync();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);

    resizeObserver?.observe(source);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [resizableTableSourceRef, tableSyncKey, visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="notebook-floating-header"
      style={{
        top: `${anchor.top}px`,
        left: `${anchor.left}px`,
        width: `${anchor.width}px`
      }}
      aria-hidden={interactive ? undefined : "true"}
    >
      <div ref={floatingScrollRef} className="notebook-floating-header-scroll">
        <div
          ref={floatingTableShellRef}
          className={
            resizableTableSourceRef
              ? "notebook-model-view-table notebook-model-view-table-resizable"
              : "notebook-model-view-table"
          }
          role={interactive ? "table" : "presentation"}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
