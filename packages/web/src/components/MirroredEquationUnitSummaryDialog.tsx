import { formatUnitText, type UnitMeta } from "../lib/unitMeta";
import type { MirroredEquationUnitChange } from "../lib/units";

function formatUnitMetaLabel(unitMeta: UnitMeta | undefined): string {
  if (!unitMeta) {
    return "—";
  }

  const unitLabel = formatUnitText(unitMeta) ?? "—";
  const stockFlowLabel = unitMeta.stockFlow ?? "unset";
  return `${stockFlowLabel} · ${unitLabel}`;
}

export function MirroredEquationUnitSummaryDialog({
  changes,
  isOpen,
  onClose
}: {
  changes: MirroredEquationUnitChange[];
  isOpen: boolean;
  onClose(): void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onClose}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog matrix-unit-meta-dialog mirrored-equation-unit-summary-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Suggested equation unit summary"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Suggest units</h3>
        {changes.length === 0 ? (
          <p className="matrix-unit-meta-dialog-empty">
            No additive or subtractive equations had unit updates from tagged operands.
          </p>
        ) : (
          <>
            <p>
              Updated <strong>{changes.length}</strong> equation{changes.length === 1 ? "" : "s"} by
              mirroring kind and units from tagged RHS operands.
            </p>
            <div className="matrix-unit-meta-dialog-list" role="group" aria-label="Suggested unit updates">
              <div className="matrix-unit-meta-dialog-list-header" aria-hidden="true">
                <span>Variable</span>
                <span>Previous</span>
                <span>New</span>
                <span>Expression</span>
              </div>
              {changes.map((change) => (
                <div key={change.variable} className="matrix-unit-meta-dialog-row mirrored-equation-unit-summary-row">
                  <span className="matrix-unit-meta-dialog-variable">{change.variable}</span>
                  <span>{formatUnitMetaLabel(change.previous)}</span>
                  <span>{formatUnitMetaLabel(change.proposed)}</span>
                  <span className="matrix-unit-meta-dialog-sources">{change.expression}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button onClick={onClose} type="button">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
