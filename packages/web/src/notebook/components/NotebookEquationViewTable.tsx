import type { ReactNode } from "react";

import { useEquationGridColumnResize } from "../../hooks/useEquationGridColumnResize";

export function NotebookEquationViewTable({
  ariaLabel,
  children
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  const columnResize = useEquationGridColumnResize({
    isEmbedded: true,
    layout: "equation-view"
  });

  return (
    <div
      ref={columnResize.shellRef}
      className={`notebook-model-view-table notebook-model-view-table-resizable${columnResize.shellClassName ? ` ${columnResize.shellClassName}` : ""}`.trim()}
      role="table"
      aria-label={ariaLabel}
    >
      <div className="notebook-model-view-row notebook-model-view-row-header" role="row">
        <span ref={columnResize.variableHeaderRef} role="columnheader">
          Variable
        </span>
        <span role="columnheader">Expression</span>
        <span role="columnheader">Current</span>
        <span role="columnheader">Role</span>
        <div {...columnResize.resizeHandleProps} />
      </div>
      {children}
    </div>
  );
}
