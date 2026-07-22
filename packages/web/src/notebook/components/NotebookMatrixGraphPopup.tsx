import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PinToggleIcon } from "../../components/PinToggleIcon";
import { useFloatingPanelPosition } from "../../hooks/useFloatingPanelPosition";
import { useFloatingPanelSize } from "../../hooks/useFloatingPanelSize";

const FLOATING_PANEL_STORAGE_KEY = "sfcr:notebook-graph-position";
const FLOATING_PANEL_SIZE_KEY = "sfcr:notebook-graph-size";
const DEFAULT_GRAPH_PANEL_SIZE = { width: 544, height: 480 };

export function NotebookMatrixGraphPopup({
  children,
  onClose,
  selectedPeriodIndex
}: {
  children: ReactNode;
  onClose(): void;
  selectedPeriodIndex: number;
}) {
  const { position, dragHandleProps } = useFloatingPanelPosition(FLOATING_PANEL_STORAGE_KEY);
  const { size, resizeHandleProps } = useFloatingPanelSize({
    defaultSize: DEFAULT_GRAPH_PANEL_SIZE,
    position,
    storageKey: FLOATING_PANEL_SIZE_KEY
  });

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
      className="stability-raw-floating-panel notebook-graph-popup"
      role="dialog"
      aria-label="Graph"
      style={{
        height: size.height,
        left: position.x,
        top: position.y,
        width: size.width
      }}
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Graph</div>
          <p className="stability-raw-dialog-subtitle">Period {selectedPeriodIndex + 1}</p>
        </div>
        <div className="notebook-inspector-popup-header-actions">
          <button
            type="button"
            className="result-chart-pin-button"
            aria-label="Dock graph"
            aria-pressed={true}
            title="Dock graph"
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

      <div className="stability-raw-dialog-body notebook-graph-popup-body">{children}</div>
      <div {...resizeHandleProps} aria-label="Resize graph panel" />
    </div>
  );

  return createPortal(panel, document.body);
}
