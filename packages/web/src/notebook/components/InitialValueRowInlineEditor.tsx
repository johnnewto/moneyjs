import { useEffect, useRef } from "react";

import { isInitialValueEnabled } from "@sfcr/notebook-core";

import { InitialValueEnableCheckbox } from "../../components/InitialValueEnableCheckbox";
import { VariableLabel } from "../../components/VariableLabel";
import type { InitialValueRow } from "../../lib/editorModel";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../../lib/unitMeta";
import { documentHighlightClassName } from "../../lib/variableHighlight";
import { formatNotebookCurrentValue } from "./NotebookCurrentValue";
import { resolveStoredOrDerivedDescription } from "../../lib/resolveRowDescription";

export type InitialValueRowEditFocus = "name" | "value";

function InitialValueRowInlineEditor({
  draftName,
  draftValueText,
  editFocus,
  hasDraftChanges,
  initialValueIndex,
  validationError,
  onApply,
  onCancel,
  onDraftNameChange,
  onDraftValueTextChange
}: {
  draftName: string;
  draftValueText: string;
  editFocus: InitialValueRowEditFocus;
  hasDraftChanges: boolean;
  initialValueIndex: number;
  validationError: string | null;
  onApply(): void;
  onCancel(): void;
  onDraftNameChange(value: string): void;
  onDraftValueTextChange(value: string): void;
}) {
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const target = editFocus === "name" ? nameInputRef.current : valueInputRef.current;
    target?.focus();
    target?.select();
  }, [editFocus]);

  return (
    <div
      className="notebook-equation-row-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <input
        ref={nameInputRef}
        aria-label={`Initial ${initialValueIndex + 1} name`}
        className="notebook-equation-row-name-input"
        value={draftName}
        onChange={(event) => onDraftNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            valueInputRef.current?.focus();
          }
        }}
        placeholder="Hh"
        spellCheck={false}
      />
      <input
        ref={valueInputRef}
        aria-label={`Initial ${initialValueIndex + 1} value`}
        className="notebook-equation-row-expression-input"
        value={draftValueText}
        onChange={(event) => onDraftValueTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
        }}
        placeholder="Value"
        spellCheck={false}
      />
      {validationError ? <div className="error-text">{validationError}</div> : null}
      <div className="notebook-equation-row-editor-actions">
        <button disabled={!hasDraftChanges} onClick={onApply} type="button">
          Apply
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function NotebookInitialValueReadRow({
  currentValues,
  highlightedVariable = null,
  initialValue,
  initialValueIndex,
  isEditing,
  issueMessage,
  onContextMenu,
  rowDraft,
  rowEditFocus,
  rowValidationError,
  variableDescriptions,
  variableUnitMetadata,
  onApplyRow,
  onBeginRowEdit,
  onCancelRow,
  onDraftNameChange,
  onDraftValueTextChange,
  onEnabledChange,
  onInspectVariable
}: {
  currentValues: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  initialValue: InitialValueRow;
  initialValueIndex: number;
  isEditing: boolean;
  issueMessage?: string;
  onContextMenu?(event: React.MouseEvent<HTMLDivElement>): void;
  rowDraft: { name: string; valueText: string };
  rowEditFocus: InitialValueRowEditFocus;
  rowValidationError: string | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
  onApplyRow(): void;
  onBeginRowEdit(initialValueId: string, focus: InitialValueRowEditFocus): void;
  onCancelRow(): void;
  onDraftNameChange(value: string): void;
  onDraftValueTextChange(value: string): void;
  onEnabledChange?(enabled: boolean): void;
  onInspectVariable(variableName: string): void;
}) {
  const isEnabled = isInitialValueEnabled(initialValue);
  const hasDraftChanges =
    rowDraft.name.trim() !== initialValue.name.trim() ||
    rowDraft.valueText.trim() !== initialValue.valueText.trim();

  const handleBeginEdit = (focus: InitialValueRowEditFocus, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onBeginRowEdit(initialValue.id, focus);
  };

  if (isEditing) {
    return (
      <div
        className={[
          "notebook-model-view-row",
          "notebook-model-view-row-initial",
          "notebook-model-view-row-editing",
          issueMessage ? "has-issue" : "",
          isEnabled ? "" : "is-disabled"
        ]
          .filter(Boolean)
          .join(" ")}
        role="row"
      >
        <span className="notebook-model-view-enable" role="cell">
          <InitialValueEnableCheckbox
            ariaLabel={`Enable initial value ${initialValueIndex + 1}`}
            checked={isEnabled}
            className="initial-grid-enable-checkbox"
            onChange={(enabled) => onEnabledChange?.(enabled)}
          />
        </span>
        <div className="notebook-model-view-row-editor-cell notebook-model-view-row-editor-cell-with-enable" role="cell">
          <InitialValueRowInlineEditor
            draftName={rowDraft.name}
            draftValueText={rowDraft.valueText}
            editFocus={rowEditFocus}
            hasDraftChanges={hasDraftChanges}
            initialValueIndex={initialValueIndex}
            validationError={rowValidationError}
            onApply={onApplyRow}
            onCancel={onCancelRow}
            onDraftNameChange={onDraftNameChange}
            onDraftValueTextChange={onDraftValueTextChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      data-variable={initialValue.name.trim()}
      className={[
        "notebook-model-view-row",
        "notebook-model-view-row-initial",
        issueMessage ? "has-issue" : "",
        isEnabled ? "" : "is-disabled"
      ]
        .filter(Boolean)
        .join(" ")}
      onDoubleClick={(event) => handleBeginEdit("value", event)}
      onContextMenu={onContextMenu}
      role="row"
    >
      <span className="notebook-model-view-enable" role="cell">
        <InitialValueEnableCheckbox
          ariaLabel={`Enable initial value ${initialValueIndex + 1}`}
          checked={isEnabled}
          className="initial-grid-enable-checkbox"
          onChange={(enabled) => onEnabledChange?.(enabled)}
        />
      </span>
      <span
        className="notebook-model-view-name is-editable"
        role="cell"
        title="Double-click to edit"
        onDoubleClick={(event) => handleBeginEdit("name", event)}
      >
        {initialValue.name.trim() ? (
          <button
            type="button"
            className={documentHighlightClassName(
              initialValue.name.trim(),
              highlightedVariable,
              "result-variable-button"
            )}
            onClick={(event) => {
              event.stopPropagation();
              onInspectVariable(initialValue.name.trim());
            }}
          >
            <VariableLabel
              currentValues={currentValues}
              name={initialValue.name}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
          </button>
        ) : (
          "?"
        )}
      </span>
      <span
        className="notebook-model-view-expression is-editable"
        role="cell"
        title="Double-click to edit"
        onDoubleClick={(event) => handleBeginEdit("value", event)}
      >
        {initialValue.valueText || " "}
      </span>
      <span className="notebook-model-view-description" role="cell">
        {resolveStoredOrDerivedDescription(
          initialValue.desc,
          initialValue.name,
          variableDescriptions
        ) || " "}
      </span>
      <span className="notebook-model-view-current" role="cell">
        {formatNotebookCurrentValue(
          initialValue.name,
          currentValues[initialValue.name.trim()],
          variableDescriptions,
          variableUnitMetadata
        )}
      </span>
      <span className="notebook-model-view-kind" role="cell">
        {!isEnabled ? "Disabled" : (issueMessage ?? "OK")}
      </span>
    </div>
  );
}
