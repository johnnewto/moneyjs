import { useCallback, useState } from "react";

import { isRowComment, type ExternalListItem } from "@sfcr/notebook-core";

import type { ExternalRow } from "../lib/editorModel";
import {
  isModelVariableNameAvailable,
  patchExternalInNotebook,
  type ModelRenameScope
} from "./renameVariable";
import type { ExternalRowEditFocus } from "./components/ExternalRowInlineEditor";
import type { NotebookCell } from "./types";
import { useVariableRenameConfirm } from "./useVariableRenameConfirm";
import { findFirstRowNameChange } from "./variableRenameHelpers";

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
  const [pendingApply, setPendingApply] = useState<PendingExternalRowApply | null>(null);
  const renameConfirm = useVariableRenameConfirm({ cells, onReplaceCells, scope });

  const cancelRowEdit = useCallback(() => {
    setEditingExternalId(null);
    setDraftName("");
    setDraftValueText("");
    setValidationError(null);
    setPendingApply(null);
    renameConfirm.clearRenameDialog();
  }, [renameConfirm]);

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
      setPendingApply(null);
      renameConfirm.clearRenameDialog();
    },
    [externals, renameConfirm]
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
    const nextPendingApply = {
      externalId: editingExternalId,
      name: trimmedName,
      oldName,
      valueText: trimmedValueText
    };
    setPendingApply(nextPendingApply);
    renameConfirm.openRenameDialog(oldName, trimmedName);
  }, [
    cancelRowEdit,
    cells,
    commitRowOnly,
    draftName,
    draftValueText,
    editingExternalId,
    externals,
    renameConfirm,
    scope
  ]);

  const confirmRenameNo = useCallback(() => {
    if (!pendingApply) {
      return;
    }

    renameConfirm.confirmRenameNo(() => commitRowOnly(pendingApply));
  }, [commitRowOnly, pendingApply, renameConfirm]);

  const confirmRenameYes = useCallback(() => {
    if (!pendingApply) {
      return;
    }

    renameConfirm.confirmRenameYes({
      onComplete: cancelRowEdit,
      patch: (nextCells) =>
        patchExternalInNotebook(nextCells, scope, pendingApply.externalId, {
          name: pendingApply.name,
          valueText: pendingApply.valueText
        })
    });
  }, [cancelRowEdit, pendingApply, renameConfirm, scope]);

  const renameReferenceCount = renameConfirm.renameReferenceCount;

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
    renameDialog: renameConfirm.renameDialog,
    renameReferenceCount,
    setDraftName,
    setDraftValueText,
    validationError
  };
}

export function useExternalBatchRename({
  cellId,
  cells,
  onApplyDraft,
  onReplaceCells,
  scope
}: {
  cellId: string;
  cells: NotebookCell[];
  onApplyDraft(externals: ExternalListItem[]): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope;
}) {
  const [pendingDraft, setPendingDraft] = useState<ExternalListItem[] | null>(null);
  const renameConfirm = useVariableRenameConfirm({ cells, onReplaceCells, scope });

  const cancelBatchRename = useCallback(() => {
    setPendingDraft(null);
    renameConfirm.clearRenameDialog();
  }, [renameConfirm]);

  const requestBatchApply = useCallback(
    (previousExternals: ExternalListItem[], draftExternals: ExternalListItem[]): boolean => {
      const nameChange = findFirstRowNameChange(previousExternals, draftExternals);
      if (!nameChange) {
        onApplyDraft(draftExternals);
        return false;
      }

      if (
        !isModelVariableNameAvailable(cells, scope, nameChange.newName, {
          excludeExternalId: nameChange.id
        })
      ) {
        throw new Error(`Variable '${nameChange.newName}' is already defined in this model.`);
      }

      setPendingDraft(draftExternals);
      renameConfirm.openRenameDialog(nameChange.oldName, nameChange.newName);
      return true;
    },
    [cells, onApplyDraft, renameConfirm, scope]
  );

  const confirmRenameNo = useCallback(() => {
    if (!pendingDraft) {
      return;
    }

    renameConfirm.confirmRenameNo(() => {
      onApplyDraft(pendingDraft);
      cancelBatchRename();
    });
  }, [cancelBatchRename, onApplyDraft, pendingDraft, renameConfirm]);

  const confirmRenameYes = useCallback(() => {
    if (!pendingDraft) {
      return;
    }

    renameConfirm.confirmRenameYes({
      onComplete: () => {
        onApplyDraft(pendingDraft);
        cancelBatchRename();
      },
      patch: (nextCells) =>
        nextCells.map((entry) =>
          entry.id === cellId && (entry.type === "externals" || entry.type === "observed")
            ? { ...entry, externals: pendingDraft }
            : entry
        )
    });
  }, [cancelBatchRename, cellId, onApplyDraft, pendingDraft, renameConfirm]);

  return {
    cancelBatchRename,
    confirmRenameNo,
    confirmRenameYes,
    renameDialog: renameConfirm.renameDialog,
    renameReferenceCount: renameConfirm.renameReferenceCount,
    requestBatchApply
  };
}
