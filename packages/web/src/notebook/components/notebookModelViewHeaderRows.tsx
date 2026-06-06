import type { JSX, Ref } from "react";

import { InitialValueEnableCheckbox } from "../../components/InitialValueEnableCheckbox";
import type { useEquationGridColumnResize } from "../../hooks/useEquationGridColumnResize";

export interface InitialValueEnableControls {
  allEnabled: boolean;
  someEnabled: boolean;
  onSetAllEnabled(enabled: boolean): void;
}

type ModelViewColumnResize = Pick<
  ReturnType<typeof useEquationGridColumnResize>,
  | "variableHeaderRef"
  | "expressionHeaderRef"
  | "variableResizeHandleProps"
  | "expressionResizeHandleProps"
>;

export function ExternalsModelViewHeaderRow({
  columnResize,
  headerRowRef
}: {
  columnResize: ModelViewColumnResize;
  headerRowRef?: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div
      ref={headerRowRef}
      className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-external"
      role="row"
    >
      <span ref={columnResize.variableHeaderRef} role="columnheader">
        Name
      </span>
      <span ref={columnResize.expressionHeaderRef} role="columnheader">
        Value
      </span>
      <span role="columnheader">Description</span>
      <span role="columnheader">Current</span>
      <span className="notebook-model-view-kind" role="columnheader">
        Kind
      </span>
      <div {...columnResize.variableResizeHandleProps} />
      <div {...columnResize.expressionResizeHandleProps} />
    </div>
  );
}

export function ExternalsModelViewHeaderRowStatic(): JSX.Element {
  return (
    <div
      className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-external"
      role="row"
    >
      <span role="columnheader">Name</span>
      <span role="columnheader">Value</span>
      <span role="columnheader">Description</span>
      <span role="columnheader">Current</span>
      <span className="notebook-model-view-kind" role="columnheader">
        Kind
      </span>
    </div>
  );
}

function InitialValueEnableHeaderCell({
  enableControls
}: {
  enableControls?: InitialValueEnableControls;
}): JSX.Element {
  return (
    <span className="notebook-model-view-enable" role="columnheader">
      {enableControls ? (
        <InitialValueEnableCheckbox
          ariaLabel="Enable or disable all initial values"
          checked={enableControls.allEnabled}
          className="initial-grid-enable-checkbox"
          indeterminate={enableControls.someEnabled && !enableControls.allEnabled}
          onChange={enableControls.onSetAllEnabled}
        />
      ) : null}
    </span>
  );
}

export function InitialValuesModelViewHeaderRow({
  columnResize,
  enableControls,
  headerRowRef
}: {
  columnResize: ModelViewColumnResize;
  enableControls?: InitialValueEnableControls;
  headerRowRef?: Ref<HTMLDivElement>;
}): JSX.Element {
  return (
    <div
      ref={headerRowRef}
      className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-initial"
      role="row"
    >
      <InitialValueEnableHeaderCell enableControls={enableControls} />
      <span ref={columnResize.variableHeaderRef} role="columnheader">
        Name
      </span>
      <span ref={columnResize.expressionHeaderRef} role="columnheader">
        Initial
      </span>
      <span role="columnheader">Description</span>
      <span role="columnheader">Current</span>
      <span className="notebook-model-view-kind" role="columnheader">
        Status
      </span>
      <div {...columnResize.variableResizeHandleProps} />
      <div {...columnResize.expressionResizeHandleProps} />
    </div>
  );
}

export function InitialValuesModelViewHeaderRowStatic({
  enableControls
}: {
  enableControls?: InitialValueEnableControls;
} = {}): JSX.Element {
  return (
    <div
      className="notebook-model-view-row notebook-model-view-row-header notebook-model-view-row-initial"
      role="row"
    >
      <InitialValueEnableHeaderCell enableControls={enableControls} />
      <span role="columnheader">Name</span>
      <span role="columnheader">Initial</span>
      <span role="columnheader">Description</span>
      <span role="columnheader">Current</span>
      <span className="notebook-model-view-kind" role="columnheader">
        Status
      </span>
    </div>
  );
}

export function EquationsModelViewHeaderRow({
  columnResize,
  headerRowRef
}: {
  columnResize: ModelViewColumnResize;
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
