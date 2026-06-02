import { useCallback, useState } from "react";

import { isRowComment, type InitialValueListItem } from "@sfcr/notebook-core";

import type { InitialValueRow } from "../lib/editorModel";
import type { InitialValueRowEditFocus } from "./components/InitialValueRowInlineEditor";

export function useInlineInitialValueRowEdit({
  initialValues,
  onChangeInitialValues
}: {
  initialValues: InitialValueListItem[];
  onChangeInitialValues(next: InitialValueListItem[]): void;
}) {
  const [editingInitialValueId, setEditingInitialValueId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftValueText, setDraftValueText] = useState("");
  const [editFocus, setEditFocus] = useState<InitialValueRowEditFocus>("value");
  const [validationError, setValidationError] = useState<string | null>(null);

  const cancelRowEdit = useCallback(() => {
    setEditingInitialValueId(null);
    setDraftName("");
    setDraftValueText("");
    setValidationError(null);
  }, []);

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
    },
    [initialValues]
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

    if (
      trimmedName === initialValue.name.trim() &&
      trimmedValueText === initialValue.valueText.trim()
    ) {
      cancelRowEdit();
      return;
    }

    onChangeInitialValues(
      initialValues.map((row) =>
        isRowComment(row) || row.id !== editingInitialValueId
          ? row
          : {
              ...row,
              name: trimmedName,
              valueText: trimmedValueText
            }
      )
    );
    cancelRowEdit();
  }, [
    cancelRowEdit,
    draftName,
    draftValueText,
    editingInitialValueId,
    initialValues,
    onChangeInitialValues
  ]);

  return {
    applyRowEdit,
    beginRowEdit,
    cancelRowEdit,
    draftName,
    draftValueText,
    editFocus,
    editingInitialValueId,
    setDraftName,
    setDraftValueText,
    validationError
  };
}
