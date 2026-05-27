import { useEffect, useRef } from "react";

import { VariableLabel } from "../../components/VariableLabel";
import type { ExternalRow } from "../../lib/editorModel";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../../lib/unitMeta";
import { documentHighlightClassName } from "../../lib/variableHighlight";
import { formatNotebookCurrentValue } from "./NotebookCurrentValue";

export type ExternalRowEditFocus = "name" | "value";

export function ExternalRowInlineEditor({
  draftName,
  draftValueText,
  editFocus,
  externalIndex,
  hasDraftChanges,
  validationError,
  onApply,
  onCancel,
  onDraftNameChange,
  onDraftValueTextChange
}: {
  draftName: string;
  draftValueText: string;
  editFocus: ExternalRowEditFocus;
  externalIndex: number;
  hasDraftChanges: boolean;
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
        aria-label={`External ${externalIndex + 1} name`}
        className="notebook-equation-row-name-input"
        value={draftName}
        onChange={(event) => onDraftNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            valueInputRef.current?.focus();
          }
        }}
        placeholder="alpha1"
        spellCheck={false}
      />
      <input
        ref={valueInputRef}
        aria-label={`External ${externalIndex + 1} value`}
        className="notebook-equation-row-expression-input"
        value={draftValueText}
        onChange={(event) => onDraftValueTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
        }}
        placeholder="20 or 20, 21, 22"
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

export function NotebookExternalReadRow({
  currentValues,
  external,
  externalIndex,
  highlightedVariable = null,
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
  onInspectVariable
}: {
  currentValues: Record<string, number | undefined>;
  external: ExternalRow;
  externalIndex: number;
  highlightedVariable?: string | null;
  isEditing: boolean;
  issueMessage?: string;
  onContextMenu?(event: React.MouseEvent<HTMLDivElement>): void;
  rowDraft: { name: string; valueText: string };
  rowEditFocus: ExternalRowEditFocus;
  rowValidationError: string | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
  onApplyRow(): void;
  onBeginRowEdit(externalId: string, focus: ExternalRowEditFocus): void;
  onCancelRow(): void;
  onDraftNameChange(value: string): void;
  onDraftValueTextChange(value: string): void;
  onInspectVariable(variableName: string): void;
}) {
  const hasDraftChanges =
    rowDraft.name.trim() !== external.name.trim() ||
    rowDraft.valueText.trim() !== external.valueText.trim();

  const handleBeginEdit = (focus: ExternalRowEditFocus, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onBeginRowEdit(external.id, focus);
  };

  if (isEditing) {
    return (
      <div
        className={[
          "notebook-model-view-row",
          "notebook-model-view-row-external",
          "notebook-model-view-row-editing",
          issueMessage ? "has-issue" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        role="row"
      >
        <div className="notebook-model-view-row-editor-cell" role="cell">
          <ExternalRowInlineEditor
            draftName={rowDraft.name}
            draftValueText={rowDraft.valueText}
            editFocus={rowEditFocus}
            externalIndex={externalIndex}
            hasDraftChanges={hasDraftChanges}
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
      className={[
        "notebook-model-view-row",
        "notebook-model-view-row-external",
        issueMessage ? "has-issue" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      onDoubleClick={(event) => handleBeginEdit("value", event)}
      onContextMenu={onContextMenu}
      role="row"
    >
      <span
        className="notebook-model-view-name is-editable"
        role="cell"
        title="Double-click to edit"
        onDoubleClick={(event) => handleBeginEdit("name", event)}
      >
        {external.name.trim() ? (
          <button
            type="button"
            className={documentHighlightClassName(
              external.name.trim(),
              highlightedVariable,
              "result-variable-button"
            )}
            onClick={(event) => {
              event.stopPropagation();
              onInspectVariable(external.name.trim());
            }}
          >
            <VariableLabel
              currentValues={currentValues}
              name={external.name}
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
        {external.valueText || " "}
      </span>
      <span className="notebook-model-view-current" role="cell">
        {formatNotebookCurrentValue(
          external.name,
          currentValues[external.name.trim()],
          variableDescriptions,
          variableUnitMetadata
        )}
      </span>
      <span className="notebook-model-view-kind" role="cell">
        {external.kind}
      </span>
    </div>
  );
}
