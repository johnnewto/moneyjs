import type { JSX, Ref } from "react";

import { useEquationGridColumnResize } from "../../hooks/useEquationGridColumnResize";

type EquationViewColumnResize = Pick<
  ReturnType<typeof useEquationGridColumnResize>,
  | "variableHeaderRef"
  | "expressionHeaderRef"
  | "variableResizeHandleProps"
  | "expressionResizeHandleProps"
>;

export function ExternalsModelViewHeaderRow({
  headerRowRef
}: {
  headerRowRef?: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div
      ref={headerRowRef}
      className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-external"
      role="row"
    >
      <span role="columnheader">Name</span>
      <span role="columnheader">Value</span>
      <span role="columnheader">Current</span>
      <span role="columnheader">Kind</span>
    </div>
  );
}

export function InitialValuesModelViewHeaderRow({
  headerRowRef
}: {
  headerRowRef?: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div
      ref={headerRowRef}
      className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-initial"
      role="row"
    >
      <span role="columnheader">Name</span>
      <span role="columnheader">Initial</span>
      <span role="columnheader">Current</span>
      <span role="columnheader">Status</span>
    </div>
  );
}

export function EquationsModelViewHeaderRow({
  columnResize,
  headerRowRef
}: {
  columnResize: EquationViewColumnResize;
  headerRowRef?: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div
      ref={headerRowRef}
      className="notebook-model-view-row notebook-model-view-row-header"
      role="row"
    >
      <span ref={columnResize.variableHeaderRef} role="columnheader">
        Variable
      </span>
      <span ref={columnResize.expressionHeaderRef} role="columnheader">
        Expression
      </span>
      <span role="columnheader">Description</span>
      <span className="notebook-model-view-role" role="columnheader">
        Role
      </span>
      <div {...columnResize.variableResizeHandleProps} />
      <div {...columnResize.expressionResizeHandleProps} />
    </div>
  );
}

export function EquationsModelViewHeaderRowStatic(): JSX.Element {
  return (
    <div className="notebook-model-view-row notebook-model-view-row-header" role="row">
      <span role="columnheader">Variable</span>
      <span role="columnheader">Expression</span>
      <span role="columnheader">Description</span>
      <span className="notebook-model-view-role" role="columnheader">
        Role
      </span>
    </div>
  );
}
