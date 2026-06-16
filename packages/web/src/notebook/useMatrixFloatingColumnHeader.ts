import type { RefObject } from "react";

import {
  useNotebookFloatingHeaderRow,
  useSyncedHorizontalScroll,
  useSyncedMatrixFloatingTableLayout
} from "./useNotebookFloatingHeaderRow";

/** @deprecated Use useNotebookFloatingHeaderRow */
export function useMatrixFloatingColumnHeader({
  scrollRoot,
  columnRowRef,
  tableWrapRef,
  cellRootRef,
  enabled
}: {
  scrollRoot: Element | null;
  columnRowRef: RefObject<HTMLTableRowElement | null>;
  tableWrapRef: RefObject<HTMLDivElement | null>;
  cellRootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  return useNotebookFloatingHeaderRow({
    scrollRoot,
    headerRowRef: columnRowRef,
    tableWrapRef,
    cellRootRef,
    enabled
  });
}

export { useSyncedHorizontalScroll, useSyncedMatrixFloatingTableLayout };
