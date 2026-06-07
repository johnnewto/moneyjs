import { isRowComment, type InitialValueListItem } from "@sfcr/notebook-core";

import type { InitialValueRow } from "../lib/editorModel";

export const MODEL_INITIAL_VALUE_PLACEHOLDER = "---";

export function lookupInitialValueByName(
  initialValues: InitialValueListItem[],
  variableName: string
): InitialValueRow | null {
  const trimmed = variableName.trim();
  if (!trimmed) {
    return null;
  }

  const match = initialValues.find(
    (entry) => !isRowComment(entry) && entry.name.trim() === trimmed
  );
  return match && !isRowComment(match) ? match : null;
}

export function formatModelInitialValueDisplay(
  initialValue: { valueText: string } | null | undefined
): string {
  const valueText = initialValue?.valueText.trim();
  return valueText ? initialValue!.valueText : MODEL_INITIAL_VALUE_PLACEHOLDER;
}
