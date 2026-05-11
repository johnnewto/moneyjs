import type { NotebookAssistantMessage } from "./notebookAssistantRuntime";

export function AssistantInlinePatchView({
  message,
  onApply,
  onDiscard,
  onPreviewJson,
  onToggleJson,
  onUndo,
  onUpdateJson,
  undoStackLength
}: {
  message: NotebookAssistantMessage;
  onApply: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  onPreviewJson: (messageId: string) => void;
  onToggleJson: (messageId: string) => void;
  onUndo: (messageId: string) => void;
  onUpdateJson: (messageId: string, value: string) => void;
  undoStackLength: number;
}) {
  if (!message.patch) {
    return null;
  }

  const patch = message.patch;
  const preview = patch.preview;
  const canApplyPatch = preview.ok && patch.status === "ready" && !patch.isJsonDirty;
  const statusText = patch.status === "applied"
    ? "applied"
    : patch.status === "discarded"
      ? "discarded"
      : patch.isJsonDirty
        ? "edited"
        : preview.ok
          ? "valid"
          : "invalid";

  return (
    <div className="notebook-assistant-inline-patch" role="group" aria-label="Assistant patch proposal">
      <div className="notebook-assistant-inline-patch-summary">
        <strong>Patch proposal</strong>
        {patch.isJsonDirty ? (
          <span>{statusText}. Preview JSON before applying.</span>
        ) : (
          <span>
            {statusText}. Operations: {preview.summary.operationCount}; added: {preview.summary.addedCells}; changed: {preview.summary.changedCells}; removed: {preview.summary.removedCells}.
          </span>
        )}
      </div>
      {preview.issues.length > 0 ? (
        <ul className="notebook-inline-list">
          {preview.issues.map((issue, index) => (
            <li key={`${issue.message}-${index}`} className={issue.severity === "error" ? "field-error" : "status-hint"}>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="button-row notebook-assistant-inline-patch-actions">
        <button
          type="button"
          onClick={() => onApply(message.id)}
          disabled={!canApplyPatch}
        >
          Apply
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onDiscard(message.id)}
          disabled={patch.status !== "ready"}
        >
          Discard
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onToggleJson(message.id)}
        >
          {patch.isJsonVisible ? "Hide JSON" : "Edit JSON"}
        </button>
        {patch.status === "applied" ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => onUndo(message.id)}
            disabled={undoStackLength === 0}
          >
            Undo
          </button>
        ) : null}
      </div>
      {patch.isJsonVisible ? (
        <div className="notebook-assistant-inline-patch-editor">
          <textarea
            aria-label="Inline assistant patch JSON"
            className="notebook-utility-textarea notebook-assistant-inline-patch-json"
            readOnly={patch.status !== "ready"}
            rows={5}
            value={patch.jsonText ?? JSON.stringify(patch.patch, null, 2)}
            onChange={(event) => onUpdateJson(message.id, event.target.value)}
          />
          {patch.status === "ready" ? (
            <div className="button-row notebook-assistant-inline-patch-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => onPreviewJson(message.id)}
                disabled={!patch.isJsonDirty && preview.ok}
              >
                Preview JSON
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
