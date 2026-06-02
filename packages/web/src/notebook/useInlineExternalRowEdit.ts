import { useCallback, useState } from "react";

import { isRowComment, type ExternalListItem } from "@sfcr/notebook-core";

import type { ExternalRow } from "../lib/editorModel";
import {
  countVariableReferences,
  isModelVariableNameAvailable,
  patchExternalInNotebook,
  renameVariableInNotebook,
  type ModelRenameScope
} from "./renameVariable";
import type { ExternalRowEditFocus } from "./components/ExternalRowInlineEditor";
import type { NotebookCell } from "./types";

export interface PendingExternalRowApply {
  externalId: string;
  name: string;
  oldName: string;
  valueText: string;
}

export function useInlineExternalRowEdit({
  cells,
  externals,
  onChangeExternals,
  onReplaceCells,
  scope
}: {
  cells: NotebookCell[];
  externals: ExternalListItem[];
  onChangeExternals(next: ExternalListItem[]): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope;
}) {
  const [editingExternalId, setEditingExternalId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftValueText, setDraftValueText] = useState("");
  const [editFocus, setEditFocus] = useState<ExternalRowEditFocus>("value");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<PendingExternalRowApply | null>(null);

  const cancelRowEdit = useCallback(() => {
    setEditingExternalId(null);
    setDraftName("");
    setDraftValueText("");
    setValidationError(null);
    setRenameDialog(null);
  }, []);

  const beginRowEdit = useCallback(
    (externalId: string, focus: ExternalRowEditFocus) => {
      const external = externals.find((entry) => entry.id === externalId);
      if (!external || isRowComment(external)) {
        return;
      }

      setEditingExternalId(externalId);
      setDraftName(external.name);
      setDraftValueText(external.valueText);
      setEditFocus(focus);
      setValidationError(null);
      setRenameDialog(null);
    },
    [externals]
  );

  const commitRowOnly = useCallback(
    (patch: { externalId: string; name: string; valueText: string }) => {
      const nextExternals = externals.map((external) =>
        isRowComment(external) || external.id !== patch.externalId
          ? external
          : {
              ...external,
              name: patch.name,
              valueText: patch.valueText
            }
      );
      onChangeExternals(nextExternals);
      cancelRowEdit();
    },
    [cancelRowEdit, externals, onChangeExternals]
  );

  const applyRowEdit = useCallback(() => {
    if (!editingExternalId) {
      return;
    }

    const external = externals.find((entry) => entry.id === editingExternalId);
    if (!external || isRowComment(external)) {
      cancelRowEdit();
      return;
    }

    const trimmedName = draftName.trim();
    const trimmedValueText = draftValueText.trim();
    if (!trimmedName) {
      setValidationError("Name is required.");
      return;
    }

    const oldName = external.name.trim();
    const hasNameChange = trimmedName !== oldName;

    if (!hasNameChange) {
      if (
        trimmedName === external.name.trim() &&
        trimmedValueText === external.valueText.trim()
      ) {
        cancelRowEdit();
        return;
      }

      commitRowOnly({
        externalId: editingExternalId,
        name: trimmedName,
        valueText: trimmedValueText
      });
      return;
    }

    if (
      !isModelVariableNameAvailable(cells, scope, trimmedName, {
        excludeExternalId: editingExternalId
      })
    ) {
      setValidationError(`Variable '${trimmedName}' is already defined in this model.`);
      return;
    }

    setValidationError(null);
    setRenameDialog({
      externalId: editingExternalId,
      name: trimmedName,
      oldName,
      valueText: trimmedValueText
    });
  }, [
    cancelRowEdit,
    cells,
    commitRowOnly,
    draftName,
    draftValueText,
    editingExternalId,
    externals,
    scope
  ]);

  const confirmRenameNo = useCallback(() => {
    if (!renameDialog) {
      return;
    }

    commitRowOnly(renameDialog);
  }, [commitRowOnly, renameDialog]);

  const confirmRenameYes = useCallback(() => {
    if (!renameDialog) {
      return;
    }

    let nextCells = renameVariableInNotebook(
      cells,
      scope,
      renameDialog.oldName,
      renameDialog.name
    );
    nextCells = patchExternalInNotebook(nextCells, scope, renameDialog.externalId, {
      name: renameDialog.name,
      valueText: renameDialog.valueText
    });
    onReplaceCells(nextCells);
    cancelRowEdit();
  }, [cancelRowEdit, cells, onReplaceCells, renameDialog, scope]);

  const renameReferenceCount = renameDialog
    ? countVariableReferences(cells, scope, renameDialog.oldName)
    : { cellCount: 0, referenceCount: 0 };

  return {
    applyRowEdit,
    beginRowEdit,
    cancelRowEdit,
    confirmRenameNo,
    confirmRenameYes,
    draftName,
    draftValueText,
    editFocus,
    editingExternalId,
    renameDialog,
    renameReferenceCount,
    setDraftName,
    setDraftValueText,
    validationError
  };
}
