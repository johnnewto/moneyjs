import { useRef, type ReactNode, type Ref } from "react";

import {
  useEquationGridColumnResize,
  type ModelViewTableLayout
} from "../../hooks/useEquationGridColumnResize";
import {
  useEquationValueColumnsCollapse,
  type EquationValueColumnsCollapseControls
} from "../../hooks/useEquationValueColumnsCollapse";

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
  valueColumnsCollapse: valueColumnsCollapseProp,
  children
}: {
  ariaLabel: string;
  headerRowRef?: Ref<HTMLDivElement>;
  initialValueEnableControls?: InitialValueEnableControls;
  layout: ModelViewTableLayout;
  tableShellRef?: Ref<HTMLDivElement>;
  valueColumnsCollapse?: EquationValueColumnsCollapseControls;
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const detachedShellRef = useRef<HTMLDivElement | null>(null);
  const internalValueColumnsCollapse = useEquationValueColumnsCollapse(
    valueColumnsCollapseProp ? detachedShellRef : shellRef
  );
  const valueColumnsCollapse = valueColumnsCollapseProp ?? internalValueColumnsCollapse;
  const isEquationView = layout === "equation-view";
  const columnResize = useEquationGridColumnResize({
    isEmbedded: true,
    layout,
    valueColumnCollapse: isEquationView
      ? {
          initialCollapsed: valueColumnsCollapse.initialColumnCollapsed,
          currentCollapsed: valueColumnsCollapse.currentColumnCollapsed,
          gainCollapsed: valueColumnsCollapse.gainColumnCollapsed,
          roleCollapsed: valueColumnsCollapse.roleColumnCollapsed
        }
      : undefined
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
      <EquationsModelViewHeaderRow
        columnResize={columnResize}
        headerRowRef={headerRowRef}
        initialColumnCollapsed={
          isEquationView ? valueColumnsCollapse.initialColumnCollapsed : false
        }
        currentColumnCollapsed={
          isEquationView ? valueColumnsCollapse.currentColumnCollapsed : false
        }
        gainColumnCollapsed={
          isEquationView ? valueColumnsCollapse.gainColumnCollapsed : false
        }
        onToggleInitialColumn={
          isEquationView ? valueColumnsCollapse.toggleInitialColumn : undefined
        }
        onToggleCurrentColumn={
          isEquationView ? valueColumnsCollapse.toggleCurrentColumn : undefined
        }
        onToggleGainColumn={
          isEquationView ? valueColumnsCollapse.toggleGainColumn : undefined
        }
        roleColumnCollapsed={
          isEquationView ? valueColumnsCollapse.roleColumnCollapsed : false
        }
        onToggleRoleColumn={
          isEquationView ? valueColumnsCollapse.toggleRoleColumn : undefined
        }
      />
    );

  return (
    <div
      ref={(node) => {
        shellRef.current = node;
        columnResize.shellRef.current = node;
        assignRef(tableShellRef, node);
      }}
      className={[
        "notebook-model-view-table",
        "notebook-model-view-table-resizable",
        layoutClassName(layout),
        columnResize.shellClassName,
        isEquationView && valueColumnsCollapse.initialColumnCollapsed ? "initial-column-collapsed" : "",
        isEquationView && valueColumnsCollapse.currentColumnCollapsed ? "current-column-collapsed" : "",
        isEquationView && valueColumnsCollapse.gainColumnCollapsed ? "gain-column-collapsed" : "",
        isEquationView && valueColumnsCollapse.roleColumnCollapsed ? "role-column-collapsed" : ""
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
  valueColumnsCollapse,
  children
}: {
  ariaLabel: string;
  headerRowRef?: Ref<HTMLDivElement>;
  tableShellRef?: Ref<HTMLDivElement>;
  valueColumnsCollapse?: EquationValueColumnsCollapseControls;
  children: ReactNode;
}) {
  return (
    <NotebookModelViewTable
      ariaLabel={ariaLabel}
      headerRowRef={headerRowRef}
      layout="equation-view"
      tableShellRef={tableShellRef}
      valueColumnsCollapse={valueColumnsCollapse}
    >
      {children}
    </NotebookModelViewTable>
  );
}
