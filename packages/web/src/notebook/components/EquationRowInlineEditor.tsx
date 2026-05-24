import { useCallback, useEffect, useRef } from "react";

import type { EquationRole } from "@sfcr/core";

import {
  HighlightedFormulaInput,
  highlightFormula,
  togglePinnedTrace,
  type PinnedTrace,
  type TraceTokenRole
} from "../../components/EquationGridEditor";
import { VariableLabel } from "../../components/VariableLabel";
import type { EquationRow } from "../../lib/editorModel";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../../lib/unitMeta";

const DEFERRED_ACTION_DELAY_MS = 400;

export type EquationRowEditFocus = "name" | "expression";

export function useDeferredAction(delayMs = DEFERRED_ACTION_DELAY_MS) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDeferredAction = useCallback(() => {
    if (timeoutRef.current != null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearDeferredAction(), [clearDeferredAction]);

  const scheduleDeferredAction = useCallback(
    (action: () => void) => {
      clearDeferredAction();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        action();
      }, delayMs);
    },
    [clearDeferredAction, delayMs]
  );

  return { clearDeferredAction, scheduleDeferredAction };
}

export function VariableRenameDialog({
  cellCount,
  isOpen,
  newName,
  oldName,
  onCancel,
  onConfirmNo,
  onConfirmYes,
  referenceCount
}: {
  cellCount: number;
  isOpen: boolean;
  newName: string;
  oldName: string;
  onCancel(): void;
  onConfirmNo(): void;
  onConfirmYes(): void;
  referenceCount: number;
}) {
  if (!isOpen) {
    return null;
  }

  const impactSummary =
    referenceCount > 0
      ? `${referenceCount} reference${referenceCount === 1 ? "" : "s"} in ${cellCount} cell${cellCount === 1 ? "" : "s"}.`
      : "No other references were found.";

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onCancel}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Rename variable across notebook"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Rename variable across notebook?</h3>
        <p>
          Rename <strong>{oldName}</strong> to <strong>{newName}</strong> everywhere it appears in this
          model&apos;s equations, externals, initial values, matrices, tables, charts, and runs?
        </p>
        <p className="notebook-confirm-dialog-summary">{impactSummary}</p>
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="secondary-button" onClick={onConfirmNo} type="button">
            No
          </button>
          <button onClick={onConfirmYes} type="button">
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}

export function EquationRowInlineEditor({
  currentValues,
  draftExpression,
  draftName,
  editFocus,
  equationIndex,
  hasDraftChanges,
  parameterNames,
  validationError,
  variableDescriptions,
  variableUnitMetadata,
  onApply,
  onCancel,
  onDraftExpressionChange,
  onDraftNameChange,
  onSelectVariable
}: {
  currentValues: Record<string, number | undefined>;
  draftExpression: string;
  draftName: string;
  editFocus: EquationRowEditFocus;
  equationIndex: number;
  hasDraftChanges: boolean;
  parameterNames: Set<string>;
  validationError: string | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
  onApply(): void;
  onCancel(): void;
  onDraftExpressionChange(value: string): void;
  onDraftNameChange(value: string): void;
  onSelectVariable?(variableName: string): void;
}) {
  const nameInputRef = useRef<HTMLTextAreaElement | null>(null);
  const expressionInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const target = editFocus === "name" ? nameInputRef.current : expressionInputRef.current;
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
      <HighlightedFormulaInput
        ariaLabel={`Equation ${equationIndex + 1} variable`}
        className="notebook-equation-row-name-input"
        currentValues={currentValues}
        inputRef={(node) => {
          nameInputRef.current = node;
        }}
        onChange={onDraftNameChange}
        onEnter={() => expressionInputRef.current?.focus()}
        onSelectVariable={onSelectVariable}
        parameterNames={parameterNames}
        placeholder="Variable"
        value={draftName}
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={variableUnitMetadata}
      />
      <HighlightedFormulaInput
        ariaLabel={`Equation ${equationIndex + 1} expression`}
        className="notebook-equation-row-expression-input"
        currentValues={currentValues}
        inputRef={(node) => {
          expressionInputRef.current = node;
        }}
        onChange={onDraftExpressionChange}
        onEnter={onApply}
        onSelectVariable={onSelectVariable}
        parameterNames={parameterNames}
        placeholder="Expression"
        value={draftExpression}
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={variableUnitMetadata}
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

export function NotebookEquationReadRow({
  activeTraceTokenStates,
  currentValues,
  displayTokens,
  equation,
  equationIndex,
  formatRoleLabel,
  hoveredRowId,
  isEditing,
  issueMessage,
  rowDraft,
  rowEditFocus,
  rowValidationError,
  parameterNames,
  traceRole,
  variableDescriptions,
  variableUnitMetadata,
  onApplyRow,
  onBeginRowEdit,
  onCancelRow,
  onDraftExpressionChange,
  onDraftNameChange,
  onInspectVariable,
  onRowClick,
  onRowMouseEnter,
  onRowMouseLeave,
  onSelectVariableInExpression
}: {
  activeTraceTokenStates?: Map<string, TraceTokenRole>;
  currentValues: Record<string, number | undefined>;
  displayTokens?: Map<string, string>;
  equation: EquationRow;
  equationIndex: number;
  formatRoleLabel(equation: EquationRow): string;
  hoveredRowId: string | null;
  isEditing: boolean;
  issueMessage?: string;
  rowDraft: { expression: string; name: string };
  rowEditFocus: EquationRowEditFocus;
  rowValidationError: string | null;
  parameterNames: Set<string>;
  traceRole: TraceTokenRole | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
  onApplyRow(): void;
  onBeginRowEdit(equationId: string, focus: EquationRowEditFocus): void;
  onCancelRow(): void;
  onDraftExpressionChange(value: string): void;
  onDraftNameChange(value: string): void;
  onInspectVariable(variableName: string): void;
  onRowClick(event: React.MouseEvent<HTMLDivElement>): void;
  onRowMouseEnter(): void;
  onRowMouseLeave(): void;
  onSelectVariableInExpression?(variableName: string): void;
}) {
  const { clearDeferredAction, scheduleDeferredAction } = useDeferredAction();
  const hasDraftChanges =
    rowDraft.name.trim() !== equation.name.trim() ||
    rowDraft.expression.trim() !== equation.expression.trim();

  const handleBeginEdit = (focus: EquationRowEditFocus, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    clearDeferredAction();
    onBeginRowEdit(equation.id, focus);
  };

  if (isEditing) {
    return (
      <div
        className={[
          "notebook-model-view-row",
          "notebook-model-view-row-editing",
          issueMessage ? "has-issue" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        role="row"
      >
        <div className="notebook-model-view-row-editor-cell" role="cell">
          <EquationRowInlineEditor
            currentValues={currentValues}
            draftExpression={rowDraft.expression}
            draftName={rowDraft.name}
            editFocus={rowEditFocus}
            equationIndex={equationIndex}
            hasDraftChanges={hasDraftChanges}
            parameterNames={parameterNames}
            validationError={rowValidationError}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
            onApply={onApplyRow}
            onCancel={onCancelRow}
            onDraftExpressionChange={onDraftExpressionChange}
            onDraftNameChange={onDraftNameChange}
            onSelectVariable={onSelectVariableInExpression}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "notebook-model-view-row",
        issueMessage ? "has-issue" : "",
        hoveredRowId === equation.id ? "is-hovered" : "",
        traceRole ? `trace-${traceRole}` : ""
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        clearDeferredAction();
        onRowClick(event);
      }}
      onDoubleClick={(event) => handleBeginEdit("expression", event)}
      onMouseEnter={onRowMouseEnter}
      onMouseLeave={onRowMouseLeave}
      role="row"
    >
      <span
        className="notebook-model-view-name is-editable"
        role="cell"
        title="Double-click to edit"
        onDoubleClick={(event) => handleBeginEdit("name", event)}
      >
        {equation.name ? (
          <button
            type="button"
            className="result-variable-button"
            onClick={(event) => {
              event.stopPropagation();
              clearDeferredAction();
              onInspectVariable(equation.name.trim());
            }}
          >
            <VariableLabel
              className={
                traceRole && equation.name.trim()
                  ? `formula-token trace-token-${
                      activeTraceTokenStates?.get(equation.name.trim()) ?? "root"
                    }`
                  : undefined
              }
              currentValues={currentValues}
              name={equation.name}
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
        onDoubleClick={(event) => handleBeginEdit("expression", event)}
      >
        {equation.expression
          ? highlightFormula(
              equation.expression,
              parameterNames,
              traceRole ? activeTraceTokenStates : undefined,
              variableDescriptions,
              variableUnitMetadata,
              onSelectVariableInExpression,
              displayTokens,
              currentValues,
              true
            )
          : " "}
      </span>
      <span className="notebook-model-view-description" role="cell">
        {equation.desc?.trim() || " "}
      </span>
      <span className="notebook-model-view-kind" role="cell">
        {formatRoleLabel(equation)}
      </span>
    </div>
  );
}

export function schedulePinnedTraceToggle(
  scheduleDeferredAction: (action: () => void) => void,
  setPinnedTrace: (updater: (current: PinnedTrace | null) => PinnedTrace | null) => void,
  equationId: string,
  event: React.MouseEvent<HTMLDivElement>
): void {
  scheduleDeferredAction(() => {
    setPinnedTrace((current) => togglePinnedTrace(current, equationId, event));
  });
}
