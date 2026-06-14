import {
  NOTEBOOK_AI_GUIDE_URL,
  NOTEBOOK_AI_LANDING_URL
} from "../notebookAppHelpers";

export function NotebookCommandActions({
  activeRailTab,
  nextRedoLabel,
  nextUndoLabel,
  onCopyShareLink,
  onOpenContents,
  onOpenTour,
  onRedo,
  onRunAll,
  onUndo,
  onValidate,
  publicationHref = null
}: {
  activeRailTab: string;
  nextRedoLabel?: string;
  nextUndoLabel?: string;
  onCopyShareLink(): void;
  onOpenContents(): void;
  onOpenTour(): void;
  onRedo(): void;
  onRunAll(): void;
  onUndo(): void;
  onValidate(): void;
  publicationHref?: string | null;
}) {
  return (
    <div className="notebook-commands-panel-actions">
      <button
        type="button"
        className="notebook-run-button"
        title={nextUndoLabel ? `Undo: ${nextUndoLabel}` : "Nothing to undo"}
        aria-label={nextUndoLabel ? `Undo: ${nextUndoLabel}` : "Undo"}
        onClick={onUndo}
        disabled={!nextUndoLabel}
      >
        Undo
      </button>
      <button
        type="button"
        className="notebook-run-button"
        title={nextRedoLabel ? `Redo: ${nextRedoLabel}` : "Nothing to redo"}
        aria-label={nextRedoLabel ? `Redo: ${nextRedoLabel}` : "Redo"}
        onClick={onRedo}
        disabled={!nextRedoLabel}
      >
        Redo
      </button>
      <button type="button" id="notebook-run-all" className="notebook-run-button" onClick={onRunAll}>
        Run all
      </button>
      <button type="button" className="notebook-run-button" onClick={onValidate}>
        Validate
      </button>
      <button type="button" className="notebook-run-button" onClick={onCopyShareLink}>
        Share link
      </button>
      {publicationHref ? (
        <a className="notebook-toolbar-link notebook-run-button" href={publicationHref}>
          Publication view
        </a>
      ) : null}
      <button
        type="button"
        className="notebook-run-button"
        {...{ "aria-pressed": activeRailTab === "contents" }}
        onClick={onOpenContents}
      >
        Contents
      </button>
      <a
        className="notebook-toolbar-link notebook-run-button"
        href={NOTEBOOK_AI_LANDING_URL}
        rel="noreferrer"
        target="_blank"
      >
        AI resources
      </a>
      <a
        className="notebook-toolbar-link notebook-run-button"
        href={NOTEBOOK_AI_GUIDE_URL}
        rel="noreferrer"
        target="_blank"
      >
        AI guide
      </a>
      <button
        type="button"
        id="notebook-tour-launcher"
        className="notebook-run-button notebook-tour-launcher"
        aria-label="Choose tour step"
        aria-haspopup="dialog"
        title="Tour"
        onClick={onOpenTour}
      >
        Tour
      </button>
    </div>
  );
}
