import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";

import { parseExpression } from "@sfcr/core";

import { NumericValueText } from "../../components/NumericValueText";
import { SequenceDiagramCanvas } from "../../components/SequenceDiagramCanvas";
import { TransactionFlowGraphCanvas } from "../../components/TransactionFlowGraphCanvas";
import { TransactionFlowMultiportCanvas } from "../../components/TransactionFlowMultiportCanvas";
import { buildVariableUnitMetadata, inferUnits } from "../../lib/units";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableInspectRequest } from "../../lib/variableInspect";
import { NotebookRenderProfiler } from "../notebookProfiler";
import { resolveSequenceDiagram } from "../sequence";
import { resolveSequenceMatrixInspectBundle } from "../sequenceMatrixInspect";
import type { NotebookCell, SequenceCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";
import { DependencySequenceSummaryView } from "./DependencySequenceSummaryView";

interface MatrixSequenceViewState {
  highlightedStepIndex: number | null;
  layoutMode: MatrixSequenceLayoutMode;
  participantColumnOrder?: string[];
  pendingPeriodAdvance: boolean;
  pendingPeriodRetreat: boolean;
  previousCellId: string;
  previousPeriodIndex: number;
  visibleStepCount: number;
}

type MatrixSequenceLayoutMode = "swimlane" | "multiport" | "lifelines";

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
  highlightedVariable = null,
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
  highlightedVariable?: string | null;
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
  onVariableInspectRequest(args: VariableInspectRequest): void;
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
      <DependencySequenceSummaryView
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
      highlightedVariable={highlightedVariable}
      matrixSequenceViewState={matrixSequenceViewState}
      maxPeriodIndex={maxPeriodIndex}
      onCellChange={onCellChange}
      onMatrixSequenceViewStateChange={onMatrixSequenceViewStateChange}
      onSelectedPeriodIndexChange={onSelectedPeriodIndexChange}
      onVariableInspectRequest={onVariableInspectRequest}
      runner={runner}
      selectedPeriodIndex={selectedPeriodIndex}
      variableDescriptions={variableDescriptions}
    />
  );
}


function MatrixSequenceCellView({
  cell,
  cells,
  highlightedVariable,
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
  highlightedVariable: string | null;
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
  onVariableInspectRequest(args: VariableInspectRequest): void;
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
}) {
  const inspectBundle = useMemo(
    () =>
      cell.source.kind === "matrix"
        ? resolveSequenceMatrixInspectBundle(cell, cells, runner, selectedPeriodIndex, variableDescriptions)
        : null,
    [cell, cells, runner, selectedPeriodIndex, variableDescriptions]
  );
  const inspectContextRef = useRef(inspectBundle);

  useEffect(() => {
    inspectContextRef.current = inspectBundle;
  }, [inspectBundle]);

  const handleInspectVariable = useCallback(
    (selectedVariable: string) => {
      const bundle = inspectContextRef.current;
      if (!bundle?.editor) {
        return;
      }

      onVariableInspectRequest({
        currentValues: bundle.currentValues,
        editor: bundle.editor,
        modelSource: bundle.modelSource,
        selectedVariable,
        variableDescriptions: bundle.variableDescriptions,
        variableUnitMetadata: bundle.variableUnitMetadata
      });
    },
    [onVariableInspectRequest]
  );

  const multiportInspectContext = useMemo(() => {
    if (!inspectBundle) {
      return {
        currentValues: {},
        highlightedVariable,
        parameterNames: new Set<string>(),
        variableDescriptions,
        variableUnitMetadata: new Map()
      };
    }

    return {
      currentValues: inspectBundle.currentValues,
      highlightedVariable,
      onSelectVariable: inspectBundle.editor ? handleInspectVariable : undefined,
      parameterNames: inspectBundle.parameterNames,
      variableDescriptions: inspectBundle.variableDescriptions,
      variableUnitMetadata: inspectBundle.variableUnitMetadata
    };
  }, [handleInspectVariable, highlightedVariable, inspectBundle, variableDescriptions]);
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
  const isMatrixSource = cell.source.kind === "matrix";
  const effectiveMatrixSequenceViewState =
    matrixSequenceViewState ?? {
      highlightedStepIndex: null,
      layoutMode: "multiport",
      participantColumnOrder: cell.participantColumnOrder,
      pendingPeriodAdvance: false,
      pendingPeriodRetreat: false,
      previousCellId: cell.id,
      previousPeriodIndex: selectedPeriodIndex,
      visibleStepCount: diagram.steps.length > 0 ? 1 : 0
    };
  const layoutMode = effectiveMatrixSequenceViewState.layoutMode ?? "multiport";
  const usesReactFlowLayout =
    isMatrixSource && (layoutMode === "swimlane" || layoutMode === "multiport");
  const [fitViewRequest, setFitViewRequest] = useState(0);

  function setLayoutMode(nextMode: MatrixSequenceLayoutMode): void {
    onMatrixSequenceViewStateChange((current) => ({
      ...(current ?? effectiveMatrixSequenceViewState),
      layoutMode: nextMode
    }));
  }

  const setParticipantColumnOrder = useCallback(
    (participantColumnOrder: string[]) => {
      onCellChange(cell.id, (current) =>
        current.type === "sequence"
          ? {
              ...current,
              participantColumnOrder
            }
          : current
      );
      onMatrixSequenceViewStateChange((current) => ({
        ...(current ?? {
          highlightedStepIndex: null,
          layoutMode: "multiport" as const,
          participantColumnOrder: cell.participantColumnOrder,
          pendingPeriodAdvance: false,
          pendingPeriodRetreat: false,
          previousCellId: cell.id,
          previousPeriodIndex: selectedPeriodIndex,
          visibleStepCount: diagram.steps.length > 0 ? 1 : 0
        }),
        participantColumnOrder
      }));
    },
    [
      cell.id,
      cell.participantColumnOrder,
      diagram.steps.length,
      onCellChange,
      onMatrixSequenceViewStateChange,
      selectedPeriodIndex
    ]
  );

  useEffect(() => {
    onMatrixSequenceViewStateChange((current) => {
      const state = current ?? {
        highlightedStepIndex: null,
        layoutMode: "multiport" as const,
        participantColumnOrder: cell.participantColumnOrder,
        pendingPeriodAdvance: false,
        pendingPeriodRetreat: false,
        previousCellId: cell.id,
        previousPeriodIndex: selectedPeriodIndex,
        visibleStepCount: diagram.steps.length > 0 ? 1 : 0
      };

      if (state.previousCellId !== cell.id) {
        return {
          highlightedStepIndex: null,
          layoutMode: state.layoutMode ?? "multiport",
          participantColumnOrder: cell.participantColumnOrder,
          pendingPeriodAdvance: false,
          pendingPeriodRetreat: false,
          previousCellId: cell.id,
          previousPeriodIndex: selectedPeriodIndex,
          visibleStepCount: diagram.steps.length > 0 ? 1 : 0
        };
      }

      if (state.pendingPeriodAdvance) {
        return {
          highlightedStepIndex: diagram.steps.length > 0 ? 0 : null,
          layoutMode: state.layoutMode ?? "multiport",
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
          layoutMode: state.layoutMode ?? "multiport",
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
          layoutMode: state.layoutMode ?? "multiport",
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
          layoutMode: state.layoutMode ?? "multiport",
          highlightedStepIndex: null,
          visibleStepCount: diagram.steps.length
        };
      }

      return state;
    });
  }, [diagram.steps.length, cell.id, cell.participantColumnOrder, onMatrixSequenceViewStateChange, selectedPeriodIndex]);

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
          {usesReactFlowLayout ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setFitViewRequest((count) => count + 1)}
              disabled={visibleSteps === 0}
            >
              Fit to window
            </button>
          ) : null}
          {isMatrixSource ? (
            <>
              <button
                type="button"
                className={`notebook-run-button notebook-source-toggle${
                  layoutMode === "swimlane" ? " is-active" : ""
                }`}
                onClick={() => setLayoutMode("swimlane")}
              >
                Swimlane
              </button>
              <button
                type="button"
                className={`notebook-run-button notebook-source-toggle${
                  layoutMode === "multiport" ? " is-active" : ""
                }`}
                onClick={() => setLayoutMode("multiport")}
              >
                Multiport
              </button>
              <button
                type="button"
                className={`notebook-run-button notebook-source-toggle${
                  layoutMode === "lifelines" ? " is-active" : ""
                }`}
                onClick={() => setLayoutMode("lifelines")}
              >
                Lifelines
              </button>
            </>
          ) : null}
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
          {isMatrixSource && layoutMode === "swimlane" ? (
            <TransactionFlowGraphCanvas
              diagram={diagram}
              fitViewRequest={fitViewRequest}
              visibleStepCount={visibleSteps}
              highlightedStepIndex={effectiveMatrixSequenceViewState.highlightedStepIndex}
            />
          ) : isMatrixSource && layoutMode === "multiport" ? (
            <TransactionFlowMultiportCanvas
              diagram={diagram}
              fitViewRequest={fitViewRequest}
              inspectContext={multiportInspectContext}
              participantColumnOrder={effectiveMatrixSequenceViewState.participantColumnOrder ?? null}
              onParticipantColumnOrderChange={setParticipantColumnOrder}
              visibleStepCount={visibleSteps}
              highlightedStepIndex={effectiveMatrixSequenceViewState.highlightedStepIndex}
            />
          ) : (
            <SequenceDiagramCanvas
              diagram={diagram}
              visibleStepCount={visibleSteps}
              highlightedStepIndex={effectiveMatrixSequenceViewState.highlightedStepIndex}
              variableDescriptions={variableDescriptions}
            />
          )}
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
