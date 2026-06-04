import { RowCommentMarkdown } from "./RowCommentMarkdown";

export function NotebookRowComment({
  draftText,
  isEditing = false,
  mode = "read",
  text,
  validationError = null,
  onApplyEdit,
  onBeginEdit,
  onCancelEdit,
  onContextMenu,
  onDraftTextChange,
  onTextChange
}: {
  draftText?: string;
  isEditing?: boolean;
  mode?: "grid" | "read";
  text: string;
  validationError?: string | null;
  onApplyEdit?(): void;
  onBeginEdit?(): void;
  onCancelEdit?(): void;
  onContextMenu?(event: React.MouseEvent<HTMLDivElement>): void;
  onDraftTextChange?(value: string): void;
  onTextChange?(value: string): void;
}) {
  if (mode === "grid") {
    return (
      <div
        className="notebook-model-view-row notebook-model-view-row-comment notebook-model-view-row-comment-grid"
        role="row"
        onContextMenu={onContextMenu}
      >
        <label className="notebook-model-view-row-comment-editor" role="cell">
          <span className="notebook-model-view-row-comment-editor-label">Section</span>
          <input
            aria-label="Section comment"
            className="notebook-model-view-row-comment-input"
            placeholder="Section note (**bold**, `code`)"
            value={text}
            onChange={(event) => onTextChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onTextChange?.(text);
              }
            }}
          />
        </label>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div
        className="notebook-model-view-row notebook-model-view-row-comment notebook-model-view-row-editing"
        role="row"
      >
        <div className="notebook-model-view-row-editor-cell" role="cell">
          <div className="notebook-equation-row-editor">
            <input
              aria-label="Section comment"
              autoFocus
              className="notebook-equation-row-expression-input"
              placeholder="Section note (**bold**, `code`)"
              value={draftText ?? ""}
              onChange={(event) => onDraftTextChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onApplyEdit?.();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancelEdit?.();
                }
              }}
            />
            {validationError ? <div className="error-text">{validationError}</div> : null}
            <div className="notebook-equation-row-editor-actions">
              <button disabled={false} onClick={onApplyEdit} type="button">
                Apply
              </button>
              <button className="secondary-button" onClick={onCancelEdit} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="notebook-model-view-row notebook-model-view-row-comment"
      role="row"
      title="Double-click to edit"
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onBeginEdit?.();
      }}
    >
      <div className="notebook-model-view-row-comment-text" role="cell">
        <RowCommentMarkdown text={text} />
      </div>
    </div>
  );
}
