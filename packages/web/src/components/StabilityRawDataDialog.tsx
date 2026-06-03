import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { SimulationResult } from "@sfcr/core";

import type { StabilityDisplayState } from "../hooks/useStabilityMetrics";
import { useFloatingPanelPosition } from "../hooks/useFloatingPanelPosition";
import {
  buildStabilityDeltaPropagationView,
  formatRelativeGain,
  STABILITY_DELTA_SHOCK_SOURCES,
  type StabilityDeltaShockSource
} from "../lib/stabilityDeltaPropagation";
import {
  buildStabilityRawDataViews,
  buildStabilityRawJson,
  buildStabilityRawMarkdown,
  formatRawComplexCell,
  formatRawMatrixCell,
  openStabilityRawDataWindow,
  type StabilityRawMatrixKey,
  type StabilityRawMatrixView
} from "../lib/stabilityRawData";
import { stabilityPeriodFromUiIndex } from "../lib/stabilityAtPeriod";

const FLOATING_PANEL_STORAGE_KEY = "sfcr.stability-raw-panel-position";
const STABILITY_RAW_DEBOUNCE_MS = 280;

export interface StabilityRawDataDialogProps {
  display: StabilityDisplayState;
  isComputing?: boolean;
  periodLabel: number;
  selectedPeriodIndex: number;
  runLabel?: string | null;
  simulationResult: SimulationResult | null;
  onClose(): void;
}

export function StabilityRawDataDialog({
  display,
  isComputing = false,
  periodLabel,
  selectedPeriodIndex,
  runLabel = null,
  simulationResult,
  onClose
}: StabilityRawDataDialogProps) {
  const analysis = display.analysis;
  const views = useMemo(
    () => (analysis ? buildStabilityRawDataViews(analysis) : null),
    [analysis]
  );
  const [activeTab, setActiveTab] = useState<StabilityRawMatrixKey>("T");
  const [shockSource, setShockSource] = useState<StabilityDeltaShockSource>("lag-increment");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const { position, dragHandleProps } = useFloatingPanelPosition(FLOATING_PANEL_STORAGE_KEY);

  const deltaPropagation = useMemo(() => {
    if (!simulationResult || !analysis) {
      return null;
    }
    return buildStabilityDeltaPropagationView(analysis, simulationResult, shockSource);
  }, [analysis, simulationResult, shockSource]);

  const analysisPeriodLabel = analysis ? analysis.period + 1 : null;
  const periodMismatch =
    analysis != null && analysis.period !== (stabilityPeriodFromUiIndex(selectedPeriodIndex) ?? -1);
  const canShowMatrices = analysis != null && views != null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!copyStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopyStatus(null), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copyStatus]);

  const activeView =
    views?.matrices.find((view) => view.key === activeTab) ?? views?.matrices[0];

  async function copyMarkdown(): Promise<void> {
    if (!views) {
      return;
    }
    const markdown = buildStabilityRawMarkdown(views, deltaPropagation);
    await copyText(markdown, "Markdown copied");
  }

  async function copyJson(): Promise<void> {
    if (!views || !analysis) {
      return;
    }
    const json = buildStabilityRawJson(views, analysis, deltaPropagation);
    await copyText(json, "JSON copied");
  }

  function openInAnotherWindow(): void {
    if (!views || !analysis) {
      return;
    }
    const opened = openStabilityRawDataWindow(views, analysis, periodLabel, deltaPropagation);
    if (!opened) {
      setCopyStatus("Pop-up blocked — allow pop-ups for this site");
    }
  }

  async function copyText(text: string, successMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(successMessage);
    } catch {
      setCopyStatus("Copy failed — check browser permissions");
    }
  }

  const panel = (
    <div
      className="stability-raw-floating-panel"
      role="dialog"
      aria-label="Transition matrix debug data"
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <h3>Transition matrix (debug)</h3>
          <p className="stability-raw-dialog-subtitle">
            {runLabel ? (
              <>
                Run: {runLabel}
                <br />
              </>
            ) : null}
            Scrubber period {periodLabel}
            {analysisPeriodLabel != null && periodLabel !== analysisPeriodLabel
              ? ` · matrices at period ${analysisPeriodLabel}`
              : null}
            {views ? (
              <>
                {" "}
                · {views.variableCount} endogenous variable{views.variableCount === 1 ? "" : "s"}
              </>
            ) : null}
          </p>
        </div>
        <button type="button" className="stability-raw-dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <p className="stability-raw-dialog-note">
        Follows the scrubber (auto-analyze, {STABILITY_RAW_DEBOUNCE_MS}ms debounce). Local linearization at
        each period; not a re-solved step.
      </p>

      <div className="stability-raw-dialog-scrubber-slot" aria-live="polite">
        {isComputing ? (
          <p className="stability-raw-dialog-status">
            Computing stability metrics for period {periodLabel}…
          </p>
        ) : periodMismatch && analysis ? (
          <p className="stability-raw-dialog-warning">
            Showing matrices from period {analysisPeriodLabel}; scrubber is at period {periodLabel}.
          </p>
        ) : (
          <p className="stability-raw-dialog-scrubber-slot-placeholder" aria-hidden="true">
            {"\u00a0"}
          </p>
        )}
      </div>

      {display.status === "initial-period" ? (
        <p className="stability-raw-dialog-warning">
          Move the scrubber to period 2 or later to compute transition matrices.
        </p>
      ) : null}

      {display.status === "error" ? (
        <p className="stability-raw-dialog-warning">{display.errorMessage ?? "Stability analysis failed."}</p>
      ) : null}

      {views?.largeModel ? (
        <p className="stability-raw-dialog-warning">
          Large state ({views.variableCount} variables). Tables may be slow to scroll; use Copy JSON for full export.
        </p>
      ) : null}

      {canShowMatrices ? (
        <>
          <div className="stability-raw-dialog-toolbar">
            <div className="stability-raw-dialog-tabs" role="tablist" aria-label="Raw stability data">
              {views.matrices.map((view) => (
                <button
                  key={view.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === view.key}
                  className={`stability-raw-dialog-tab${activeTab === view.key ? " is-active" : ""}`}
                  onClick={() => setActiveTab(view.key)}
                >
                  {tabShortLabel(view.key)}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "eigenvectors"}
                className={`stability-raw-dialog-tab${activeTab === "eigenvectors" ? " is-active" : ""}`}
                onClick={() => setActiveTab("eigenvectors")}
              >
                Eigenvectors
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "delta"}
                className={`stability-raw-dialog-tab${activeTab === "delta" ? " is-active" : ""}`}
                onClick={() => setActiveTab("delta")}
                disabled={!simulationResult}
                title={simulationResult ? undefined : "Run data required for linear step propagation"}
              >
                Linear step
              </button>
            </div>
            <div className="stability-raw-dialog-copy-actions">
              <button type="button" className="secondary-button" onClick={openInAnotherWindow}>
                Open in another window
              </button>
              <button type="button" className="secondary-button" onClick={() => void copyMarkdown()}>
                Copy markdown
              </button>
              <button type="button" className="secondary-button" onClick={() => void copyJson()}>
                Copy JSON
              </button>
              {copyStatus ? <span className="stability-raw-dialog-copy-status">{copyStatus}</span> : null}
            </div>
          </div>

          <div className="stability-raw-dialog-body">
            {activeTab === "delta" ? (
              <DeltaPropagationPanel
                deltaPropagation={deltaPropagation}
                shockSource={shockSource}
                onShockSourceChange={setShockSource}
                hasSimulationResult={simulationResult != null}
              />
            ) : activeTab === "eigenvectors" ? (
              <EigenvectorDebugPanel eigenmodes={views.eigenmodes} />
            ) : activeView ? (
              <MatrixDebugPanel view={activeView} />
            ) : null}
          </div>
        </>
      ) : !isComputing && display.status !== "initial-period" ? (
        <p className="inspector-empty-note">Waiting for stability analysis at period {periodLabel}…</p>
      ) : null}

      <footer className="stability-raw-dialog-footer">
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </footer>
    </div>
  );

  return createPortal(panel, document.body);
}

export const STABILITY_RAW_PANEL_DEBOUNCE_MS = STABILITY_RAW_DEBOUNCE_MS;

function tabShortLabel(key: StabilityRawMatrixKey): string {
  switch (key) {
    case "T":
      return "T";
    case "A0":
      return "A₀";
    case "A1":
      return "A₁";
    case "residual":
      return "F";
    case "eigenvectors":
      return "Eigenvectors";
    case "delta":
      return "Linear step";
  }
}

function DeltaPropagationPanel({
  deltaPropagation,
  shockSource,
  onShockSourceChange,
  hasSimulationResult
}: {
  deltaPropagation: ReturnType<typeof buildStabilityDeltaPropagationView>;
  shockSource: StabilityDeltaShockSource;
  onShockSourceChange(source: StabilityDeltaShockSource): void;
  hasSimulationResult: boolean;
}) {
  if (!hasSimulationResult) {
    return <p className="inspector-empty-note">Simulation series are required for linear step propagation.</p>;
  }

  if (!deltaPropagation) {
    return <p className="inspector-empty-note">Could not build operating-point values for this period.</p>;
  }

  return (
    <section className="stability-raw-matrix-panel">
      <h4 className="stability-raw-panel-title">Linear one-step response</h4>
      <p className="stability-inspector-note">{deltaPropagation.shockLabel}</p>
      <div className="stability-raw-shock-select" role="group" aria-label="Lag shock source">
        {STABILITY_DELTA_SHOCK_SOURCES.map((option) => {
          const disabled =
            option.disabledWhen === "no-lag-increment" && !deltaPropagation.canUseLagIncrement;
          return (
            <button
              key={option.id}
              type="button"
              className={`stability-raw-dialog-tab${shockSource === option.id ? " is-active" : ""}`}
              disabled={disabled}
              title={disabled ? "Requires period 3 or later on the scrubber (two prior converged steps)" : undefined}
              onClick={() => onShockSourceChange(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="stability-raw-table-scroll">
        <table className="stability-inspector-table stability-raw-matrix-table">
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Δxₜ₋₁</th>
              <th scope="col">Δxₜ (TΔ)</th>
              <th scope="col">Gain (linear)</th>
              <th scope="col">xₜ*</th>
              <th scope="col">xₜ linear</th>
              <th scope="col">Δx path</th>
              <th scope="col">Gain (path)</th>
            </tr>
          </thead>
          <tbody>
            {deltaPropagation.rows.map((row) => (
              <tr key={row.variable}>
                <th scope="row">{row.variable}</th>
                <td>{formatRawMatrixCell(row.deltaLag)}</td>
                <td>{formatRawMatrixCell(row.deltaCurrent)}</td>
                <td>{formatRelativeGain(row.linearGain)}</td>
                <td>{formatRawMatrixCell(row.xStar)}</td>
                <td>{formatRawMatrixCell(row.xLinear)}</td>
                <td>{formatRawMatrixCell(row.pathDelta)}</td>
                <td>{formatRelativeGain(row.pathGain)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="stability-inspector-note">
        xₜ* is the solved value at the scrubbed period. xₜ linear = xₜ* + Δxₜ. Gain (linear) = xₜ linear / xₜ*;
        Gain (path) = xₜ* / xₜ₋₁.
      </p>
    </section>
  );
}

function MatrixDebugPanel({ view }: { view: StabilityRawMatrixView }) {
  return (
    <section className="stability-raw-matrix-panel">
      <h4 className="stability-raw-panel-title">{view.label}</h4>
      {view.vector ? (
        <div className="stability-raw-table-scroll">
          <table className="stability-inspector-table stability-raw-matrix-table">
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Residual</th>
              </tr>
            </thead>
            <tbody>
              {view.variables.map((variable, index) => (
                <tr key={variable}>
                  <th scope="row">{variable}</th>
                  <td>{formatRawMatrixCell(view.vector?.[index] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view.matrix ? (
        <div className="stability-raw-table-scroll">
          <table className="stability-inspector-table stability-raw-matrix-table">
            <thead>
              <tr>
                <th scope="col" className="stability-raw-corner-cell" />
                {view.variables.map((variable) => (
                  <th key={variable} scope="col" className="stability-raw-column-header">
                    {variable}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.matrix.map((row, rowIndex) => (
                <tr key={view.variables[rowIndex] ?? rowIndex}>
                  <th scope="row" className="stability-raw-row-header">
                    {view.variables[rowIndex]}
                  </th>
                  {row.map((value, columnIndex) => (
                    <td key={`${rowIndex}:${columnIndex}`}>{formatRawMatrixCell(value)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="inspector-empty-note">No data for this view.</p>
      )}
    </section>
  );
}

function EigenvectorDebugPanel({
  eigenmodes
}: {
  eigenmodes: NonNullable<ReturnType<typeof buildStabilityRawDataViews>>["eigenmodes"];
}) {
  if (eigenmodes.length === 0) {
    return <p className="inspector-empty-note">No eigenvector data available.</p>;
  }

  return (
    <div className="stability-raw-eigenmodes">
      {eigenmodes.map((mode) => (
        <section key={`${mode.label}:${mode.eigenvalueLabel}`} className="stability-raw-eigenmode-section">
          <h4 className="stability-raw-panel-title">
            {mode.label}
            <span className="stability-raw-eigenvalue-inline">λ = {mode.eigenvalueLabel}</span>
            <span
              className={`stability-eigenpair-quality${mode.reliable ? " is-reliable" : " is-unreliable"}`}
            >
              {mode.reliable ? "Reliable" : "Unreliable"}
            </span>
          </h4>
          <div className="stability-raw-table-scroll">
            <table className="stability-inspector-table stability-raw-matrix-table">
              <thead>
                <tr>
                  <th scope="col">Variable</th>
                  <th scope="col">Component</th>
                  <th scope="col">|v|</th>
                  <th scope="col">Weight</th>
                </tr>
              </thead>
              <tbody>
                {mode.rows.map((row) => (
                  <tr key={row.variable}>
                    <th scope="row">{row.variable}</th>
                    <td>{formatRawComplexCell({ re: row.re, im: row.im })}</td>
                    <td>{formatRawMatrixCell(row.magnitude)}</td>
                    <td>{formatRawMatrixCell(row.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
