import { useMemo } from "react";

import type { SimulationResult } from "@sfcr/core";

import type { MultiportVariableInspectContextValue } from "../../components/flow/MultiportVariableInspectContext";
import {
  buildMultiportParticipantStocks,
  findCompanionBalanceMatrixCell,
  type MultiportParticipantStock
} from "../../components/multiportParticipantStocks";
import { TransactionFlowMultiportCanvas } from "../../components/TransactionFlowMultiportCanvas";
import { resolveSequenceDiagram } from "../../notebook/sequence";
import type { MatrixCell, NotebookCell, SequenceCell } from "../../notebook/types";
import type { PublicationVariableInteraction } from "../publicationInspect";

const EMPTY_PARTICIPANT_STOCKS = new Map<string, MultiportParticipantStock[]>();

function buildLaggedCurrentValues(
  result: SimulationResult | null,
  selectedPeriodIndex: number
): Record<string, number | undefined> {
  if (!result || selectedPeriodIndex <= 0) {
    return {};
  }

  const lagPeriodIndex = selectedPeriodIndex - 1;
  return Object.fromEntries(
    Object.entries(result.series).map(([name, values]) => [
      name,
      values[Math.min(lagPeriodIndex, Math.max(values.length - 1, 0))]
    ])
  );
}

/**
 * Static "show-all" multiport transaction-flow figure for the publication view.
 * Unlike the interactive notebook view it exposes no toolbar, step stepping, or
 * participant reordering; it renders every step at the publication's selected period.
 */
export function PublicationSequence({
  cell,
  cells,
  getResult,
  interaction,
  selectedPeriodIndex,
  viewportRoot = null
}: {
  cell: SequenceCell;
  cells: NotebookCell[];
  getResult(runCellId: string): SimulationResult | null;
  interaction: PublicationVariableInteraction;
  selectedPeriodIndex: number;
  viewportRoot?: Element | null;
}) {
  const diagram = useMemo(
    () =>
      resolveSequenceDiagram(
        cell,
        (cellId) => {
          const target = cells.find((entry) => entry.id === cellId);
          return target?.type === "matrix" ? target : null;
        },
        (cellId) => getResult(cellId),
        selectedPeriodIndex
      ),
    [cell, cells, getResult, selectedPeriodIndex]
  );

  const { participantStocks, laggedCurrentValues } = useMemo(() => {
    if (cell.source.kind !== "matrix") {
      return {
        participantStocks: EMPTY_PARTICIPANT_STOCKS,
        laggedCurrentValues: {} as Record<string, number | undefined>
      };
    }

    const matrixCellId = cell.source.matrixCellId;
    const transactionMatrix = cells.find(
      (entry): entry is MatrixCell => entry.type === "matrix" && entry.id === matrixCellId
    );
    if (!transactionMatrix) {
      return {
        participantStocks: EMPTY_PARTICIPANT_STOCKS,
        laggedCurrentValues: {} as Record<string, number | undefined>
      };
    }

    const balanceMatrix = findCompanionBalanceMatrixCell(cells, transactionMatrix);
    const sourceRunCellId = cell.source.sourceRunCellId ?? transactionMatrix.sourceRunCellId ?? null;
    const result = sourceRunCellId ? getResult(sourceRunCellId) : null;

    return {
      participantStocks: buildMultiportParticipantStocks(
        transactionMatrix,
        balanceMatrix,
        result,
        selectedPeriodIndex,
        interaction.variableUnitMetadata
      ),
      laggedCurrentValues: buildLaggedCurrentValues(result, selectedPeriodIndex)
    };
  }, [cell.source, cells, getResult, interaction.variableUnitMetadata, selectedPeriodIndex]);

  const inspectContext = useMemo<MultiportVariableInspectContextValue>(
    () => ({
      currentValues: interaction.currentValues,
      laggedCurrentValues,
      laggedPeriodLabel: selectedPeriodIndex > 0 ? `period ${selectedPeriodIndex}` : undefined,
      highlightedVariable: interaction.highlightedVariable,
      onSelectVariable: interaction.onSelectVariable,
      parameterNames: interaction.parameterNames,
      variableDescriptions: interaction.variableDescriptions,
      variableUnitMetadata: interaction.variableUnitMetadata
    }),
    [interaction, laggedCurrentValues, selectedPeriodIndex]
  );

  return (
    <div className="publication-sequence">
      <TransactionFlowMultiportCanvas
        diagram={diagram}
        highlightedStepIndex={null}
        inspectContext={inspectContext}
        participantColumnOrder={cell.participantColumnOrder ?? null}
        participantStocks={participantStocks}
        viewportRoot={viewportRoot}
        visibleStepCount={diagram.steps.length}
      />
      {diagram.errors.length ? (
        <ul className="validation-list">
          {diagram.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
