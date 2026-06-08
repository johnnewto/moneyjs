import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { BlockConvergenceReport, InitialValueProbeResult } from "@sfcr/core";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { documentHighlightClassName } from "../lib/variableHighlight";
import { VariableMathLabel } from "./VariableMathLabel";
import { useFloatingPanelPosition } from "../hooks/useFloatingPanelPosition";
import {
  blockConvergenceStatusClass,
  describeBlockSeedSource,
  formatBlockConvergenceStatus,
  formatBlockSeedSource,
  listBlockVariableValues,
  shouldShowBlockFinalValues
} from "../lib/blockConvergenceFormat";

const FLOATING_PANEL_STORAGE_KEY = "sfcr.block-convergence-panel-position";

export interface BlockConvergencePanelProps {
  label: string;
  period: number;
  report: BlockConvergenceReport | null;
  probeResults?: InitialValueProbeResult[] | null;
  isComputing?: boolean;
  errorMessage?: string | null;
  highlightedVariable?: string | null;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
  onVariableInspect?(variableName: string): void;
  onClose(): void;
}

export function BlockConvergencePanel({
  label,
  period,
  report,
  probeResults = null,
  isComputing = false,
  errorMessage = null,
  highlightedVariable = null,
  variableDescriptions,
  variableUnitMetadata,
  onVariableInspect,
  onClose
}: BlockConvergencePanelProps) {
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

  return createPortal(
    <div
      className="stability-raw-floating-panel block-convergence-panel"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Block convergence analysis"
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Block convergence</div>
          <h3>{label}</h3>
          <p className="stability-raw-dialog-subtitle">Period {period}</p>
        </div>
        <button type="button" className="stability-raw-dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="stability-raw-dialog-body">
        {isComputing ? <p className="inspector-empty-note">Computing block convergence…</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        {probeResults && probeResults.length > 1 ? (
          <section className="stability-inspector-section">
            <h4 className="stability-inspector-subheading">Initial value candidates</h4>
            <ul className="stability-participation-list">
              {probeResults.map((entry) => (
                <li key={entry.label}>
                  <span>{entry.label}</span>
                  <span
                    className={`stability-classification-pill ${entry.allCyclicConverged ? "is-stable" : "is-unstable"}`}
                  >
                    {entry.allCyclicConverged ? "All cyclic blocks converged" : "Cyclic block failed"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {report ? (
          <section className="stability-inspector-section">
            <p className="stability-inspector-facts">
              Solver {report.solverMethod} · tolerance {report.tolerance} · max {report.maxIterations}{" "}
              iterations
            </p>
            <ul className="stability-participation-list">
              {report.blocks.map((entry) => (
                <li key={entry.block.id}>
                  <div>
                    <strong>
                      Block {entry.block.id}
                      {entry.block.cyclic ? " (cyclic)" : ""}
                    </strong>
                    {onVariableInspect ? (
                      <div className="block-convergence-variable-list">
                        {entry.block.equationNames.map((name) => (
                          <BlockConvergenceVariableButton
                            key={`${entry.block.id}-summary-${name}`}
                            highlightedVariable={highlightedVariable}
                            name={name}
                            onVariableInspect={onVariableInspect}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="stability-inspector-model-label">
                        {entry.block.equationNames.join(", ")}
                      </div>
                    )}
                  </div>
                  <span
                    className={`stability-classification-pill ${blockConvergenceStatusClass(entry.status)}`}
                  >
                    {formatBlockConvergenceStatus(entry.status)}
                  </span>
                </li>
              ))}
            </ul>
            {report.blocks
              .filter((entry) => entry.block.cyclic)
              .map((entry) => {
                const seedNote = describeBlockSeedSource(entry.seedSource);
                const startingValues = listBlockVariableValues(
                  entry.block.equationNames,
                  entry.initialGuess
                );
                const showFinalValues = shouldShowBlockFinalValues(
                  entry.status,
                  entry.initialGuess,
                  entry.finalValues
                );
                const finalValues =
                  showFinalValues && entry.finalValues
                    ? listBlockVariableValues(entry.block.equationNames, entry.finalValues)
                    : null;

                return (
                  <div key={`detail-${entry.block.id}`} className="stability-mode-block">
                    <h4 className="stability-inspector-subheading">
                      Block {entry.block.id} detail
                    </h4>
                    <p className="stability-inspector-facts">
                      Seed: {formatBlockSeedSource(entry.seedSource)} · iterations{" "}
                      {entry.iterationsUsed} · residual {entry.residualNormBefore.toExponential(2)} →{" "}
                      {entry.residualNormAfter.toExponential(2)}
                    </p>
                    {seedNote ? <p className="stability-inspector-note">{seedNote}</p> : null}
                    <p className="stability-participation-caption">Starting guess</p>
                    <ul className="stability-participation-list">
                      {startingValues.map((row) => (
                        <li key={`${entry.block.id}-seed-${row.name}`}>
                          <BlockConvergenceVariableButton
                            highlightedVariable={highlightedVariable}
                            name={row.name}
                            onVariableInspect={onVariableInspect}
                            variableDescriptions={variableDescriptions}
                            variableUnitMetadata={variableUnitMetadata}
                          />
                          <span className="stability-participation-weight">{row.value}</span>
                        </li>
                      ))}
                    </ul>
                    {finalValues ? (
                      <>
                        <p className="stability-participation-caption">Converged values</p>
                        <ul className="stability-participation-list">
                          {finalValues.map((row) => (
                            <li key={`${entry.block.id}-final-${row.name}`}>
                              <BlockConvergenceVariableButton
                                highlightedVariable={highlightedVariable}
                                name={row.name}
                                onVariableInspect={onVariableInspect}
                                variableDescriptions={variableDescriptions}
                                variableUnitMetadata={variableUnitMetadata}
                              />
                              <span className="stability-participation-weight">{row.value}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {entry.jacobianAtStart?.singular ? (
                      <p className="stability-inspector-warning">
                        Jacobian is singular or ill-conditioned at the initial guess.
                      </p>
                    ) : null}
                  </div>
                );
              })}
          </section>
        ) : null}

        {!isComputing && !errorMessage && !report ? (
          <p className="inspector-empty-note">No block convergence results yet.</p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

function BlockConvergenceVariableButton({
  highlightedVariable,
  name,
  onVariableInspect,
  variableDescriptions
}: {
  highlightedVariable?: string | null;
  name: string;
  onVariableInspect?(variableName: string): void;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  if (!onVariableInspect) {
    return <span className="stability-participation-variable">{name}</span>;
  }

  const tokenClass = /^[A-Z]/.test(name)
    ? "formula-uppercase"
    : /^[a-z]/.test(name)
      ? "formula-lowercase"
      : "formula-default";

  return (
    <button
      type="button"
      aria-label={`Inspect variable ${name}`}
      className={documentHighlightClassName(
        name,
        highlightedVariable,
        `result-variable-button block-convergence-variable-button formula-token ${tokenClass} is-clickable`
      )}
      onClick={() => onVariableInspect(name)}
      title={variableDescriptions?.get(name)?.trim() || undefined}
    >
      <VariableMathLabel name={name} />
    </button>
  );
}
