import { useEffect, useMemo, useState } from "react";

import { formatUnitText } from "../../lib/unitMeta";
import type { ProposedMatrixUnitUpdate } from "../matrixUnitMetadataSync";

function formatUnitMetaLabel(unitMeta: ProposedMatrixUnitUpdate["proposed"] | undefined): string {
  if (!unitMeta) {
    return "—";
  }

  const unitLabel = formatUnitText(unitMeta) ?? "—";
  const stockFlowLabel = unitMeta.stockFlow ?? "unset";
  return `${stockFlowLabel} · ${unitLabel}`;
}

export function MatrixUnitMetaDialog({
  isOpen,
  matrixTitle,
  proposals,
  selectedVariables,
  onApply,
  onCancel,
  onSelectionChange
}: {
  isOpen: boolean;
  matrixTitle: string;
  proposals: ProposedMatrixUnitUpdate[];
  selectedVariables: Set<string>;
  onApply(): void;
  onCancel(): void;
  onSelectionChange(nextSelection: Set<string>): void;
}) {
  const [selection, setSelection] = useState<Set<string>>(selectedVariables);

  useEffect(() => {
    if (isOpen) {
      setSelection(new Set(selectedVariables));
    }
  }, [isOpen, selectedVariables]);

  const selectedCount = useMemo(
    () => proposals.filter((proposal) => selection.has(proposal.variable)).length,
    [proposals, selection]
  );

  if (!isOpen) {
    return null;
  }

  function updateSelection(nextSelection: Set<string>): void {
    setSelection(nextSelection);
    onSelectionChange(nextSelection);
  }

  function toggleVariable(variable: string, checked: boolean): void {
    const nextSelection = new Set(selection);
    if (checked) {
      nextSelection.add(variable);
    } else {
      nextSelection.delete(variable);
    }
    updateSelection(nextSelection);
  }

  function selectAll(): void {
    updateSelection(new Set(proposals.map((proposal) => proposal.variable)));
  }

  function selectNone(): void {
    updateSelection(new Set());
  }

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onCancel}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog matrix-unit-meta-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Set variable unit metadata from matrix"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Set variable unit metadata from matrix</h3>
        <p>
          Update model variable units using single-variable references from <strong>{matrixTitle}</strong>.
        </p>
        <ul className="notebook-help-list matrix-unit-meta-dialog-explainer">
          <li>Balance sheet → stock + $/items, $/kg, $/J, $/pp, or $/°C on referenced variables.</li>
          <li>Transaction flow → flow + $/yr, items/yr, kg/yr, J/yr, pp/yr, or °C/yr on plain/lag refs.</li>
          <li>
            <strong>d(Name)</strong> cells validate as flow-sized terms, but <strong>Name</strong> stays stock.
          </li>
        </ul>
        <div className="matrix-unit-meta-dialog-toolbar">
          <button className="secondary-button" onClick={selectAll} type="button">
            Select all
          </button>
          <button className="secondary-button" onClick={selectNone} type="button">
            Select none
          </button>
        </div>
        {proposals.length === 0 ? (
          <p className="matrix-unit-meta-dialog-empty">No single-variable matrix entries found.</p>
        ) : (
          <div className="matrix-unit-meta-dialog-list" role="group" aria-label="Variable unit updates">
            <div className="matrix-unit-meta-dialog-list-header" aria-hidden="true">
              <span />
              <span>Variable</span>
              <span>Proposed</span>
              <span>Current</span>
              <span>Source</span>
            </div>
            {proposals.map((proposal) => {
              const inputId = `matrix-unit-meta-${proposal.variable}`;
              return (
                <label key={proposal.variable} className="matrix-unit-meta-dialog-row" htmlFor={inputId}>
                  <input
                    checked={selection.has(proposal.variable)}
                    id={inputId}
                    type="checkbox"
                    onChange={(event) => toggleVariable(proposal.variable, event.target.checked)}
                  />
                  <span className="matrix-unit-meta-dialog-variable">{proposal.variable}</span>
                  <span>{formatUnitMetaLabel(proposal.proposed)}</span>
                  <span>{formatUnitMetaLabel(proposal.current)}</span>
                  <span className="matrix-unit-meta-dialog-sources">
                    {proposal.sources.slice(0, 2).join("; ")}
                    {proposal.sources.length > 2 ? ` (+${proposal.sources.length - 2} more)` : ""}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={selectedCount === 0} onClick={onApply} type="button">
            Apply {selectedCount} update{selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
