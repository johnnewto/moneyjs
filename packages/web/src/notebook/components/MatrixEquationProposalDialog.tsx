import { useEffect, useMemo, useState } from "react";

import type { ProposedMatrixEquationUpdate } from "../matrixAccountSumRow";

export function MatrixEquationProposalDialog({
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
  proposals: ProposedMatrixEquationUpdate[];
  selectedVariables: Set<string>;
  onApply(updates: ProposedMatrixEquationUpdate[]): void;
  onCancel(): void;
  onSelectionChange(nextSelection: Set<string>): void;
}) {
  const [selection, setSelection] = useState<Set<string>>(selectedVariables);
  const [draftExpressions, setDraftExpressions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setSelection(new Set(selectedVariables));
      setDraftExpressions(
        Object.fromEntries(proposals.map((proposal) => [proposal.variable, proposal.proposed.expression]))
      );
    }
  }, [isOpen, proposals, selectedVariables]);

  const selectedCount = useMemo(
    () => proposals.filter((proposal) => selection.has(proposal.variable)).length,
    [proposals, selection]
  );

  const canApply = useMemo(() => {
    if (selectedCount === 0) {
      return false;
    }

    return proposals
      .filter((proposal) => selection.has(proposal.variable))
      .every((proposal) => draftExpressions[proposal.variable]?.trim());
  }, [draftExpressions, proposals, selectedCount, selection]);

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

  function updateDraftExpression(variable: string, expression: string): void {
    setDraftExpressions((current) => ({
      ...current,
      [variable]: expression
    }));
  }

  function handleApply(): void {
    const updates = proposals
      .filter((proposal) => selection.has(proposal.variable))
      .map((proposal) => {
        const expression = draftExpressions[proposal.variable]?.trim() ?? proposal.proposed.expression;
        return {
          ...proposal,
          proposed: {
            ...proposal.proposed,
            expression
          }
        };
      })
      .filter((proposal) => proposal.proposed.expression.trim());

    if (updates.length === 0) {
      return;
    }

    onApply(updates);
  }

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onCancel}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog matrix-unit-meta-dialog matrix-equation-proposal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Set accumulation equations from matrix"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Set accumulation equations from matrix</h3>
        <p>
          Add or update model accumulation equations using stock annotations (<strong>Mh</strong>,{" "}
          <strong>d(Mh)</strong>, and similar) in the Sum row of <strong>{matrixTitle}</strong>.
        </p>
        <ul className="notebook-help-list matrix-unit-meta-dialog-explainer">
          <li>Each selected proposal uses the symbolic sum of that account column as the flow term.</li>
          <li>Proposed form: <strong>X&apos; + (column flows) * dt</strong>.</li>
          <li>Edit proposed expressions before applying.</li>
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
          <p className="matrix-unit-meta-dialog-empty">
            No Sum row <strong>d(stock)</strong> annotations found.
          </p>
        ) : (
          <div className="matrix-unit-meta-dialog-list" role="group" aria-label="Equation proposals">
            <div className="matrix-unit-meta-dialog-list-header" aria-hidden="true">
              <span />
              <span>Variable</span>
              <span>Current</span>
              <span>Proposed</span>
              <span>Source</span>
            </div>
            {proposals.map((proposal) => {
              const checkboxId = `matrix-equation-proposal-${proposal.variable}`;
              const expressionId = `matrix-equation-proposal-expression-${proposal.variable}`;
              const currentExpression = proposal.current?.expression?.trim();
              return (
                <div key={proposal.variable} className="matrix-unit-meta-dialog-row">
                  <input
                    checked={selection.has(proposal.variable)}
                    id={checkboxId}
                    type="checkbox"
                    onChange={(event) => toggleVariable(proposal.variable, event.target.checked)}
                  />
                  <label className="matrix-unit-meta-dialog-variable" htmlFor={checkboxId}>
                    {proposal.variable}
                    {proposal.action === "add" ? (
                      <span className="matrix-equation-proposal-action">Add</span>
                    ) : null}
                  </label>
                  <span className="matrix-equation-proposal-expression">
                    {currentExpression ? currentExpression : "—"}
                  </span>
                  <textarea
                    aria-label={`Proposed expression for ${proposal.variable}`}
                    className="matrix-equation-proposal-input"
                    id={expressionId}
                    rows={2}
                    spellCheck={false}
                    value={draftExpressions[proposal.variable] ?? proposal.proposed.expression}
                    onChange={(event) => updateDraftExpression(proposal.variable, event.target.value)}
                  />
                  <span className="matrix-unit-meta-dialog-sources">
                    {proposal.source}
                    {proposal.warning ? (
                      <span className="matrix-equation-proposal-warning">{proposal.warning}</span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={!canApply} onClick={handleApply} type="button">
            Apply {selectedCount} proposal{selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
