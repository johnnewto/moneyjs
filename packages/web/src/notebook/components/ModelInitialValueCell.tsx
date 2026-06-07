import { useEffect, useRef } from "react";

import {
  formatModelInitialValueDisplay,
  MODEL_INITIAL_VALUE_PLACEHOLDER
} from "../modelInitialValueDisplay";

export function ModelInitialValueCell({
  draftValueText,
  initialValueText,
  isEditing,
  validationError,
  variableName,
  onApply,
  onBeginEdit,
  onCancel,
  onDraftValueTextChange
}: {
  draftValueText: string;
  initialValueText: string | null;
  isEditing: boolean;
  validationError?: string | null;
  variableName: string;
  onApply(): void;
  onBeginEdit(): void;
  onCancel(): void;
  onDraftValueTextChange(value: string): void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayText = formatModelInitialValueDisplay(
    initialValueText == null ? null : { valueText: initialValueText }
  );
  const isPlaceholder = displayText === MODEL_INITIAL_VALUE_PLACEHOLDER;

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  if (isEditing) {
    return (
      <span className="notebook-model-view-initial is-editing" role="cell">
        <input
          ref={inputRef}
          aria-label={`Initial value for ${variableName.trim() || "variable"}`}
          className={`notebook-model-view-initial-input${
            validationError ? " input-error" : ""
          }`}
          value={draftValueText}
          onChange={(event) => onDraftValueTextChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              onApply();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          spellCheck={false}
        />
        {validationError ? <span className="error-text">{validationError}</span> : null}
      </span>
    );
  }

  return (
    <span
      className={[
        "notebook-model-view-initial",
        "is-editable",
        isPlaceholder ? "is-placeholder" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      role="cell"
      title="Double-click to edit"
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onBeginEdit();
      }}
    >
      {displayText}
    </span>
  );
}
