import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";

import { type EquationListItem, type ExternalListItem } from "@sfcr/notebook-core";

import { EquationUnitPickerPanel } from "./EquationUnitPickerPanel";
import { presetToEquationUnitMeta } from "../lib/unitPicker";
import type { UnitMeta, VariableUnitMetadata } from "../lib/unitMeta";
import {
  applyVariableUnitMetaPatch,
  buildVariableUnitMetadata,
  buildVariableUnitStatusReport,
  type VariableUnitStatusKind,
  type VariableUnitStatusRow
} from "../lib/units";

const STATUS_LABELS: Record<VariableUnitStatusKind, string> = {
  ok: "OK",
  untagged: "Untagged",
  warning: "Warning",
  error: "Error"
};

function formatStatusSummary(rows: VariableUnitStatusRow[]): string {
  const problemCount = rows.filter((row) => row.status !== "ok").length;
  if (rows.length === 0) {
    return "No model variables to check.";
  }
  if (problemCount === 0) {
    return `All ${rows.length} variable${rows.length === 1 ? "" : "s"} have consistent units.`;
  }
  return `${problemCount} of ${rows.length} variable${rows.length === 1 ? "" : "s"} need attention.`;
}

function formatNotes(row: VariableUnitStatusRow): string {
  if (row.diagnostics.length > 0) {
    return row.diagnostics[0]!.message;
  }
  if (row.status === "untagged" && row.suggestion) {
    return "Inferred units available.";
  }
  if (row.status === "untagged") {
    return "No units declared.";
  }
  return "—";
}

function rowKey(row: Pick<VariableUnitStatusRow, "source" | "rowId">): string {
  return `${row.source}:${row.rowId}`;
}

function modelRowsEqual(
  leftEquations: EquationListItem[],
  leftExternals: ExternalListItem[],
  rightEquations: EquationListItem[],
  rightExternals: ExternalListItem[]
): boolean {
  return JSON.stringify({ equations: leftEquations, externals: leftExternals }) ===
    JSON.stringify({ equations: rightEquations, externals: rightExternals });
}

export function VariableUnitStatusDialog({
  canEditExternals = true,
  equations,
  externals = [],
  isOpen,
  onApply,
  onClose,
  onSelectVariable,
  variableUnitMetadata
}: {
  canEditExternals?: boolean;
  equations: EquationListItem[];
  externals?: ExternalListItem[];
  isOpen: boolean;
  onApply?(args: { equations: EquationListItem[]; externals: ExternalListItem[] }): void;
  onClose(): void;
  onSelectVariable?(variableName: string): void;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const canEdit = onApply != null;
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [draftEquations, setDraftEquations] = useState(equations);
  const [draftExternals, setDraftExternals] = useState(externals);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftEquations(equations);
      setDraftExternals(externals);
      setEditingRowKey(null);
      setShowProblemsOnly(false);
    }
  }, [isOpen, equations, externals]);

  const draftUnitMetadata = useMemo(() => {
    const fromDrafts = buildVariableUnitMetadata({
      equations: draftEquations,
      externals: draftExternals
    });
    if (!variableUnitMetadata) {
      return fromDrafts;
    }
    const merged = new Map(variableUnitMetadata);
    for (const [name, meta] of fromDrafts) {
      merged.set(name, meta);
    }
    return merged;
  }, [variableUnitMetadata, draftEquations, draftExternals]);
  const rows = useMemo(
    () =>
      buildVariableUnitStatusReport({
        equations: draftEquations,
        externals: draftExternals,
        variableUnitMetadata: draftUnitMetadata
      }),
    [draftEquations, draftExternals, draftUnitMetadata]
  );
  const visibleRows = useMemo(
    () => (showProblemsOnly ? rows.filter((row) => row.status !== "ok") : rows),
    [rows, showProblemsOnly]
  );
  const hasDraftChanges = !modelRowsEqual(draftEquations, draftExternals, equations, externals);
  const suggestableCount = useMemo(
    () => rows.filter((row) => row.source === "equation" && row.suggestion != null).length,
    [rows]
  );

  function patchRowUnitMeta(
    source: "equation" | "external",
    rowId: string,
    unitMeta: UnitMeta | undefined
  ): void {
    const next = applyVariableUnitMetaPatch({
      equations: draftEquations,
      externals: draftExternals,
      source,
      rowId,
      unitMeta
    });
    setDraftEquations(next.equations);
    setDraftExternals(next.externals);
  }

  function handleSuggestAll(): void {
    let nextEquations = draftEquations;
    let nextExternals = draftExternals;

    for (const row of rows) {
      if (row.source !== "equation" || row.suggestion == null) {
        continue;
      }
      const patched = applyVariableUnitMetaPatch({
        equations: nextEquations,
        externals: nextExternals,
        source: "equation",
        rowId: row.rowId,
        unitMeta: presetToEquationUnitMeta(row.variable, row.suggestion)
      });
      nextEquations = patched.equations;
      nextExternals = patched.externals;
    }

    setDraftEquations(nextEquations);
    setDraftExternals(nextExternals);
  }

  function handleCancel(): void {
    setDraftEquations(equations);
    setDraftExternals(externals);
    setEditingRowKey(null);
    onClose();
  }

  function handleApply(): void {
    if (!onApply || !hasDraftChanges) {
      onClose();
      return;
    }
    onApply({ equations: draftEquations, externals: draftExternals });
    onClose();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={handleCancel}>
      <div
        className={`notebook-cell-delete-dialog notebook-confirm-dialog matrix-unit-meta-dialog variable-unit-status-dialog${canEdit ? " is-editable" : ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label="Variable unit status"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Variable unit status</h3>
        <p>{formatStatusSummary(rows)}</p>
        <div className="matrix-unit-meta-dialog-toolbar">
          <label className="variable-unit-status-filter">
            <input
              checked={showProblemsOnly}
              onChange={(event) => setShowProblemsOnly(event.target.checked)}
              type="checkbox"
            />
            Show only problems
          </label>
          {canEdit && suggestableCount > 0 ? (
            <button
              aria-label="Apply inferred units for all equations with available suggestions"
              className="secondary-button"
              onClick={handleSuggestAll}
              type="button"
            >
              Apply inferred units ({suggestableCount})
            </button>
          ) : null}
        </div>
        {visibleRows.length === 0 ? (
          <p className="matrix-unit-meta-dialog-empty">
            {showProblemsOnly ? "No unit problems found." : "No model variables to check."}
          </p>
        ) : (
          <div className="matrix-unit-meta-dialog-list" role="group" aria-label="Variable unit status">
            <div className="matrix-unit-meta-dialog-list-header" aria-hidden="true">
              <span>Variable</span>
              <span>Source</span>
              <span>Declared</span>
              <span>Inferred</span>
              <span>Status</span>
              <span>Notes</span>
              {canEdit ? <span>Actions</span> : null}
            </div>
            {visibleRows.map((row) => (
              <VariableUnitStatusDialogEntry
                key={rowKey(row)}
                canEdit={canEdit && (row.source === "equation" || canEditExternals)}
                draftUnitMetadata={draftUnitMetadata}
                editingRowKey={editingRowKey}
                onPatchUnitMeta={patchRowUnitMeta}
                onSelectVariable={onSelectVariable}
                onToggleEdit={() =>
                  setEditingRowKey((current) => (current === rowKey(row) ? null : rowKey(row)))
                }
                row={row}
              />
            ))}
          </div>
        )}
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          {canEdit ? (
            <>
              <button className="secondary-button" onClick={handleCancel} type="button">
                Cancel
              </button>
              <button disabled={!hasDraftChanges} onClick={handleApply} type="button">
                Apply changes
              </button>
            </>
          ) : (
            <button onClick={onClose} type="button">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VariableUnitStatusDialogEntry({
  canEdit,
  draftUnitMetadata,
  editingRowKey,
  onPatchUnitMeta,
  onSelectVariable,
  onToggleEdit,
  row
}: {
  canEdit: boolean;
  draftUnitMetadata: VariableUnitMetadata;
  editingRowKey: string | null;
  onPatchUnitMeta(source: "equation" | "external", rowId: string, unitMeta: UnitMeta | undefined): void;
  onSelectVariable?(variableName: string): void;
  onToggleEdit(): void;
  row: VariableUnitStatusRow;
}) {
  const key = rowKey(row);
  const isEditing = editingRowKey === key;
  const canSelect = onSelectVariable != null;
  const currentUnitMeta = row.declared;

  function handleSelectVariable(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    onSelectVariable?.(row.variable);
  }

  return (
    <div className="variable-unit-status-entry">
      <div
        className={`matrix-unit-meta-dialog-row variable-unit-status-row is-${row.status}`.trim()}
      >
        <button
          className={`variable-unit-status-variable-button${canSelect ? "" : " is-static"}`}
          onClick={canSelect ? handleSelectVariable : undefined}
          type="button"
        >
          {row.variable}
        </button>
        <span>{row.source === "equation" ? "Equation" : "External"}</span>
        <span>{row.declaredLabel ?? "—"}</span>
        <span>{row.inferredLabel ?? "—"}</span>
        <span className={`variable-unit-status-badge is-${row.status}`}>{STATUS_LABELS[row.status]}</span>
        <span className="matrix-unit-meta-dialog-sources">{formatNotes(row)}</span>
        {canEdit ? (
          <span className="variable-unit-status-actions">
            <button
              aria-expanded={isEditing}
              aria-label={`Edit units for ${row.variable}`}
              className="secondary-button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleEdit();
              }}
              type="button"
            >
              Edit
            </button>
          </span>
        ) : null}
      </div>
      {canEdit && isEditing ? (
        <div className="variable-unit-status-editor">
          <EquationUnitPickerPanel
            className="variable-unit-status-picker"
            expression={row.expression ?? ""}
            onChange={(unitMeta) => onPatchUnitMeta(row.source, row.rowId, unitMeta)}
            unitMeta={currentUnitMeta}
            variableName={row.variable}
            variableUnitMetadata={draftUnitMetadata}
          />
        </div>
      ) : null}
    </div>
  );
}
