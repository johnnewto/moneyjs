import { useEffect, useRef } from "react";

export function CommentRowInlineEditor({
  draftText,
  hasDraftChanges,
  validationError,
  onApply,
  onCancel,
  onDraftTextChange
}: {
  draftText: string;
  hasDraftChanges: boolean;
  validationError: string | null;
  onApply(): void;
  onCancel(): void;
  onDraftTextChange(value: string): void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="notebook-equation-row-editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <input
        ref={inputRef}
        aria-label="Section comment"
        className="notebook-equation-row-expression-input"
        placeholder="Section note (**bold**, `code`)"
        spellCheck={false}
        value={draftText}
        onChange={(event) => onDraftTextChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
        }}
      />
      {validationError ? <div className="error-text">{validationError}</div> : null}
      <div className="notebook-equation-row-editor-actions">
        <button disabled={!hasDraftChanges} onClick={onApply} type="button">
          Apply
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </div>
  );
}
