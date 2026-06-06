import { useCallback, useState } from "react";

import {
  countVariableReferences,
  renameVariableInNotebook,
  type ModelRenameScope
} from "./renameVariable";
import type { NotebookCell } from "./types";

export interface VariableRenameRequest {
  newName: string;
  oldName: string;
}

export function useVariableRenameConfirm({
  cells,
  onReplaceCells,
  scope
}: {
  cells: NotebookCell[];
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope | null;
}) {
  const [renameDialog, setRenameDialog] = useState<VariableRenameRequest | null>(null);

  const clearRenameDialog = useCallback(() => {
    setRenameDialog(null);
  }, []);

  const openRenameDialog = useCallback((oldName: string, newName: string) => {
    const normalizedOldName = oldName.trim();
    const normalizedNewName = newName.trim();
    if (!normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
      return;
    }

    setRenameDialog({ oldName: normalizedOldName, newName: normalizedNewName });
  }, []);

  const confirmRenameNo = useCallback(
    (applyLocalChange: () => void) => {
      if (!renameDialog) {
        return;
      }

      applyLocalChange();
      clearRenameDialog();
    },
    [clearRenameDialog, renameDialog]
  );

  const confirmRenameYes = useCallback(
    (options?: {
      onComplete?(): void;
      patch?(nextCells: NotebookCell[]): NotebookCell[];
    }) => {
      if (!renameDialog || !scope) {
        return;
      }

      let nextCells = renameVariableInNotebook(
        cells,
        scope,
        renameDialog.oldName,
        renameDialog.newName
      );
      if (options?.patch) {
        nextCells = options.patch(nextCells);
      }
      onReplaceCells(nextCells);
      options?.onComplete?.();
      clearRenameDialog();
    },
    [cells, clearRenameDialog, onReplaceCells, renameDialog, scope]
  );

  const renameReferenceCount =
    renameDialog && scope
      ? countVariableReferences(cells, scope, renameDialog.oldName)
      : { affectedCells: [], cellCount: 0, referenceCount: 0 };

  return {
    clearRenameDialog,
    confirmRenameNo,
    confirmRenameYes,
    openRenameDialog,
    renameDialog,
    renameReferenceCount
  };
}
