import { useCallback, useState } from "react";

import type { InspectorModelSource } from "../lib/variableInspect";
import { classifyMatrixEntrySource, matrixReferenceShapesMatch } from "./matrixVariableReference";
import {
  countVariableReferences,
  renameVariableInNotebook,
  type ModelRenameScope
} from "./renameVariable";
import type { MatrixCell, NotebookCell } from "./types";

export type MatrixEditingTarget = {
  columnIndex: number;
  rowIndex: number;
};

interface PendingMatrixRename {
  columnIndex: number;
  draftSource: string;
  newName: string;
  oldName: string;
  rowIndex: number;
}

function resolveRenameScope(modelSource: InspectorModelSource | null): ModelRenameScope | null {
  if (!modelSource) {
    return null;
  }

  if ("sourceModelId" in modelSource) {
    return { kind: "modelId", modelId: modelSource.sourceModelId };
  }

  return { kind: "legacyModelCell", cellId: modelSource.sourceModelCellId };
}

export function useMatrixEntryEdit({
  cell,
  cells,
  modelSource,
  onCellChange,
  onReplaceCells
}: {
  cell: MatrixCell;
  cells: NotebookCell[];
  modelSource: InspectorModelSource | null;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
}) {
  const renameScope = resolveRenameScope(modelSource);
  const [editingTarget, setEditingTarget] = useState<MatrixEditingTarget | null>(null);
  const [draftSource, setDraftSource] = useState("");
  const [renameDialog, setRenameDialog] = useState<PendingMatrixRename | null>(null);

  const cancelEntryEdit = useCallback(() => {
    setEditingTarget(null);
    setDraftSource("");
    setRenameDialog(null);
  }, []);

  const commitEntryOnly = useCallback(
    (rowIndex: number, columnIndex: number, nextSource: string) => {
      onCellChange(cell.id, (current) => {
        if (current.type !== "matrix") {
          return current;
        }

        return {
          ...current,
          rows: current.rows.map((row, currentRowIndex) => {
            if (currentRowIndex !== rowIndex) {
              return row;
            }

            const nextValues = row.values.slice();
            nextValues[columnIndex] = nextSource;
            return {
              ...row,
              values: nextValues
            };
          })
        };
      });
      cancelEntryEdit();
    },
    [cancelEntryEdit, cell.id, onCellChange]
  );

  const beginEntryEdit = useCallback((rowIndex: number, columnIndex: number, source: string) => {
    setEditingTarget({ rowIndex, columnIndex });
    setDraftSource(source);
    setRenameDialog(null);
  }, []);

  const applyEntryEdit = useCallback(() => {
    if (!editingTarget) {
      return;
    }

    const trimmedDraft = draftSource.trim();
    const { rowIndex, columnIndex } = editingTarget;
    const currentSource = cell.rows[rowIndex]?.values[columnIndex] ?? "";
    if (trimmedDraft === currentSource.trim()) {
      cancelEntryEdit();
      return;
    }

    const oldReference = classifyMatrixEntrySource(currentSource);
    const newReference = classifyMatrixEntrySource(trimmedDraft);
    const hasVariableRename =
      renameScope != null &&
      oldReference != null &&
      newReference != null &&
      matrixReferenceShapesMatch(oldReference, newReference) &&
      oldReference.variableName !== newReference.variableName;

    if (hasVariableRename) {
      setRenameDialog({
        columnIndex,
        draftSource: trimmedDraft,
        newName: newReference.variableName,
        oldName: oldReference.variableName,
        rowIndex
      });
      return;
    }

    commitEntryOnly(rowIndex, columnIndex, trimmedDraft);
  }, [
    cancelEntryEdit,
    cell.rows,
    commitEntryOnly,
    draftSource,
    editingTarget,
    renameScope
  ]);

  const confirmRenameNo = useCallback(() => {
    if (!renameDialog) {
      return;
    }

    commitEntryOnly(renameDialog.rowIndex, renameDialog.columnIndex, renameDialog.draftSource);
  }, [commitEntryOnly, renameDialog]);

  const confirmRenameYes = useCallback(() => {
    if (!renameDialog || !renameScope) {
      return;
    }

    onReplaceCells(
      renameVariableInNotebook(
        cells,
        renameScope,
        renameDialog.oldName,
        renameDialog.newName
      )
    );
    cancelEntryEdit();
  }, [cancelEntryEdit, cells, onReplaceCells, renameDialog, renameScope]);

  const renameReferenceCount = renameDialog
    ? countVariableReferences(cells, renameScope!, renameDialog.oldName)
    : { affectedCells: [], cellCount: 0, referenceCount: 0 };

  return {
    applyEntryEdit,
    beginEntryEdit,
    cancelEntryEdit,
    confirmRenameNo,
    confirmRenameYes,
    draftSource,
    editingTarget,
    renameDialog,
    renameReferenceCount,
    setDraftSource
  };
}
