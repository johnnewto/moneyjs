import { useMemo, useState } from "react";

import {
  buildModeTransitionGraph,
  buildTransitionGraph,
  buildTransitionEffectsForVariable,
  buildTransitionLoopsThroughVariable,
  DEFAULT_MAX_EDGES,
  formatTransitionLoopPath,
  type EigenmodeAnalysis,
  type Eigenvalue,
  type TransitionEdge
} from "@sfcr/core";

import type { SimulationResult } from "@sfcr/core";

import type { StabilityDisplayState } from "../hooks/useStabilityMetrics";
import {
  formatEigenvalue,
  formatSpectralRadius,
  formatStabilityClassification,
  formatTransitionLoopGain,
  stabilityPeriodFromUiIndex,
  stabilityResidualWarning
} from "../lib/stabilityAtPeriod";

export interface StabilitySummaryProps {
  display: StabilityDisplayState;
  isComputing?: boolean;
  selectedPeriodIndex: number;
  selectedVariableName?: string | null;
  simulationResult?: SimulationResult | null;
  onRequestAnalysis?: () => void;
  onClearAnalysis?: () => void;
  onOpenRawData?: () => void;
}

export function StabilityInspectorSection({
  display,
  isComputing = false,
  selectedPeriodIndex,
  selectedVariableName = null,
  simulationResult = null,
  onRequestAnalysis,
  onClearAnalysis,
  onOpenRawData
}: StabilitySummaryProps) {
  const periodLabel = selectedPeriodIndex + 1;
  const canAnalyze = stabilityPeriodFromUiIndex(selectedPeriodIndex) != null;

  if (display.status === "no-run") {
    return (
      <section className="inspector-section stability-inspector-section">
        <h3>Local stability</h3>
        <p className="inspector-empty-note">Run the model to evaluate local stability at the scrubbed period.</p>
      </section>
    );
  }

  if (display.status === "idle") {
    return (
      <section className="inspector-section stability-inspector-section">
        <h3>Local stability</h3>
        {display.modelLabel ? (
          <p className="stability-inspector-model-label">Model: {display.modelLabel}</p>
        ) : null}
        <p className="inspector-empty-note">
          Transition-matrix analysis at period {periodLabel}. Large models can take several seconds.
        </p>
        <StabilityInspectorActions
          analyzeLabel={`Analyze at period ${periodLabel}`}
          canAnalyze={canAnalyze}
          disabledReason={
            canAnalyze
              ? undefined
              : "Move the scrubber to period 2 or later (a converged step with a lagged state)."
          }
          onRequestAnalysis={onRequestAnalysis}
        />
        <StabilityRawDataOpenButton canOpen={canAnalyze} onOpen={onOpenRawData} />
      </section>
    );
  }

  if (display.status === "initial-period") {
    return (
      <section className="inspector-section stability-inspector-section">
        <h3>Local stability</h3>
        <p className="inspector-empty-note">
          Period {periodLabel} is the initial condition. Move the scrubber to period 2 or later for transition-matrix
          analysis.
        </p>
        <StabilityInspectorActions
          analyzeLabel={`Analyze at period ${periodLabel}`}
          canAnalyze={false}
          disabledReason="Local stability requires period 2 or later."
          onRequestAnalysis={onRequestAnalysis}
        />
      </section>
    );
  }

  if (display.status === "computing" || isComputing) {
    return (
      <section className="inspector-section stability-inspector-section">
        <StabilityInspectorHeading
          periodLabel={periodLabel}
          onClearAnalysis={onClearAnalysis}
        />
        <p className="inspector-empty-note">Computing stability metrics…</p>
        <StabilityRawDataOpenButton canOpen={canAnalyze} onOpen={onOpenRawData} />
      </section>
    );
  }

  if (display.status === "error") {
    return (
      <section className="inspector-section stability-inspector-section">
        <StabilityInspectorHeading
          periodLabel={periodLabel}
          onClearAnalysis={onClearAnalysis}
        />
        <p className="inspector-empty-note">{display.errorMessage ?? "Stability analysis failed."}</p>
        <StabilityInspectorActions
          analyzeLabel="Retry analysis"
          canAnalyze={canAnalyze}
          disabledReason={
            canAnalyze
              ? undefined
              : "Move the scrubber to period 2 or later (a converged step with a lagged state)."
          }
          onRequestAnalysis={onRequestAnalysis}
        />
        <StabilityRawDataOpenButton canOpen={canAnalyze} onOpen={onOpenRawData} />
      </section>
    );
  }

  const analysis = display.analysis;
  if (!analysis) {
    return null;
  }

  const residualWarning = stabilityResidualWarning(analysis);
  const topEigenvalues = analysis.eigenvalues.slice(0, 8);

  return (
    <StabilityInspectorReadySection
      analysis={analysis}
      periodLabel={periodLabel}
      display={display}
      residualWarning={residualWarning}
      topEigenvalues={topEigenvalues}
      selectedVariableName={selectedVariableName}
      simulationResult={simulationResult}
      onClearAnalysis={onClearAnalysis}
      onOpenRawData={onOpenRawData}
    />
  );
}

function StabilityRawDataOpenButton({
  canOpen = true,
  onOpen
}: {
  canOpen?: boolean;
  onOpen?: () => void;
}) {
  if (!onOpen) {
    return null;
  }

  return (
    <div className="stability-inspector-debug-actions">
      <button
        type="button"
        className="secondary-button"
        disabled={!canOpen}
        title={canOpen ? undefined : "Move the scrubber to period 2 or later."}
        onClick={onOpen}
      >
        View T, Jacobians, eigenvectors…
      </button>
    </div>
  );
}

function StabilityInspectorReadySection({
  analysis,
  periodLabel,
  display,
  residualWarning,
  topEigenvalues,
  selectedVariableName,
  simulationResult,
  onClearAnalysis,
  onOpenRawData
}: {
  analysis: NonNullable<StabilityDisplayState["analysis"]>;
  periodLabel: number;
  display: StabilityDisplayState;
  residualWarning: string | null;
  topEigenvalues: Eigenvalue[];
  selectedVariableName: string | null;
  simulationResult?: SimulationResult | null;
  onClearAnalysis?: () => void;
  onOpenRawData?: () => void;
}) {
  return (
    <section className="inspector-section stability-inspector-section">
      <StabilityInspectorHeading periodLabel={periodLabel} onClearAnalysis={onClearAnalysis} />
      {display.modelLabel ? (
        <p className="stability-inspector-model-label">Model: {display.modelLabel}</p>
      ) : null}
      <dl className="inspector-facts stability-inspector-facts">
        <div>
          <dt>Classification</dt>
          <dd>
            <span className={`stability-classification-pill is-${analysis.classification}`}>
              {formatStabilityClassification(analysis.classification)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Spectral radius</dt>
          <dd>{formatSpectralRadius(analysis.spectralRadius)}</dd>
        </div>
        <div>
          <dt>Equation residual norm</dt>
          <dd>{analysis.residualNorm.toExponential(2)}</dd>
        </div>
      </dl>
      {residualWarning ? <p className="stability-inspector-warning">{residualWarning}</p> : null}

      <StabilityRawDataOpenButton canOpen onOpen={onOpenRawData} />

      <EigenmodeInspectorBlock title="Dominant mode" mode={analysis.dominantMode} />

      {analysis.nearUnitRootModes.length > 0 ? (
        <>
          <h4 className="stability-inspector-subheading">Near unit-root modes (|λ| ≈ 1)</h4>
          {analysis.nearUnitRootModes.map((mode, index) => (
            <EigenmodeInspectorBlock
              key={`${mode.eigenvalue.re}:${mode.eigenvalue.im}:${index}`}
              title={`Mode λ ≈ ${formatEigenvalue(mode.eigenvalue.re, mode.eigenvalue.im)}`}
              mode={mode}
            />
          ))}
        </>
      ) : null}

      {topEigenvalues.length > 0 ? (
        <>
          <h4 className="stability-inspector-subheading">Eigenvalues (|λ| sorted)</h4>
          <ul className="stability-eigenvalue-list">
            {topEigenvalues.map((eigenvalue, index) => (
              <li key={`${eigenvalue.re}:${eigenvalue.im}:${index}`}>
                <span>{formatEigenvalue(eigenvalue.re, eigenvalue.im)}</span>
                <span className="stability-eigenvalue-abs">|λ| = {eigenvalue.abs.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {selectedVariableName ? (
        <TransitionLoopsInspectorBlock
          analysis={analysis}
          selectedVariableName={selectedVariableName}
        />
      ) : null}

      {selectedVariableName ? (
        <TransitionVariableEffectsInspectorBlock
          analysis={analysis}
          selectedVariableName={selectedVariableName}
        />
      ) : null}

      <TransitionGraphInspectorBlock analysis={analysis} />
    </section>
  );
}

type TransitionGraphView = "all" | "dominant";

const TRANSITION_EDGE_DISPLAY_LIMIT = 20;

function TransitionGraphInspectorBlock({
  analysis
}: {
  analysis: NonNullable<StabilityDisplayState["analysis"]>;
}) {
  const [view, setView] = useState<TransitionGraphView>("all");
  const [showAllEdges, setShowAllEdges] = useState(false);

  const graphEdges = useMemo(() => {
    const graphOptions = showAllEdges
      ? { maxEdges: Number.POSITIVE_INFINITY }
      : { maxEdges: DEFAULT_MAX_EDGES };

    return view === "dominant"
      ? buildModeTransitionGraph(analysis, analysis.dominantMode, graphOptions)
      : buildTransitionGraph(analysis, graphOptions);
  }, [analysis, showAllEdges, view]);

  const displayedEdges = showAllEdges
    ? graphEdges
    : graphEdges.slice(0, TRANSITION_EDGE_DISPLAY_LIMIT);
  const hiddenCount = showAllEdges
    ? 0
    : Math.max(0, graphEdges.length - TRANSITION_EDGE_DISPLAY_LIMIT);

  function selectView(nextView: TransitionGraphView): void {
    setView(nextView);
    setShowAllEdges(false);
  }

  return (
    <article className="stability-mode-block">
      <h4 className="stability-inspector-subheading">Solved transition effects</h4>
      <p className="stability-inspector-note">
        Local solved effects among endogenous variables (not the structural equation dependency graph).
      </p>
      <div className="stability-graph-view-toggle" role="tablist" aria-label="Transition graph view">
        <button
          type="button"
          className={`stability-graph-view-button${view === "all" ? " is-active" : ""}`}
          aria-selected={view === "all"}
          onClick={() => selectView("all")}
        >
          All edges
        </button>
        <button
          type="button"
          className={`stability-graph-view-button${view === "dominant" ? " is-active" : ""}`}
          aria-selected={view === "dominant"}
          onClick={() => selectView("dominant")}
        >
          Dominant mode
        </button>
      </div>
      {graphEdges.length === 0 ? (
        <p className="inspector-empty-note">No transition edges above the weight threshold.</p>
      ) : (
        <>
          <table className="stability-inspector-table">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Weight</th>
                <th scope="col">|weight|</th>
              </tr>
            </thead>
            <tbody>
              {displayedEdges.map((edge) => (
                <tr key={`${edge.from}:${edge.to}:${edge.weight}`}>
                  <td>{edge.from}</td>
                  <td>{edge.to}</td>
                  <td>{edge.weight.toFixed(3)}</td>
                  <td>{Math.abs(edge.weight).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hiddenCount > 0 ? (
            <div className="stability-inspector-note-row">
              <p className="stability-inspector-note">
                {hiddenCount} more edge{hiddenCount === 1 ? "" : "s"} hidden by display limit.
              </p>
              <button
                type="button"
                className="stability-show-all-button"
                onClick={() => setShowAllEdges(true)}
              >
                Show all ({graphEdges.length})
              </button>
            </div>
          ) : null}
          {showAllEdges && graphEdges.length > TRANSITION_EDGE_DISPLAY_LIMIT ? (
            <button
              type="button"
              className="stability-show-all-button"
              onClick={() => setShowAllEdges(false)}
            >
              Show fewer
            </button>
          ) : null}
        </>
      )}
    </article>
  );
}

const TRANSITION_LOOP_DISPLAY_LIMIT = 20;

const TRANSITION_EFFECT_DISPLAY_LIMIT = 20;

function TransitionVariableEffectsInspectorBlock({
  analysis,
  selectedVariableName
}: {
  analysis: NonNullable<StabilityDisplayState["analysis"]>;
  selectedVariableName: string;
}) {
  const [showAllIncoming, setShowAllIncoming] = useState(false);
  const [showAllOutgoing, setShowAllOutgoing] = useState(false);

  const effects = useMemo(
    () => buildTransitionEffectsForVariable(analysis, selectedVariableName),
    [analysis, selectedVariableName]
  );

  return (
    <article className="stability-mode-block">
      <h4 className="stability-inspector-subheading">Solved effects on {selectedVariableName}</h4>
      <p className="stability-inspector-note">
        One-step local coupling at the scrubbed period. Incoming: lagged drivers of {selectedVariableName};
        outgoing: how lagged {selectedVariableName} moves other variables.
      </p>
      {!effects.inTransitionState ? (
        <p className="inspector-empty-note">
          {selectedVariableName} is not an endogenous equation variable in the local transition state.
        </p>
      ) : (
        <>
          <TransitionEffectTable
            caption={`Into ${selectedVariableName} (t−1 → t)`}
            columnLabel="From (t−1)"
            edges={effects.incoming}
            emptyLabel={`No incoming solved effects on ${selectedVariableName} above the weight threshold.`}
            resolveLabel={(edge) => edge.from}
            showAll={showAllIncoming}
            onShowAll={() => setShowAllIncoming(true)}
            onShowFewer={() => setShowAllIncoming(false)}
          />
          <TransitionEffectTable
            caption={`Out of ${selectedVariableName} (t−1 → t)`}
            columnLabel="To (t)"
            edges={effects.outgoing}
            emptyLabel={`No outgoing solved effects from ${selectedVariableName} above the weight threshold.`}
            resolveLabel={(edge) => edge.to}
            showAll={showAllOutgoing}
            onShowAll={() => setShowAllOutgoing(true)}
            onShowFewer={() => setShowAllOutgoing(false)}
          />
        </>
      )}
    </article>
  );
}

function TransitionEffectTable({
  caption,
  columnLabel,
  edges,
  emptyLabel,
  resolveLabel,
  showAll,
  onShowAll,
  onShowFewer
}: {
  caption: string;
  columnLabel: string;
  edges: TransitionEdge[];
  emptyLabel: string;
  resolveLabel(edge: TransitionEdge): string;
  showAll: boolean;
  onShowAll(): void;
  onShowFewer(): void;
}) {
  const displayedEdges = showAll ? edges : edges.slice(0, TRANSITION_EFFECT_DISPLAY_LIMIT);
  const hiddenCount = showAll ? 0 : Math.max(0, edges.length - TRANSITION_EFFECT_DISPLAY_LIMIT);

  return (
    <section className="stability-variable-effect-section">
      <h5 className="stability-variable-effect-caption">{caption}</h5>
      {edges.length === 0 ? (
        <p className="inspector-empty-note">{emptyLabel}</p>
      ) : (
        <>
          <table className="stability-inspector-table">
            <thead>
              <tr>
                <th scope="col">{columnLabel}</th>
                <th scope="col">Weight</th>
                <th scope="col">|weight|</th>
              </tr>
            </thead>
            <tbody>
              {displayedEdges.map((edge) => (
                <tr key={`${edge.from}:${edge.to}:${edge.weight}`}>
                  <td>{resolveLabel(edge)}</td>
                  <td>{edge.weight.toFixed(4)}</td>
                  <td>{Math.abs(edge.weight).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hiddenCount > 0 ? (
            <div className="stability-inspector-note-row">
              <p className="stability-inspector-note">
                {hiddenCount} more edge{hiddenCount === 1 ? "" : "s"} hidden by display limit.
              </p>
              <button type="button" className="stability-show-all-button" onClick={onShowAll}>
                Show all ({edges.length})
              </button>
            </div>
          ) : null}
          {showAll && edges.length > TRANSITION_EFFECT_DISPLAY_LIMIT ? (
            <button type="button" className="stability-show-all-button" onClick={onShowFewer}>
              Show fewer
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function TransitionLoopsInspectorBlock({
  analysis,
  selectedVariableName
}: {
  analysis: NonNullable<StabilityDisplayState["analysis"]>;
  selectedVariableName: string;
}) {
  const [showAllLoops, setShowAllLoops] = useState(false);

  const loopsResult = useMemo(
    () => buildTransitionLoopsThroughVariable(analysis, selectedVariableName),
    [analysis, selectedVariableName]
  );

  const displayedLoops = showAllLoops
    ? loopsResult.loops
    : loopsResult.loops.slice(0, TRANSITION_LOOP_DISPLAY_LIMIT);
  const hiddenCount = showAllLoops
    ? 0
    : Math.max(0, loopsResult.loops.length - TRANSITION_LOOP_DISPLAY_LIMIT);

  return (
    <article className="stability-mode-block">
      <h4 className="stability-inspector-subheading">Transition loops through {selectedVariableName}</h4>
      <p className="stability-inspector-note">
        Closed solved-effect paths that include {selectedVariableName}. Gain is the product of edge weights
        along the loop.
      </p>
      {!loopsResult.inTransitionState ? (
        <p className="inspector-empty-note">
          {selectedVariableName} is not an endogenous equation variable in the local transition state.
        </p>
      ) : loopsResult.loops.length === 0 ? (
        <p className="inspector-empty-note">
          No transition loops through {selectedVariableName} above the weight threshold.
        </p>
      ) : (
        <>
          <table className="stability-inspector-table">
            <thead>
              <tr>
                <th scope="col">Loop</th>
                <th scope="col">Gain</th>
                <th scope="col">|gain|</th>
              </tr>
            </thead>
            <tbody>
              {displayedLoops.map((loop) => (
                <tr key={formatTransitionLoopPath(loop)}>
                  <td>{formatTransitionLoopPath(loop)}</td>
                  <td>{formatTransitionLoopGain(loop.gain)}</td>
                  <td>{formatTransitionLoopGain(loop.absGain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loopsResult.truncated ? (
            <p className="stability-inspector-note">Loop search was truncated; raise limits to see more.</p>
          ) : null}
          {hiddenCount > 0 ? (
            <div className="stability-inspector-note-row">
              <p className="stability-inspector-note">
                {hiddenCount} more loop{hiddenCount === 1 ? "" : "s"} hidden by display limit.
              </p>
              <button
                type="button"
                className="stability-show-all-button"
                onClick={() => setShowAllLoops(true)}
              >
                Show all ({loopsResult.loops.length})
              </button>
            </div>
          ) : null}
          {showAllLoops && loopsResult.loops.length > TRANSITION_LOOP_DISPLAY_LIMIT ? (
            <button
              type="button"
              className="stability-show-all-button"
              onClick={() => setShowAllLoops(false)}
            >
              Show fewer
            </button>
          ) : null}
        </>
      )}
    </article>
  );
}

function EigenmodeInspectorBlock({ title, mode }: { title: string; mode: EigenmodeAnalysis }) {
  return (
    <article className="stability-mode-block">
      <h4 className="stability-inspector-subheading">{title}</h4>
      <dl className="inspector-facts stability-inspector-facts">
        <div>
          <dt>Eigenvalue</dt>
          <dd>{formatEigenvalue(mode.eigenvalue.re, mode.eigenvalue.im)}</dd>
        </div>
        <div>
          <dt>|λ|</dt>
          <dd>{mode.eigenvalue.abs.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Eigenpair residual</dt>
          <dd>
            {mode.eigenpairResidualNorm.toExponential(2)}
            <span className="stability-eigenpair-relative">
              {" "}
              (relative {mode.eigenpairResidualRelative.toExponential(2)})
            </span>
          </dd>
        </div>
        <div>
          <dt>Eigenvector quality</dt>
          <dd>
            {mode.reliable ? (
              <span className="stability-eigenpair-quality is-reliable">Reliable</span>
            ) : (
              <span className="stability-eigenpair-quality is-unreliable">Unreliable — participation approximate</span>
            )}
          </dd>
        </div>
      </dl>
      {mode.participation.length > 0 ? (
        <>
          <p className="stability-participation-caption">Participation (weight ≥ 0.01, top 5)</p>
          <ul className="stability-participation-list">
            {mode.participation.map((entry) => (
              <li key={entry.variable}>
                <span className="stability-participation-variable">{entry.variable}</span>
                <span className="stability-participation-weight">{entry.weight.toFixed(4)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="inspector-empty-note">No variables above the participation threshold for this mode.</p>
      )}
    </article>
  );
}

function StabilityInspectorHeading({
  periodLabel,
  onClearAnalysis
}: {
  periodLabel: number;
  onClearAnalysis?: () => void;
}) {
  return (
    <div className="stability-inspector-heading">
      <h3>Local stability at period {periodLabel}</h3>
      {onClearAnalysis ? (
        <button type="button" className="stability-clear-button" onClick={onClearAnalysis}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

function StabilityInspectorActions({
  analyzeLabel,
  canAnalyze,
  disabledReason,
  onRequestAnalysis
}: {
  analyzeLabel: string;
  canAnalyze: boolean;
  disabledReason?: string;
  onRequestAnalysis?: () => void;
}) {
  return (
    <div className="stability-inspector-actions">
      <button
        type="button"
        className="primary-button stability-analyze-button"
        disabled={!canAnalyze || !onRequestAnalysis}
        title={disabledReason}
        onClick={onRequestAnalysis}
      >
        {analyzeLabel}
      </button>
      {disabledReason && !canAnalyze ? (
        <p className="stability-inspector-note">{disabledReason}</p>
      ) : null}
    </div>
  );
}

