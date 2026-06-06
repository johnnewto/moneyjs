import type { ReactNode, Ref } from "react";

import {
  useEquationGridColumnResize,
  type ModelViewTableLayout
} from "../../hooks/useEquationGridColumnResize";

import {
  EquationsModelViewHeaderRow,
  ExternalsModelViewHeaderRow,
  InitialValuesModelViewHeaderRow,
  type InitialValueEnableControls
} from "./notebookModelViewHeaderRows";

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

function layoutClassName(layout: ModelViewTableLayout): string {
  switch (layout) {
    case "equation-grid":
    case "equation-view":
      return "layout-equation-view";
    case "external-view":
      return "layout-external-view";
    case "initial-view":
      return "layout-initial-view";
  }
}

export function NotebookModelViewTable({
  ariaLabel,
  headerRowRef,
  initialValueEnableControls,
  layout,
  tableShellRef,
  children
}: {
  ariaLabel: string;
  headerRowRef?: Ref<HTMLDivElement>;
  initialValueEnableControls?: InitialValueEnableControls;
  layout: ModelViewTableLayout;
  tableShellRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const columnResize = useEquationGridColumnResize({
    isEmbedded: true,
    layout
  });

  const header =
    layout === "external-view" ? (
      <ExternalsModelViewHeaderRow columnResize={columnResize} headerRowRef={headerRowRef} />
    ) : layout === "initial-view" ? (
      <InitialValuesModelViewHeaderRow
        columnResize={columnResize}
        enableControls={initialValueEnableControls}
        headerRowRef={headerRowRef}
      />
    ) : (
      <EquationsModelViewHeaderRow columnResize={columnResize} headerRowRef={headerRowRef} />
    );

  return (
    <div
      ref={(node) => {
        columnResize.shellRef.current = node;
        assignRef(tableShellRef, node);
      }}
      className={[
        "notebook-model-view-table",
        "notebook-model-view-table-resizable",
        layoutClassName(layout),
        columnResize.shellClassName
      ]
        .filter(Boolean)
        .join(" ")}
      role="table"
      aria-label={ariaLabel}
    >
      {header}
      {children}
    </div>
  );
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
  return (
    <NotebookModelViewTable
      ariaLabel={ariaLabel}
      headerRowRef={headerRowRef}
      layout="equation-view"
      tableShellRef={tableShellRef}
    >
      {children}
    </NotebookModelViewTable>
  );
}
