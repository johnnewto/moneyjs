import { useEffect } from "react";
import { createPortal } from "react-dom";

import { useFloatingPanelPosition } from "../../hooks/useFloatingPanelPosition";
import { VariableMathLabel } from "../../components/VariableMathLabel";
import type { VariableReferenceCell } from "../renameVariable";

const USAGES_PANEL_POSITION_KEY = "sfcr:notebook-variable-usages-panel-position";

interface VariableUsagesPopupProps {
  variableName: string;
  usages: VariableReferenceCell[];
  onClose(): void;
  onNavigate(cellId: string): void;
}

export function VariableUsagesPopup({
  variableName,
  usages,
  onClose,
  onNavigate
}: VariableUsagesPopupProps) {
  const { position, dragHandleProps } = useFloatingPanelPosition(
    USAGES_PANEL_POSITION_KEY
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const totalReferences = usages.reduce((sum, entry) => sum + entry.referenceCount, 0);

  const panel = (
    <div
      className="notebook-variable-usages-panel"
      role="dialog"
      aria-label={`Usages of ${variableName}`}
      style={{ left: position.x, top: position.y }}
    >
      <header className="notebook-variable-usages-header" {...dragHandleProps}>
        <div>
          <p className="panel-subtitle">Appears in</p>
          <h3>
            <VariableMathLabel name={variableName} />
          </h3>
          <p className="notebook-variable-usages-subtitle">
            {usages.length} cell{usages.length === 1 ? "" : "s"} · {totalReferences} reference
            {totalReferences === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          className="notebook-variable-usages-close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          aria-label="Close usages"
        >
          ×
        </button>
      </header>
      <div className="notebook-variable-usages-body">
        {usages.length > 0 ? (
          <ul className="notebook-variable-usages-list" aria-label="Cells using this variable">
            {usages.map((entry) => (
              <li key={entry.cellId} className="notebook-variable-usages-item">
                <button
                  type="button"
                  className="notebook-variable-usages-link"
                  onClick={() => onNavigate(entry.cellId)}
                >
                  <span className="notebook-variable-usages-type">{entry.cellType}</span>
                  <span className="notebook-variable-usages-title">{entry.cellTitle}</span>
                  <span className="notebook-variable-usages-count">
                    {entry.referenceCount} reference{entry.referenceCount === 1 ? "" : "s"}
                    <span aria-hidden="true"> ↗</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notebook-variable-usages-empty">
            No usages found for <VariableMathLabel name={variableName} />.
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
