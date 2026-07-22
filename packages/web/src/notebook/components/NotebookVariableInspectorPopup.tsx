import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PinToggleIcon } from "../../components/PinToggleIcon";
import { useFloatingPanelPosition } from "../../hooks/useFloatingPanelPosition";

const FLOATING_PANEL_STORAGE_KEY = "sfcr:notebook-inspector-position";

export function NotebookVariableInspectorPopup({
  children,
  onClose,
  selectedPeriodIndex,
  subtitle
}: {
  children: ReactNode;
  onClose(): void;
  selectedPeriodIndex: number;
  subtitle?: string | null;
}) {
  const { position, dragHandleProps } = useFloatingPanelPosition(FLOATING_PANEL_STORAGE_KEY);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const panel = (
    <div
      className="stability-raw-floating-panel notebook-inspector-popup"
      role="dialog"
      aria-label="Variable inspector"
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Variable inspector</div>
          <p className="stability-raw-dialog-subtitle">
            Period {selectedPeriodIndex + 1}
            {subtitle?.trim() ? ` · ${subtitle.trim()}` : ""}
          </p>
        </div>
        <div className="notebook-inspector-popup-header-actions">
          <button
            type="button"
            className="result-chart-pin-button"
            aria-label="Dock inspector"
            aria-pressed={true}
            title="Dock inspector"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <PinToggleIcon pinned />
          </button>
          <button
            type="button"
            className="stability-raw-dialog-close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </header>

      <div className="stability-raw-dialog-body notebook-inspector-popup-body">{children}</div>
    </div>
  );

  return createPortal(panel, document.body);
}
