import { useEffect } from "react";

import { NOTEBOOK_TOUR_STEPS } from "./notebookTour";

export function NotebookTourMenu({
  onClose,
  onSelectStep
}: {
  onClose(): void;
  onSelectStep(startIndex: number): void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onClose}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog notebook-tour-menu"
        role="dialog"
        aria-labelledby="notebook-tour-menu-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="notebook-tour-menu-title">Notebook tour</h3>
        <p className="notebook-confirm-dialog-summary">
          Start the full tour or jump to a specific step. You can still move forward and back inside the
          tour.
        </p>

        <div className="notebook-tour-menu-actions">
          <button
            type="button"
            className="notebook-run-button"
            onClick={() => onSelectStep(0)}
          >
            Full tour ({NOTEBOOK_TOUR_STEPS.length} steps)
          </button>
        </div>

        <ol className="notebook-tour-menu-steps">
          {NOTEBOOK_TOUR_STEPS.map((step, index) => (
            <li key={step.id}>
              <button
                type="button"
                className="notebook-tour-menu-step-button"
                onClick={() => onSelectStep(index)}
              >
                <span className="notebook-tour-menu-step-index">{index + 1}</span>
                <span className="notebook-tour-menu-step-title">{step.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
