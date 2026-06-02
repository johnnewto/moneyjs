import type { ReactNode, Ref } from "react";

import { useEquationGridColumnResize } from "../../hooks/useEquationGridColumnResize";

import { EquationsModelViewHeaderRow } from "./notebookModelViewHeaderRows";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) {
    return;
  }

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  ref.current = value;
}

export function NotebookEquationViewTable({
  ariaLabel,
  headerRowRef,
  tableShellRef,
  children
}: {
  ariaLabel: string;
  headerRowRef?: Ref<HTMLDivElement>;
  tableShellRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const columnResize = useEquationGridColumnResize({
    isEmbedded: true,
    layout: "equation-view"
  });

  return (
    <div
      ref={(node) => {
        columnResize.shellRef.current = node;
        assignRef(tableShellRef, node);
      }}
      className={`notebook-model-view-table notebook-model-view-table-resizable${columnResize.shellClassName ? ` ${columnResize.shellClassName}` : ""}`.trim()}
      role="table"
      aria-label={ariaLabel}
    >
      <EquationsModelViewHeaderRow columnResize={columnResize} headerRowRef={headerRowRef} />
      {children}
    </div>
  );
}
