import { useCallback, useState } from "react";

import { isRowComment, type InitialValueListItem } from "@sfcr/notebook-core";

import type { InitialValueRow } from "../lib/editorModel";
import type { InitialValueRowEditFocus } from "./components/InitialValueRowInlineEditor";
import {
  isModelVariableNameAvailable,
  patchInitialValueInNotebook,
  type ModelRenameScope
} from "./renameVariable";
import type { NotebookCell } from "./types";
import { useVariableRenameConfirm } from "./useVariableRenameConfirm";
import { findFirstRowNameChange } from "./variableRenameHelpers";

export interface PendingInitialValueRowApply {
  initialValueId: string;
  name: string;
  oldName: string;
  valueText: string;
}

export function useInlineInitialValueRowEdit({
  cells,
  initialValues,
  onChangeInitialValues,
  onReplaceCells,
  scope
}: {
  cells: NotebookCell[];
  initialValues: InitialValueListItem[];
  onChangeInitialValues(next: InitialValueListItem[]): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope;
}) {
  const [editingInitialValueId, setEditingInitialValueId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftValueText, setDraftValueText] = useState("");
  const [editFocus, setEditFocus] = useState<InitialValueRowEditFocus>("value");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingInitialValueRowApply | null>(null);
  const renameConfirm = useVariableRenameConfirm({ cells, onReplaceCells, scope });

  const cancelRowEdit = useCallback(() => {
    setEditingInitialValueId(null);
    setDraftName("");
    setDraftValueText("");
    setValidationError(null);
    setPendingApply(null);
    renameConfirm.clearRenameDialog();
  }, [renameConfirm]);

  const beginRowEdit = useCallback(
    (initialValueId: string, focus: InitialValueRowEditFocus) => {
      const initialValue = initialValues.find((entry) => entry.id === initialValueId);
      if (!initialValue || isRowComment(initialValue)) {
        return;
      }

      setEditingInitialValueId(initialValueId);
      setDraftName(initialValue.name);
      setDraftValueText(initialValue.valueText);
      setEditFocus(focus);
      setValidationError(null);
      setPendingApply(null);
      renameConfirm.clearRenameDialog();
    },
    [initialValues, renameConfirm]
  );

  const commitRowOnly = useCallback(
    (patch: Pick<InitialValueRow, "id" | "name" | "valueText">) => {
      onChangeInitialValues(
        initialValues.map((row) =>
          isRowComment(row) || row.id !== patch.id
            ? row
            : {
                ...row,
                name: patch.name,
                valueText: patch.valueText
              }
        )
      );
      cancelRowEdit();
    },
    [cancelRowEdit, initialValues, onChangeInitialValues]
  );

  const applyRowEdit = useCallback(() => {
    if (!editingInitialValueId) {
      return;
    }

    const initialValue = initialValues.find((entry) => entry.id === editingInitialValueId);
    if (!initialValue || isRowComment(initialValue)) {
      cancelRowEdit();
      return;
    }

    const trimmedName = draftName.trim();
    const trimmedValueText = draftValueText.trim();
    if (!trimmedName) {
      setValidationError("Name is required.");
      return;
    }

    const oldName = initialValue.name.trim();
    const hasNameChange = trimmedName !== oldName;

    if (!hasNameChange) {
      if (
        trimmedName === initialValue.name.trim() &&
        trimmedValueText === initialValue.valueText.trim()
      ) {
        cancelRowEdit();
        return;
      }

      commitRowOnly({
        id: editingInitialValueId,
        name: trimmedName,
        valueText: trimmedValueText
      });
      return;
    }

    if (
      !isModelVariableNameAvailable(cells, scope, trimmedName, {
        excludeInitialValueId: editingInitialValueId
      })
    ) {
      setValidationError(`Variable '${trimmedName}' is already defined in this model.`);
      return;
    }

    setValidationError(null);
    const nextPendingApply = {
      initialValueId: editingInitialValueId,
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
    editingInitialValueId,
    initialValues,
    renameConfirm,
    scope
  ]);

  const confirmRenameNo = useCallback(() => {
    if (!pendingApply) {
      return;
    }

    renameConfirm.confirmRenameNo(() =>
      commitRowOnly({
        id: pendingApply.initialValueId,
        name: pendingApply.name,
        valueText: pendingApply.valueText
      })
    );
  }, [commitRowOnly, pendingApply, renameConfirm]);

  const confirmRenameYes = useCallback(() => {
    if (!pendingApply) {
      return;
    }

    renameConfirm.confirmRenameYes({
      onComplete: cancelRowEdit,
      patch: (nextCells) =>
        patchInitialValueInNotebook(nextCells, scope, pendingApply.initialValueId, {
          name: pendingApply.name,
          valueText: pendingApply.valueText
        })
    });
  }, [cancelRowEdit, pendingApply, renameConfirm, scope]);

  return {
    applyRowEdit,
    beginRowEdit,
    cancelRowEdit,
    confirmRenameNo,
    confirmRenameYes,
    draftName,
    draftValueText,
    editFocus,
    editingInitialValueId,
    renameDialog: renameConfirm.renameDialog,
    renameReferenceCount: renameConfirm.renameReferenceCount,
    setDraftName,
    setDraftValueText,
    validationError
  };
}

export function useInitialValueBatchRename({
  cellId,
  cells,
  onApplyDraft,
  onReplaceCells,
  scope
}: {
  cellId: string;
  cells: NotebookCell[];
  onApplyDraft(initialValues: InitialValueListItem[]): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope;
}) {
  const [pendingDraft, setPendingDraft] = useState<InitialValueListItem[] | null>(null);
  const renameConfirm = useVariableRenameConfirm({ cells, onReplaceCells, scope });

  const cancelBatchRename = useCallback(() => {
    setPendingDraft(null);
    renameConfirm.clearRenameDialog();
  }, [renameConfirm]);

  const requestBatchApply = useCallback(
    (
      previousInitialValues: InitialValueListItem[],
      draftInitialValues: InitialValueListItem[]
    ): boolean => {
      const nameChange = findFirstRowNameChange(previousInitialValues, draftInitialValues);
      if (!nameChange) {
        onApplyDraft(draftInitialValues);
        return false;
      }

      if (
        !isModelVariableNameAvailable(cells, scope, nameChange.newName, {
          excludeInitialValueId: nameChange.id
        })
      ) {
        throw new Error(`Variable '${nameChange.newName}' is already defined in this model.`);
      }

      setPendingDraft(draftInitialValues);
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
          entry.id === cellId && entry.type === "initial-values"
            ? { ...entry, initialValues: pendingDraft }
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
