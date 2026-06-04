import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDragScroll } from "../../hooks/useDragScroll";
import { useFloatingPanelPosition } from "../../hooks/useFloatingPanelPosition";
import { useFloatingPanelSize } from "../../hooks/useFloatingPanelSize";
import { useNotebookStickySurfaceTop } from "../useNotebookStickySurfaceTop";

const PINNED_CELL_PANEL_POSITION_KEY = "sfcr:notebook-pinned-cell-panel-position";
const PINNED_CELL_PANEL_SIZE_KEY = "sfcr:notebook-pinned-cell-panel-size";

export function PinnedCellPanel({
  cellTitle,
  cellType,
  maxPeriodIndex,
  selectedPeriodIndex,
  onClose,
  renderContent
}: {
  cellTitle: string;
  cellType: string;
  maxPeriodIndex: number;
  selectedPeriodIndex: number;
  onClose(): void;
  renderContent(viewportRoot: HTMLElement | null): ReactNode;
}) {
  const { position, dragHandleProps } = useFloatingPanelPosition(PINNED_CELL_PANEL_POSITION_KEY);
  const { size, resizeHandleProps } = useFloatingPanelSize({
    position,
    storageKey: PINNED_CELL_PANEL_SIZE_KEY
  });
  const panelDragScroll = useDragScroll<HTMLDivElement>();
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);

  const handleScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelDragScroll.dragScrollRef.current = node;
      setScrollRoot(node);
    },
    [panelDragScroll.dragScrollRef]
  );

  useNotebookStickySurfaceTop(scrollRoot);

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
      className="notebook-pinned-cell-panel"
      role="dialog"
      aria-label={`Pinned view: ${cellTitle}`}
      style={{
        height: size.height,
        left: position.x,
        top: position.y,
        width: size.width
      }}
    >
      <header className="notebook-pinned-cell-panel-header">
        <div
          className="notebook-pinned-cell-panel-header-draggable"
          {...dragHandleProps}
        >
          <p className="panel-subtitle">{cellType}</p>
          <h3>{cellTitle}</h3>
          {maxPeriodIndex > 0 ? (
            <p className="notebook-pinned-cell-panel-subtitle">
              Period {selectedPeriodIndex + 1} of {maxPeriodIndex + 1}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="notebook-pinned-cell-panel-close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label="Close pinned view"
        >
          ×
        </button>
      </header>

      <div
        ref={handleScrollRef}
        className={`notebook-pinned-cell-panel-body ${panelDragScroll.dragScrollProps.className}`}
        onClickCapture={panelDragScroll.dragScrollProps.onClickCapture}
        onMouseDown={panelDragScroll.dragScrollProps.onMouseDown}
      >
        {renderContent(scrollRoot)}
      </div>
      <div {...resizeHandleProps} />
    </div>
  );

  return createPortal(panel, document.body);
}
