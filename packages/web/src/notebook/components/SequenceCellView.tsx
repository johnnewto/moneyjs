import { useEffect, useMemo, useState, type JSX } from "react";

import { parseExpression } from "@sfcr/core";

import { DependencyGraphCanvas } from "../../components/DependencyGraphCanvas";
import { NumericValueText } from "../../components/NumericValueText";
import { SequenceDiagramCanvas } from "../../components/SequenceDiagramCanvas";
import { VariableLabel } from "../../components/VariableLabel";
import type { EditorState } from "../../lib/editorModel";
import { buildVariableUnitMetadata, inferUnits } from "../../lib/units";
import { buildVariableDescriptions, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildDependencyGraph } from "../dependencyGraph";
import { buildDependencyProxyDisplayOccurrences, buildDependencyRowTopology } from "../dependencyRows";
import { buildDependencySectorDisplayOccurrences, buildDependencySectorTopology, resolveStripMappingSources } from "../dependencySectors";
import { buildEditorStateForNotebookModel } from "../modelSections";
import { NotebookRenderProfiler } from "../notebookProfiler";
import { resolveSequenceDiagram } from "../sequence";
import type { MatrixCell, NotebookCell, SequenceCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";

interface MatrixSequenceViewState {
  highlightedStepIndex: number | null;
  pendingPeriodAdvance: boolean;
  pendingPeriodRetreat: boolean;
  previousCellId: string;
  previousPeriodIndex: number;
  visibleStepCount: number;
}

export function SequenceCellView({
  cell,
  cells,
  getModelCurrentValues,
  matrixSequenceViewState,
  maxPeriodIndex,
  onCellChange,
  onMatrixSequenceViewStateChange,
  onSelectedPeriodIndexChange,
  onVariableInspectRequest,
  runner,
  selectedPeriodIndex,
  variableDescriptions
}: {
  cell: SequenceCell;
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
  matrixSequenceViewState: MatrixSequenceViewState | null;
  maxPeriodIndex: number;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onMatrixSequenceViewStateChange(
    updater:
      | MatrixSequenceViewState
      | null
      | ((current: MatrixSequenceViewState | null) => MatrixSequenceViewState | null)
  ): void;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  onVariableInspectRequest(args: {
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  }): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
}) {
  if (cell.source.kind === "dependency") {
    const dependencyCell: SequenceCell & {
      source: Extract<SequenceCell["source"], { kind: "dependency" }>;
    } = {
      ...cell,
      source: cell.source
    };

    return (
      <DependencySequenceCellView
        cell={dependencyCell}
        cells={cells}
        getModelCurrentValues={getModelCurrentValues}
        onCellChange={onCellChange}
        onVariableInspectRequest={onVariableInspectRequest}
        variableDescriptions={variableDescriptions}
      />
    );
  }

  return (
    <MatrixSequenceCellView
      cell={cell}
      cells={cells}
      matrixSequenceViewState={matrixSequenceViewState}
      maxPeriodIndex={maxPeriodIndex}
      onMatrixSequenceViewStateChange={onMatrixSequenceViewStateChange}
      onSelectedPeriodIndexChange={onSelectedPeriodIndexChange}
      runner={runner}
      selectedPeriodIndex={selectedPeriodIndex}
      variableDescriptions={variableDescriptions}
    />
  );
}

function DependencySequenceCellView({
  cell,
  cells,
  getModelCurrentValues,
  onCellChange,
  onVariableInspectRequest,
  variableDescriptions
}: {
  cell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onVariableInspectRequest(args: {
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  }): void;
  variableDescriptions: VariableDescriptions;
}) {
  const showAccountingStrips = cell.source.showAccountingStrips ?? true;
  const ignoreInferredBandsForPlacement = cell.source.ignoreInferredBandsForPlacement ?? false;
  const showExogenous = cell.source.showExogenous ?? false;
  const showDebugOverlay = cell.source.showDebugOverlay ?? false;
  const isDevEnvironment =
    ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false) === true;

  function updateDependencySource(
    updater: (
      source: Extract<SequenceCell["source"], { kind: "dependency" }>
    ) => Extract<SequenceCell["source"], { kind: "dependency" }>
  ): void {
    onCellChange(cell.id, (current) => {
      if (current.type !== "sequence" || current.source.kind !== "dependency") {
        return current;
      }

      return {
        ...current,
        source: updater(current.source)
      };
    });
  }

  function togglePersistedAccountingStrips(): void {
    updateDependencySource((source) => ({
      ...source,
      showAccountingStrips: !(source.showAccountingStrips ?? true)
    }));
  }

  function togglePersistedStripSectorSource(): void {
    updateDependencySource((source) => ({
      ...source,
      stripSectorSource: source.stripSectorSource === "columns" ? "sectors" : "columns"
    }));
  }

  function togglePersistedIgnoreInferredBandsForPlacement(): void {
    updateDependencySource((source) => ({
      ...source,
      ignoreInferredBandsForPlacement: !(source.ignoreInferredBandsForPlacement ?? false)
    }));
  }

  function togglePersistedExogenous(): void {
    updateDependencySource((source) => ({
      ...source,
      showExogenous: !(source.showExogenous ?? true)
    }));
  }

  function togglePersistedDebugOverlay(): void {
    updateDependencySource((source) => ({
      ...source,
      showDebugOverlay: !(source.showDebugOverlay ?? false)
    }));
  }

  const dependencyEditor = useMemo(
    () =>
      buildEditorStateForNotebookModel(
        {
          id: "sequence-dependency-view",
          title: "Dependency graph source",
          metadata: { version: 1 },
          cells
        },
        cell.source
      ),
    [cell.source, cells]
  );
  const dependencyVariableDescriptions = useMemo(
    () =>
      dependencyEditor
        ? buildVariableDescriptions({
            equations: dependencyEditor.equations,
            externals: dependencyEditor.externals
          })
        : variableDescriptions,
    [dependencyEditor, variableDescriptions]
  );
  const dependencyVariableUnitMetadata = useMemo(
    () =>
      dependencyEditor
        ? buildVariableUnitMetadata({
            equations: dependencyEditor.equations,
            externals: dependencyEditor.externals
          })
        : new Map(),
    [dependencyEditor]
  );
  const graph = useMemo(() => {
    return dependencyEditor
      ? buildDependencyGraph(dependencyEditor)
      : {
          nodes: [],
          edges: [],
          errors: ["Dependency graph source model could not be resolved."],
          layerCount: 0
        };
  }, [dependencyEditor]);
  const visibleGraph = useMemo(() => filterDependencyGraphForView(graph, showExogenous), [graph, showExogenous]);
  const stripMappingSources = useMemo(() => resolveStripMappingSources(cells, cell), [cell, cells]);
  const canUseSectorStripSource = useMemo(() => {
    const activeMatrices = [stripMappingSources.transactionMatrix, stripMappingSources.balanceMatrix].filter(
      (matrix): matrix is MatrixCell => matrix !== null
    );

    return activeMatrices.length > 0 && activeMatrices.every((matrix) => Array.isArray(matrix.sectors));
  }, [stripMappingSources]);
  const effectiveStripSectorSource = canUseSectorStripSource
    ? (cell.source.stripSectorSource ?? "sectors")
    : "columns";
  const effectiveDependencyCell = useMemo(
    () => ({
      ...cell,
      source: {
        ...cell.source,
        stripSectorSource: effectiveStripSectorSource
      }
    }),
    [cell, effectiveStripSectorSource]
  );
  const sectorTopology = useMemo(
    () =>
      buildDependencySectorTopology({
        cells,
        dependencyCell: effectiveDependencyCell,
        graph: visibleGraph
      }),
    [cells, effectiveDependencyCell, visibleGraph]
  );
  const sectorDisplayOccurrences = useMemo(() => {
    const directOccurrences = buildDependencySectorDisplayOccurrences({
      cells,
      dependencyCell: effectiveDependencyCell,
      graph: visibleGraph
    });
    const proxyOccurrences = buildDependencyProxyDisplayOccurrences(cells, effectiveStripSectorSource);
    const merged = new Map<string, Array<(typeof directOccurrences)[string][number]>>();

    Object.entries(directOccurrences).forEach(([variable, occurrences]) => {
      merged.set(variable, [...occurrences]);
    });
    Object.entries(proxyOccurrences).forEach(([variable, occurrences]) => {
      const bucket = merged.get(variable) ?? [];
      merged.set(variable, [...bucket, ...occurrences]);
    });

    return Object.fromEntries(merged.entries());
  }, [cells, effectiveDependencyCell, effectiveStripSectorSource, visibleGraph]);
  const rowTopology = useMemo(
    () =>
      buildDependencyRowTopology({
        cells,
        dependencyCell: cell,
        graph: visibleGraph
      }),
    [cell, cells, visibleGraph]
  );
  const stripCount = useMemo(
    () => {
      if (showAccountingStrips) {
        return rowTopology.bands.filter((band) =>
          visibleGraph.nodes.some((node) => {
            const assignment = rowTopology.variables[node.name];
            const memberships = ignoreInferredBandsForPlacement
              ? (assignment?.memberships ?? []).filter((membership) => membership.source !== "inferred")
              : (assignment?.memberships ?? []);
            const primaryBand = memberships[0]?.band ?? "Unmapped";
            return primaryBand === band;
          })
        ).length;
      }

      return sectorTopology.sectors.filter((sector) =>
        visibleGraph.nodes.some(
          (node) => (sectorTopology.variables[node.name]?.sector ?? "Unmapped") === sector
        )
      ).length;
    },
    [
      ignoreInferredBandsForPlacement,
      rowTopology,
      sectorTopology,
      showAccountingStrips,
      visibleGraph.nodes
    ]
  );

  function handleNodeInspect(node: import("../../components/dependencyGraphLayout").PositionedNode): void {
    if (!dependencyEditor) {
      return;
    }
    onVariableInspectRequest({
      currentValues: getModelCurrentValues(cell.source),
      editor: dependencyEditor,
      selectedVariable: node.canonicalName ?? node.name,
      variableDescriptions: dependencyVariableDescriptions,
      variableUnitMetadata: dependencyVariableUnitMetadata
    });
  }

  return (
    <NotebookRenderProfiler
      id="SequenceDependencyCellBody"
      metadata={{
        cellId: cell.id,
        cellType: cell.type,
        edgeCount: visibleGraph.edges.length,
        nodeCount: visibleGraph.nodes.length,
        sourceKind: cell.source.kind
      }}
    >
      <div className="sequence-viewer">
        <div className="sequence-toolbar">
        <div className="sequence-toolbar-meta">
          <span>
            Nodes <strong>{visibleGraph.nodes.length}</strong>
          </span>
          <span>
            Edges <strong>{visibleGraph.edges.length}</strong>
          </span>
          <span>
            Strips <strong>{stripCount}</strong>
          </span>
        </div>
        <div className="sequence-toolbar-actions">
          <button
            type="button"
            className={`notebook-run-button notebook-source-toggle${
              showAccountingStrips ? " is-active" : ""
            }`}
            onClick={togglePersistedAccountingStrips}
          >
            Accounting bands
          </button>
          <button
            type="button"
            className={`notebook-run-button notebook-source-toggle${
              effectiveStripSectorSource === "sectors" ? " is-active" : ""
            }`}
            onClick={togglePersistedStripSectorSource}
            disabled={!canUseSectorStripSource}
          >
            {effectiveStripSectorSource === "sectors" ? "Sectors" : "Columns"}
          </button>
          <button
            type="button"
            className={`notebook-run-button notebook-source-toggle${
              ignoreInferredBandsForPlacement ? " is-active" : ""
            }`}
            onClick={togglePersistedIgnoreInferredBandsForPlacement}
          >
            {ignoreInferredBandsForPlacement ? "Ignore inferred bands" : "Place inferred bands"}
          </button>
          <button
            type="button"
            className={`notebook-run-button notebook-source-toggle${
              showExogenous ? " is-active" : ""
            }`}
            onClick={togglePersistedExogenous}
          >
            {showExogenous ? "Hide exogenous" : "Show exogenous"}
          </button>
          {isDevEnvironment ? (
            <button
              type="button"
              className={`notebook-run-button notebook-source-toggle${
                showDebugOverlay ? " is-active" : ""
              }`}
              onClick={togglePersistedDebugOverlay}
            >
              {showDebugOverlay ? "Hide debug overlay" : "Show debug overlay"}
            </button>
          ) : null}
        </div>
        </div>
        <NotebookRenderProfiler
          id="SequenceDependencyCanvas"
          metadata={{
            cellId: cell.id,
            cellType: cell.type,
            edgeCount: visibleGraph.edges.length,
            nodeCount: visibleGraph.nodes.length,
            sourceKind: cell.source.kind
          }}
        >
          <DependencyGraphCanvas
            graph={visibleGraph}
            onNodeClick={handleNodeInspect}
            sectorDisplayOccurrences={sectorDisplayOccurrences}
            sectorTopology={sectorTopology}
            rowTopology={rowTopology}
            variableDescriptions={dependencyVariableDescriptions}
            showAccountingStrips={showAccountingStrips}
            ignoreInferredBandsForPlacement={ignoreInferredBandsForPlacement}
            debugOverlay={showDebugOverlay}
          />
        </NotebookRenderProfiler>
        {visibleGraph.errors.length ? (
          <ul className="validation-list">
            {visibleGraph.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </NotebookRenderProfiler>
  );
}

function filterDependencyGraphForView(
  graph: ReturnType<typeof buildDependencyGraph>,
  showExogenous: boolean
): ReturnType<typeof buildDependencyGraph> {
  if (showExogenous) {
    return graph;
  }

  const visibleNodes = graph.nodes.filter((node) => node.variableType !== "exogenous");
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId)
  );
  const minLayer = visibleNodes.reduce((result, node) => Math.min(result, node.layer), Infinity);
  const normalizedNodes =
    Number.isFinite(minLayer) && minLayer > 0
      ? visibleNodes.map((node) => ({ ...node, layer: node.layer - minLayer }))
      : visibleNodes;

  return {
    nodes: normalizedNodes,
    edges: visibleEdges,
    errors: graph.errors,
    layerCount: normalizedNodes.reduce((maxLayer, node) => Math.max(maxLayer, node.layer), -1) + 1
  };
}

function MatrixSequenceCellView({
  cell,
  cells,
  matrixSequenceViewState,
  maxPeriodIndex,
  onMatrixSequenceViewStateChange,
  onSelectedPeriodIndexChange,
  runner,
  selectedPeriodIndex,
  variableDescriptions
}: {
  cell: SequenceCell;
  cells: NotebookCell[];
  matrixSequenceViewState: MatrixSequenceViewState | null;
  maxPeriodIndex: number;
  onMatrixSequenceViewStateChange(
    updater:
      | MatrixSequenceViewState
      | null
      | ((current: MatrixSequenceViewState | null) => MatrixSequenceViewState | null)
  ): void;
  onSelectedPeriodIndexChange(nextIndex: number): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
}) {
  const diagram = useMemo(
    () =>
      resolveSequenceDiagram(
        cell,
        (cellId) => {
          const target = cells.find((entry) => entry.id === cellId);
          return target?.type === "matrix" ? target : null;
        },
        (cellId) => runner.getResult(cellId),
        selectedPeriodIndex
      ),
    [cell, cells, runner, selectedPeriodIndex]
  );
  const effectiveMatrixSequenceViewState =
    matrixSequenceViewState ?? {
      highlightedStepIndex: null,
      pendingPeriodAdvance: false,
      pendingPeriodRetreat: false,
      previousCellId: cell.id,
      previousPeriodIndex: selectedPeriodIndex,
      visibleStepCount: diagram.steps.length
    };

  useEffect(() => {
    onMatrixSequenceViewStateChange((current) => {
      const state = current ?? {
        highlightedStepIndex: null,
        pendingPeriodAdvance: false,
        pendingPeriodRetreat: false,
        previousCellId: cell.id,
        previousPeriodIndex: selectedPeriodIndex,
        visibleStepCount: diagram.steps.length
      };

      if (state.previousCellId !== cell.id) {
        return {
          highlightedStepIndex: null,
          pendingPeriodAdvance: false,
          pendingPeriodRetreat: false,
          previousCellId: cell.id,
          previousPeriodIndex: selectedPeriodIndex,
          visibleStepCount: diagram.steps.length
        };
      }

      if (state.pendingPeriodAdvance) {
        return {
          highlightedStepIndex: diagram.steps.length > 0 ? 0 : null,
          pendingPeriodAdvance: false,
          pendingPeriodRetreat: false,
          previousCellId: cell.id,
          previousPeriodIndex: selectedPeriodIndex,
          visibleStepCount: Math.min(1, diagram.steps.length)
        };
      }

      if (state.pendingPeriodRetreat) {
        return {
          highlightedStepIndex: diagram.steps.length > 0 ? diagram.steps.length - 1 : null,
          pendingPeriodAdvance: false,
          pendingPeriodRetreat: false,
          previousCellId: cell.id,
          previousPeriodIndex: selectedPeriodIndex,
          visibleStepCount: diagram.steps.length
        };
      }

      if (state.previousPeriodIndex !== selectedPeriodIndex) {
        return {
          highlightedStepIndex: null,
          pendingPeriodAdvance: false,
          pendingPeriodRetreat: false,
          previousCellId: cell.id,
          previousPeriodIndex: selectedPeriodIndex,
          visibleStepCount: diagram.steps.length
        };
      }

      if (state.visibleStepCount !== diagram.steps.length || state.highlightedStepIndex !== null) {
        return {
          ...state,
          highlightedStepIndex: null,
          visibleStepCount: diagram.steps.length
        };
      }

      return state;
    });
  }, [diagram.steps.length, cell.id, onMatrixSequenceViewStateChange, selectedPeriodIndex]);

  function moveToStep(nextCount: number): void {
    const clamped = Math.max(0, Math.min(nextCount, diagram.steps.length));
    onMatrixSequenceViewStateChange((current) => {
      const state = current ?? effectiveMatrixSequenceViewState;
      return {
        ...state,
        highlightedStepIndex: clamped > state.visibleStepCount ? clamped - 1 : null,
        visibleStepCount: clamped
      };
    });
  }

  const visibleSteps = Math.min(effectiveMatrixSequenceViewState.visibleStepCount, diagram.steps.length);
  const canAdvancePeriod = selectedPeriodIndex < maxPeriodIndex;
  const canRetreatPeriod = selectedPeriodIndex > 0;

  function handleNextStep(): void {
    if (visibleSteps < diagram.steps.length) {
      moveToStep(visibleSteps + 1);
      return;
    }
    if (!canAdvancePeriod) {
      return;
    }
    onMatrixSequenceViewStateChange((current) => ({
      ...(current ?? effectiveMatrixSequenceViewState),
      pendingPeriodAdvance: true,
      pendingPeriodRetreat: false
    }));
    onSelectedPeriodIndexChange(selectedPeriodIndex + 1);
  }

  function handlePreviousStep(): void {
    if (visibleSteps > 0) {
      moveToStep(visibleSteps - 1);
      return;
    }
    if (!canRetreatPeriod) {
      return;
    }
    onMatrixSequenceViewStateChange((current) => ({
      ...(current ?? effectiveMatrixSequenceViewState),
      pendingPeriodAdvance: false,
      pendingPeriodRetreat: true
    }));
    onSelectedPeriodIndexChange(selectedPeriodIndex - 1);
  }

  return (
    <NotebookRenderProfiler
      id="SequenceMatrixCellBody"
      metadata={{
        cellId: cell.id,
        cellType: cell.type,
        selectedPeriodIndex,
        sourceKind: cell.source.kind,
        stepCount: diagram.steps.length
      }}
    >
      <div className="sequence-viewer">
        <div className="sequence-toolbar">
        <div className="sequence-toolbar-meta">
          <span>
            Participants <strong>{diagram.participants.length}</strong>
          </span>
          <span>
            Steps <strong>{diagram.steps.length}</strong>
          </span>
          <span>
            Visible <strong>{visibleSteps}</strong>
          </span>
        </div>
        <div className="sequence-toolbar-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => moveToStep(0)}
            disabled={visibleSteps === 0}
          >
            Reset
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handlePreviousStep}
            disabled={visibleSteps === 0 && !canRetreatPeriod}
          >
            Previous step
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleNextStep}
            disabled={visibleSteps >= diagram.steps.length && !canAdvancePeriod}
          >
            Next step
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => moveToStep(diagram.steps.length)}
            disabled={visibleSteps >= diagram.steps.length}
          >
            Show all
          </button>
        </div>
        </div>
        <NotebookRenderProfiler
          id="SequenceMatrixCanvas"
          metadata={{
            cellId: cell.id,
            cellType: cell.type,
            participantCount: diagram.participants.length,
            selectedPeriodIndex,
            sourceKind: cell.source.kind,
            stepCount: diagram.steps.length,
            visibleStepCount: visibleSteps
          }}
        >
          <SequenceDiagramCanvas
            diagram={diagram}
            visibleStepCount={visibleSteps}
            highlightedStepIndex={effectiveMatrixSequenceViewState.highlightedStepIndex}
            variableDescriptions={variableDescriptions}
          />
        </NotebookRenderProfiler>
        {diagram.errors.length ? (
        <ul className="validation-list">
          {diagram.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      </div>
    </NotebookRenderProfiler>
  );
}

function formatResolvedMatrixValue(
  source: string,
  resolved: string,
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>
): JSX.Element | string {
  const valueText = resolved.replace(/^=\s*/, "");
  const numericValue = Number(valueText.replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) {
    return resolved;
  }

  const unitMeta = inferMatrixExpressionUnitMeta(source, variableUnitMetadata);
  return (
    <NumericValueText
      prefix="= "
      unitMeta={unitMeta}
      value={numericValue}
      options={{
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }}
    />
  );
}

function inferMatrixExpressionUnitMeta(
  source: string,
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>
) {
  try {
    const expression = parseExpression(stripLeadingPlus(source.trim()));
    const inferred = inferUnits(expression, variableUnitMetadata);
    if (inferred.signature) {
      return { signature: inferred.signature };
    }
  } catch {
    // Fall back to a simple variable lookup when the matrix entry is not parseable.
  }

  const variableName = inferPrimaryVariableName(source);
  return variableName ? variableUnitMetadata.get(variableName) : undefined;
}

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

function inferPrimaryVariableName(source: string): string | null {
  const match = source.match(/[A-Za-z_][A-Za-z0-9_.^{}]*/);
  return match ? match[0] : null;
}
