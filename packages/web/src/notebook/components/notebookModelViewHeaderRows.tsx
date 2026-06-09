import type { JSX, Ref } from "react";

import { InitialValueEnableCheckbox } from "../../components/InitialValueEnableCheckbox";
import type { useEquationGridColumnResize } from "../../hooks/useEquationGridColumnResize";
import { EquationColumnToggle } from "./EquationValueColumnsToggle";

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
      <span role="columnheader">Initial</span>
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
      <span role="columnheader">Initial</span>
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
  headerRowRef,
  initialColumnCollapsed = false,
  currentColumnCollapsed = false,
  gainColumnCollapsed = false,
  roleColumnCollapsed = false,
  onToggleInitialColumn,
  onToggleCurrentColumn,
  onToggleGainColumn,
  onToggleRoleColumn
}: {
  columnResize: ModelViewColumnResize;
  headerRowRef?: Ref<HTMLDivElement>;
  initialColumnCollapsed?: boolean;
  currentColumnCollapsed?: boolean;
  gainColumnCollapsed?: boolean;
  roleColumnCollapsed?: boolean;
  onToggleInitialColumn?(): void;
  onToggleCurrentColumn?(): void;
  onToggleGainColumn?(): void;
  onToggleRoleColumn?(): void;
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
      <span className="notebook-model-view-initial-header" role="columnheader">
        <EquationColumnToggle
          column="Initial"
          collapsed={initialColumnCollapsed}
          onToggle={onToggleInitialColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-initial-expanded-only">
          Initial
        </span>
      </span>
      <span className="notebook-model-view-current-header" role="columnheader">
        <EquationColumnToggle
          column="Current"
          collapsed={currentColumnCollapsed}
          onToggle={onToggleCurrentColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-current-expanded-only">
          Current
        </span>
      </span>
      <span
        className="notebook-model-view-gain-header"
        role="columnheader"
        title="d(x)/x'"
      >
        <EquationColumnToggle
          column="Gain"
          collapsed={gainColumnCollapsed}
          onToggle={onToggleGainColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-gain-expanded-only">
          Gain
        </span>
      </span>
      <span className="notebook-model-view-role-header notebook-model-view-role" role="columnheader">
        <EquationColumnToggle
          column="Role"
          collapsed={roleColumnCollapsed}
          onToggle={onToggleRoleColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-role-expanded-only">
          Role
        </span>
      </span>
      <div {...columnResize.variableResizeHandleProps} />
      <div {...columnResize.expressionResizeHandleProps} />
    </div>
  );
}

export function EquationsModelViewHeaderRowStatic({
  initialColumnCollapsed = false,
  currentColumnCollapsed = false,
  gainColumnCollapsed = false,
  roleColumnCollapsed = false,
  onToggleInitialColumn,
  onToggleCurrentColumn,
  onToggleGainColumn,
  onToggleRoleColumn
}: {
  initialColumnCollapsed?: boolean;
  currentColumnCollapsed?: boolean;
  gainColumnCollapsed?: boolean;
  roleColumnCollapsed?: boolean;
  onToggleInitialColumn?(): void;
  onToggleCurrentColumn?(): void;
  onToggleGainColumn?(): void;
  onToggleRoleColumn?(): void;
} = {}): JSX.Element {
  return (
    <div className="notebook-model-view-row notebook-model-view-row-header" role="row">
      <span role="columnheader">Variable</span>
      <span role="columnheader">Expression</span>
      <span role="columnheader">Description</span>
      <span className="notebook-model-view-initial-header" role="columnheader">
        <EquationColumnToggle
          column="Initial"
          collapsed={initialColumnCollapsed}
          interactive={onToggleInitialColumn != null}
          onToggle={onToggleInitialColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-initial-expanded-only">
          Initial
        </span>
      </span>
      <span className="notebook-model-view-current-header" role="columnheader">
        <EquationColumnToggle
          column="Current"
          collapsed={currentColumnCollapsed}
          interactive={onToggleCurrentColumn != null}
          onToggle={onToggleCurrentColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-current-expanded-only">
          Current
        </span>
      </span>
      <span className="notebook-model-view-gain-header" role="columnheader" title="d(x)/x'">
        <EquationColumnToggle
          column="Gain"
          collapsed={gainColumnCollapsed}
          interactive={onToggleGainColumn != null}
          onToggle={onToggleGainColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-gain-expanded-only">
          Gain
        </span>
      </span>
      <span className="notebook-model-view-role-header notebook-model-view-role" role="columnheader">
        <EquationColumnToggle
          column="Role"
          collapsed={roleColumnCollapsed}
          interactive={onToggleRoleColumn != null}
          onToggle={onToggleRoleColumn}
        />
        <span className="notebook-model-view-column-header-label notebook-model-view-role-expanded-only">
          Role
        </span>
      </span>
    </div>
  );
}
