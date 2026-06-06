import {
  formatCompactRowCommentText,
  initialValueRowsOnly,
  isInitialValueEnabled,
  isRowComment,
  type InitialValueListItem
} from "@sfcr/notebook-core";

import { InitialValueEnableCheckbox } from "./InitialValueEnableCheckbox";
import type { InitialValueRow } from "../lib/editorModel";
import { summarizeInitialValueEnableState, withInitialValueEnabled } from "../lib/initialValueEnable";
import { NotebookRowComment } from "../notebook/components/NotebookRowComment";
import { newRowComment, patchCommentInRows } from "../notebook/rowCommentHelpers";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { resolveStoredOrDerivedDescription } from "../lib/resolveRowDescription";
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
  initialValues: InitialValueListItem[];
  issues: Record<string, string | undefined>;
  onChange(next: InitialValueListItem[]): void;
  onEnableRecommended?(): void;
  onSelectVariable?(variableName: string): void;
  recommendationMessage?: string | null;
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
  onEnableRecommended,
  onSelectVariable,
  recommendationMessage = null,
  showHeading = true,
  variableDescriptions,
  variableUnitMetadata
}: InitialValuesEditorProps) {
  const rowContextMenu = useGridRowContextMenu({
    ignoredSelector: "button, input[type='checkbox'], select",
    onChangeRows: onChange,
    rows: initialValues
  });
  const dataRows = initialValueRowsOnly(initialValues);
  const { allEnabled, someEnabled } = summarizeInitialValueEnableState(dataRows);

  return (
    <section className={isEmbedded ? "grid-editor-embedded" : "editor-panel"}>
      {showHeading ? (
        <div className="panel-header">
          <h2>Initial values</h2>
        </div>
      ) : null}

      <div className="initial-grid-shell">
        <div className="initial-grid-header" role="row">
          <span className="initial-grid-enable">
            <InitialValueEnableCheckbox
              ariaLabel="Enable or disable all initial values"
              checked={allEnabled}
              className="initial-grid-enable-checkbox"
              indeterminate={someEnabled && !allEnabled}
              onChange={(enabled) =>
                onChange(
                  initialValues.map((row) =>
                    isRowComment(row) ? row : withInitialValueEnabled(row, enabled)
                  )
                )
              }
            />
          </span>
          <span>#</span>
          <span>Name</span>
          <span>Initial</span>
          <span>Description</span>
          <span>Current</span>
          <span>Status</span>
          <span />
        </div>

        <div className="initial-grid-body">
        {initialValues.map((row, index) => {
          if (isRowComment(row)) {
            return (
              <NotebookRowComment
                key={row.id}
                mode="grid"
                text={row.text}
                onContextMenu={(event) => rowContextMenu.handleRowContextMenu(event, index)}
                onTextChange={(text) => onChange(patchCommentInRows(initialValues, row.id, text))}
              />
            );
          }

          const initialValue = row;
          const isEnabled = isInitialValueEnabled(initialValue);
          return (
          <div
            className={`initial-grid-row${
              issues[`initialValues.${index}.name`] || issues[`initialValues.${index}.valueText`]
                ? " has-issue"
                : ""
            }${isEnabled ? "" : " is-disabled"}`}
            key={initialValue.id}
            onContextMenu={(event) => rowContextMenu.handleRowContextMenu(event, index)}
            role="row"
          >
            <span className="initial-grid-enable">
              <InitialValueEnableCheckbox
                ariaLabel={`Enable initial value ${index + 1}`}
                checked={isEnabled}
                className="initial-grid-enable-checkbox"
                onChange={(enabled) =>
                  updateRow(initialValues, index, withInitialValueEnabled(initialValue, enabled), onChange)
                }
              />
            </span>
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
            <input
              aria-label={`Initial ${index + 1} description`}
              className="initial-grid-description"
              value={initialValue.desc ?? ""}
              onChange={(event) =>
                updateRow(initialValues, index, { desc: event.target.value }, onChange)
              }
              placeholder={resolveStoredOrDerivedDescription(
                undefined,
                initialValue.name,
                variableDescriptions ?? new Map()
              ) || "Description"}
              spellCheck={false}
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
              {!isEnabled
                ? "Disabled"
                : (issues[`initialValues.${index}.name`] ??
                  issues[`initialValues.${index}.valueText`] ??
                  "OK")}
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
          );
        })}
        </div>
      </div>

      {recommendationMessage ? (
        <p className="grid-editor-hint" role="status">
          {recommendationMessage}
        </p>
      ) : null}

      <div className="grid-editor-footer">
        {onEnableRecommended ? (
          <button
            type="button"
            className="secondary-button"
            onClick={onEnableRecommended}
            title="Enable rows for lagged variables, stocks, denominators, and balance-sheet entries"
          >
            Enable needed
          </button>
        ) : null}
        <button type="button" onClick={() => onChange([...initialValues, newInitialValueRow()])}>
          Add initial
        </button>
        <button type="button" className="secondary-button" onClick={() => onChange([...initialValues, newRowComment()])}>
          Add section comment
        </button>
      </div>

      {rowContextMenu.rowContextMenu ? (
        <GridRowContextMenu
          addCommentLabel="Add section comment"
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
          onAddComment={() =>
            rowContextMenu.insertRowBelow(rowContextMenu.rowContextMenu!.rowIndex, newRowComment())
          }
          onDelete={() => rowContextMenu.requestDelete(rowContextMenu.rowContextMenu!.rowIndex)}
          onMoveDown={() => rowContextMenu.moveRowAt(rowContextMenu.rowContextMenu!.rowIndex, 1)}
          onMoveUp={() => rowContextMenu.moveRowAt(rowContextMenu.rowContextMenu!.rowIndex, -1)}
          rowIndex={rowContextMenu.rowContextMenu.rowIndex}
        />
      ) : null}

      {rowContextMenu.deleteDialogRowIndex != null ? (
        <GridRowDeleteDialog
          deleteTitle={
            isRowComment(initialValues[rowContextMenu.deleteDialogRowIndex])
              ? "Delete section comment?"
              : "Delete initial value?"
          }
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
    desc: "",
    valueText: ""
  };
}

function updateRow(
  rows: InitialValueListItem[],
  index: number,
  patch: Partial<InitialValueRow>,
  onChange: (next: InitialValueListItem[]) => void
): void {
  onChange(
    rows.map((row, rowIndex) =>
      rowIndex === index && !isRowComment(row) ? { ...row, ...patch } : row
    )
  );
}

function formatInitialValueDeleteLabel(
  initialValue: InitialValueListItem | undefined,
  rowIndex: number
): string {
  if (!initialValue) {
    return `Row ${rowIndex + 1}`;
  }
  if (isRowComment(initialValue)) {
    return formatCompactRowCommentText(initialValue.text);
  }
  const name = initialValue.name.trim();
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
