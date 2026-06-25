import { useEffect, useState } from "react";

import { formatCompactRowCommentText, isRowComment, type ExternalListItem } from "@sfcr/notebook-core";

import type { ExternalRow } from "../lib/editorModel";
import { NotebookRowComment } from "../notebook/components/NotebookRowComment";
import { newRowComment, patchCommentInRows } from "../notebook/rowCommentHelpers";
import {
  canMoveRowDown,
  canMoveRowUp,
  GridRowContextMenu,
  GridRowDeleteDialog,
  insertRowAt,
  moveRow,
  removeRow,
  useGridRowContextMenu
} from "./GridRowContextMenu";
import { GridRowControls } from "./GridRowControls";
import { EquationUnitsPopover } from "./EquationGridEditor";

interface ExternalEditorProps {
  currentValues?: Record<string, number | undefined>;
  externals: ExternalListItem[];
  isEmbedded?: boolean;
  issues: Record<string, string | undefined>;
  onChange(next: ExternalListItem[]): void;
  showHeading?: boolean;
}

export function ExternalEditor({
  currentValues: _currentValues = {},
  externals,
  isEmbedded = false,
  issues,
  onChange,
  showHeading = true
}: ExternalEditorProps) {
  const [openUnitPopoverRowId, setOpenUnitPopoverRowId] = useState<string | null>(null);
  const rowContextMenu = useGridRowContextMenu({
    ignoredSelector: "button, select, .equation-grid-unit-cell, .equation-badge-popover-panel",
    onChangeRows: onChange,
    rows: externals
  });

  useEffect(() => {
    if (!openUnitPopoverRowId) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        setOpenUnitPopoverRowId(null);
        return;
      }

      if (event.target.closest(".equation-grid-unit-cell")) {
        return;
      }

      setOpenUnitPopoverRowId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openUnitPopoverRowId]);

  return (
    <section className={isEmbedded ? "grid-editor-embedded" : "editor-panel"}>
      {showHeading ? (
        <div className="panel-header">
          <div>
            <h2>Externals</h2>
            <p className="panel-subtitle">
              Parameters and exogenous series in the same compact ledger style as equations.
            </p>
          </div>
        </div>
      ) : null}

      <div className="external-grid-shell">
        <div className="external-grid-header" role="row">
          <span>#</span>
          <span>Name</span>
          <span>Value</span>
          <span>Description</span>
          <span>Units</span>
          <span>Kind</span>
          <span>Status</span>
          <span />
        </div>

        <div className="external-grid-body">
        {externals.map((row, index) => {
          if (isRowComment(row)) {
            return (
              <NotebookRowComment
                key={row.id}
                mode="grid"
                text={row.text}
                onContextMenu={(event) => rowContextMenu.handleRowContextMenu(event, index)}
                onTextChange={(text) => onChange(patchCommentInRows(externals, row.id, text))}
                rowControls={
                  <GridRowControls
                    canMoveDown={canMoveRowDown(externals, index)}
                    canMoveUp={canMoveRowUp(externals, index)}
                    onInsertAfter={() =>
                      onChange(insertRowAt(externals, index + 1, newRowComment()))
                    }
                    onMoveDown={() => onChange(moveRow(externals, index, 1))}
                    onMoveUp={() => onChange(moveRow(externals, index, -1))}
                    onRemove={() => onChange(removeRow(externals, index))}
                    rowIndex={index}
                    rowTypeLabel="section comment"
                  />
                }
              />
            );
          }

          const external = row;
          return (
          <div
            className={`external-grid-row${
              issues[`externals.${index}.name`] || issues[`externals.${index}.valueText`]
                ? " has-issue"
                : ""
            }`}
            key={external.id}
            onContextMenu={(event) => {
              setOpenUnitPopoverRowId(null);
              rowContextMenu.handleRowContextMenu(event, index);
            }}
            role="row"
          >
            <span className="external-grid-index">{index + 1}</span>
            <input
              aria-label={`External ${index + 1} name`}
              className={issues[`externals.${index}.name`] ? "input-error" : ""}
              value={external.name}
              onChange={(event) =>
                updateRow(externals, index, { name: event.target.value }, onChange)
              }
              placeholder="alpha1"
            />
            <input
              aria-label={`External ${index + 1} value`}
              className={issues[`externals.${index}.valueText`] ? "input-error" : ""}
              value={external.valueText}
              onChange={(event) =>
                updateRow(externals, index, { valueText: event.target.value }, onChange)
              }
              placeholder="20 or 20, 21, 22"
            />
            <input
              aria-label={`External ${index + 1} description`}
              className="external-grid-description"
              value={external.desc ?? ""}
              onChange={(event) =>
                updateRow(externals, index, { desc: event.target.value }, onChange)
              }
              placeholder="Propensity to consume out of income"
              spellCheck={false}
            />
            <EquationUnitsPopover
              expression=""
              isOpen={openUnitPopoverRowId === external.id}
              onChange={(unitMeta) => updateRow(externals, index, { unitMeta }, onChange)}
              onToggle={() =>
                setOpenUnitPopoverRowId((current) =>
                  current === external.id ? null : external.id
                )
              }
              unitMeta={external.unitMeta}
              variableName={external.name}
            />
            <select
              aria-label={`External ${index + 1} kind`}
              value={external.kind}
              onChange={(event) =>
                updateRow(externals, index, {
                  kind: event.target.value as ExternalRow["kind"]
                }, onChange)
              }
            >
              <option value="constant">Constant</option>
              <option value="series">Series</option>
              <option value="coefficient">Coefficient</option>
            </select>
            <span
              className={`external-grid-status${
                issues[`externals.${index}.name`] || issues[`externals.${index}.valueText`]
                  ? " has-issue"
                  : ""
              }`}
            >
              {issues[`externals.${index}.name`] ?? issues[`externals.${index}.valueText`] ?? "OK"}
            </span>
            <GridRowControls
              canMoveDown={canMoveRowDown(externals, index)}
              canMoveUp={canMoveRowUp(externals, index)}
              onInsertAfter={() =>
                onChange(insertRowAt(externals, index + 1, newExternalRow()))
              }
              onMoveDown={() => onChange(moveRow(externals, index, 1))}
              onMoveUp={() => onChange(moveRow(externals, index, -1))}
              onRemove={() => onChange(removeRow(externals, index))}
              rowIndex={index}
              rowTypeLabel="external"
            />
          </div>
          );
        })}

          {externals.length === 0 ? (
            <div className="external-grid-empty">Add an external to define a parameter or input series.</div>
          ) : null}
        </div>
      </div>

      <div className="grid-editor-footer">
        <button type="button" onClick={() => onChange([...externals, newExternalRow()])}>
          Add external
        </button>
        <button type="button" className="secondary-button" onClick={() => onChange([...externals, newRowComment()])}>
          Add section comment
        </button>
      </div>

      {rowContextMenu.rowContextMenu ? (
        <GridRowContextMenu
          addCommentLabel="Add section comment"
          addItemLabel="Add external"
          canMoveDown={canMoveRowDown(externals, rowContextMenu.rowContextMenu.rowIndex)}
          canMoveUp={canMoveRowUp(externals, rowContextMenu.rowContextMenu.rowIndex)}
          menuRef={rowContextMenu.rowContextMenuRef}
          menuTypeLabel="External"
          onAdd={() =>
            rowContextMenu.insertRowBelow(rowContextMenu.rowContextMenu!.rowIndex, newExternalRow())
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
            isRowComment(externals[rowContextMenu.deleteDialogRowIndex])
              ? "Delete section comment?"
              : "Delete external?"
          }
          itemLabel={formatExternalDeleteLabel(
            externals[rowContextMenu.deleteDialogRowIndex],
            rowContextMenu.deleteDialogRowIndex
          )}
          onCancel={rowContextMenu.cancelDelete}
          onConfirm={rowContextMenu.confirmDelete}
        />
      ) : null}
    </section>
  );
}

function newExternalRow(): ExternalRow {
  return {
    id: `ext-${crypto.randomUUID()}`,
    name: "",
    desc: "",
    kind: "constant",
    valueText: ""
  };
}

function updateRow(
  rows: ExternalListItem[],
  index: number,
  patch: Partial<ExternalRow>,
  onChange: (next: ExternalListItem[]) => void
): void {
  onChange(
    rows.map((row, rowIndex) =>
      rowIndex === index && !isRowComment(row) ? { ...row, ...patch } : row
    )
  );
}

function formatExternalDeleteLabel(external: ExternalListItem | undefined, rowIndex: number): string {
  if (!external) {
    return `Row ${rowIndex + 1}`;
  }
  if (isRowComment(external)) {
    return formatCompactRowCommentText(external.text);
  }
  const name = external.name.trim();
  return name ? name : `External ${rowIndex + 1}`;
}
