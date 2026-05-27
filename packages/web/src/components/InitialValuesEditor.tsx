import type { InitialValueRow } from "../lib/editorModel";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { NumericValueText } from "./NumericValueText";
import { documentHighlightClassName } from "../lib/variableHighlight";
import { VariableLabel } from "./VariableLabel";
import {
  canMoveRowDown,
  canMoveRowUp,
  GridRowContextMenu,
  GridRowDeleteDialog,
  removeRow,
  useGridRowContextMenu
} from "./GridRowContextMenu";

interface InitialValuesEditorProps {
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  isEmbedded?: boolean;
  initialValues: InitialValueRow[];
  issues: Record<string, string | undefined>;
  onChange(next: InitialValueRow[]): void;
  onSelectVariable?(variableName: string): void;
  showHeading?: boolean;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function InitialValuesEditor({
  currentValues = {},
  highlightedVariable = null,
  isEmbedded = false,
  initialValues,
  issues,
  onChange,
  onSelectVariable,
  showHeading = true,
  variableDescriptions,
  variableUnitMetadata
}: InitialValuesEditorProps) {
  const rowContextMenu = useGridRowContextMenu({
    ignoredSelector: "button, select",
    onChangeRows: onChange,
    rows: initialValues
  });

  return (
    <section className={isEmbedded ? "grid-editor-embedded" : "editor-panel"}>
      {showHeading ? (
        <div className="panel-header">
          <h2>Initial values</h2>
        </div>
      ) : null}

      <div className="initial-grid-shell">
        <div className="initial-grid-header" role="row">
          <span>#</span>
          <span>Name</span>
          <span>Initial</span>
          <span>Current</span>
          <span>Status</span>
          <span />
        </div>

        <div className="initial-grid-body">
        {initialValues.map((initialValue, index) => (
          <div
            className={`initial-grid-row${
              issues[`initialValues.${index}.name`] || issues[`initialValues.${index}.valueText`]
                ? " has-issue"
                : ""
            }`}
            key={initialValue.id}
            onContextMenu={(event) => rowContextMenu.handleRowContextMenu(event, index)}
            role="row"
          >
            <span className="initial-grid-index">{index + 1}</span>
            <input
              aria-label={`Initial ${index + 1} name`}
              className={issues[`initialValues.${index}.name`] ? "input-error" : ""}
              value={initialValue.name}
              onChange={(event) =>
                updateRow(initialValues, index, { name: event.target.value }, onChange)
              }
              placeholder="Hh"
            />
            <input
              aria-label={`Initial ${index + 1} value`}
              className={issues[`initialValues.${index}.valueText`] ? "input-error" : ""}
              value={initialValue.valueText}
              onChange={(event) =>
                updateRow(initialValues, index, { valueText: event.target.value }, onChange)
              }
              placeholder="Value"
            />
            <span className="initial-grid-current">
              {renderCurrentValue(
                initialValue.name,
                currentValues[initialValue.name.trim()],
                variableDescriptions,
                variableUnitMetadata,
                onSelectVariable,
                highlightedVariable
              )}
            </span>
            <span
              className={`initial-grid-status${
                issues[`initialValues.${index}.name`] || issues[`initialValues.${index}.valueText`]
                  ? " has-issue"
                  : ""
              }`}
            >
              {issues[`initialValues.${index}.name`] ?? issues[`initialValues.${index}.valueText`] ?? "OK"}
            </span>
            <button
              type="button"
              aria-label={`Remove initial ${index + 1}`}
              className="external-grid-remove-button"
              onClick={() => onChange(removeRow(initialValues, index))}
            >
              -
            </button>
          </div>
        ))}
        </div>
      </div>

      <div className="grid-editor-footer">
        <button type="button" onClick={() => onChange([...initialValues, newInitialValueRow()])}>
          Add initial
        </button>
      </div>

      {rowContextMenu.rowContextMenu ? (
        <GridRowContextMenu
          addItemLabel="Add initial value"
          canMoveDown={canMoveRowDown(initialValues, rowContextMenu.rowContextMenu.rowIndex)}
          canMoveUp={canMoveRowUp(initialValues, rowContextMenu.rowContextMenu.rowIndex)}
          menuRef={rowContextMenu.rowContextMenuRef}
          menuTypeLabel="Initial value"
          onAdd={() =>
            rowContextMenu.insertRowBelow(
              rowContextMenu.rowContextMenu!.rowIndex,
              newInitialValueRow()
            )
          }
          onDelete={() => rowContextMenu.requestDelete(rowContextMenu.rowContextMenu!.rowIndex)}
          onMoveDown={() => rowContextMenu.moveRowAt(rowContextMenu.rowContextMenu!.rowIndex, 1)}
          onMoveUp={() => rowContextMenu.moveRowAt(rowContextMenu.rowContextMenu!.rowIndex, -1)}
          rowIndex={rowContextMenu.rowContextMenu.rowIndex}
        />
      ) : null}

      {rowContextMenu.deleteDialogRowIndex != null ? (
        <GridRowDeleteDialog
          deleteTitle="Delete initial value?"
          itemLabel={formatInitialValueDeleteLabel(
            initialValues[rowContextMenu.deleteDialogRowIndex],
            rowContextMenu.deleteDialogRowIndex
          )}
          onCancel={rowContextMenu.cancelDelete}
          onConfirm={rowContextMenu.confirmDelete}
        />
      ) : null}
    </section>
  );
}

function newInitialValueRow(): InitialValueRow {
  return {
    id: `init-${crypto.randomUUID()}`,
    name: "",
    valueText: ""
  };
}

function updateRow(
  rows: InitialValueRow[],
  index: number,
  patch: Partial<InitialValueRow>,
  onChange: (next: InitialValueRow[]) => void
): void {
  onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function formatInitialValueDeleteLabel(
  initialValue: InitialValueRow | undefined,
  rowIndex: number
): string {
  const name = initialValue?.name.trim();
  return name ? name : `Initial value ${rowIndex + 1}`;
}

function renderCurrentValue(
  name: string,
  value: number | undefined,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: VariableUnitMetadata,
  onSelectVariable?: (variableName: string) => void,
  highlightedVariable: string | null = null
): React.JSX.Element | string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "";
  }

  const label = (
    <VariableLabel
      name={trimmedName}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
    />
  );

  return (
    <NumericValueText
      prefix={
        <>
          {onSelectVariable ? (
            <button
              type="button"
              className={documentHighlightClassName(trimmedName, highlightedVariable, "result-variable-button")}
              onClick={() => onSelectVariable(trimmedName)}
            >
              {label}
            </button>
          ) : (
            label
          )}{" "}
          ={" "}
        </>
      }
      fallback="--"
      unitMeta={variableUnitMetadata?.get(trimmedName)}
      value={value}
      options={{ maximumFractionDigits: 6 }}
    />
  );
}
