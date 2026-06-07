import { useCallback, useState } from "react";

import { isRowComment, type InitialValueListItem } from "@sfcr/notebook-core";

import { lookupInitialValueByName } from "./modelInitialValueDisplay";

export function useVariableInitialValueEdit({
  initialValues,
  onUpdateInitialValues
}: {
  initialValues: InitialValueListItem[];
  onUpdateInitialValues(next: InitialValueListItem[]): void;
}) {
  const [editingVariableName, setEditingVariableName] = useState<string | null>(null);
  const [draftValueText, setDraftValueText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const cancelEdit = useCallback(() => {
    setEditingVariableName(null);
    setDraftValueText("");
    setValidationError(null);
  }, []);

  const beginEdit = useCallback(
    (variableName: string) => {
      const trimmed = variableName.trim();
      if (!trimmed) {
        return;
      }

      const existing = lookupInitialValueByName(initialValues, trimmed);
      setEditingVariableName(trimmed);
      setDraftValueText(existing?.valueText ?? "");
      setValidationError(null);
    },
    [initialValues]
  );

  const applyEdit = useCallback(() => {
    if (!editingVariableName) {
      return;
    }

    const existing = lookupInitialValueByName(initialValues, editingVariableName);
    const trimmedDraft = draftValueText.trim();

    if (existing) {
      if (draftValueText === existing.valueText) {
        cancelEdit();
        return;
      }

      onUpdateInitialValues(
        initialValues.map((row) =>
          isRowComment(row) || row.id !== existing.id
            ? row
            : {
                ...row,
                valueText: draftValueText
              }
        )
      );
      cancelEdit();
      return;
    }

    if (!trimmedDraft) {
      cancelEdit();
      return;
    }

    onUpdateInitialValues([
      ...initialValues,
      {
        id: `init-${crypto.randomUUID()}`,
        name: editingVariableName,
        desc: "",
        valueText: draftValueText
      }
    ]);
    cancelEdit();
  }, [cancelEdit, draftValueText, editingVariableName, initialValues, onUpdateInitialValues]);

  return {
    applyEdit,
    beginEdit,
    cancelEdit,
    draftValueText,
    editingVariableName,
    setDraftValueText,
    validationError
  };
}

export function initialValueCellProps(
  variableName: string,
  initialValues: InitialValueListItem[],
  initialValueEdit: ReturnType<typeof useVariableInitialValueEdit>
) {
  const trimmed = variableName.trim();
  const existing = lookupInitialValueByName(initialValues, trimmed);

  return {
    draftInitialValueText: initialValueEdit.draftValueText,
    initialValueText: existing?.valueText ?? null,
    initialValueValidationError: initialValueEdit.validationError,
    isEditingInitialValue: initialValueEdit.editingVariableName === trimmed,
    onApplyInitialValue: initialValueEdit.applyEdit,
    onBeginInitialValueEdit: () => initialValueEdit.beginEdit(trimmed),
    onCancelInitialValueEdit: initialValueEdit.cancelEdit,
    onDraftInitialValueTextChange: initialValueEdit.setDraftValueText
  };
}
