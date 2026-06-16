import {
  highlightFormula
} from "../../components/EquationGridEditor";
import { VariableLabel } from "../../components/VariableLabel";
import { documentHighlightClassName } from "../../lib/variableHighlight";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../../lib/unitMeta";
import {
  computeEquationVariableGain,
  formatEquationVariableGain
} from "../../lib/equationVariableGain";
import { formatNotebookCurrentValue } from "./NotebookCurrentValue";
import type { ImplicitMatrixAccumulationViewEntry } from "../implicitMatrixEquations";
import { IMPLICIT_MATRIX_ACCUMULATION_SECTION_TITLE } from "../implicitMatrixEquations";
import type { RunCell } from "../types";

export function ImplicitEquationsSection({
  currentValues,
  entries,
  highlightedVariable = null,
  laggedCurrentValues,
  laggedPeriodLabel,
  parameterNames,
  preferredRun,
  variableDescriptions,
  variableUnitMetadata,
  onInspectVariable
}: {
  currentValues: Record<string, number | undefined>;
  entries: ImplicitMatrixAccumulationViewEntry[];
  highlightedVariable?: string | null;
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  parameterNames: Set<string>;
  preferredRun: RunCell | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
  onInspectVariable(variableName: string): void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className="notebook-model-view-row notebook-model-view-row-comment notebook-model-view-row-section notebook-model-view-row-implicit-section"
        role="row"
      >
        <div className="notebook-model-view-row-comment-text" role="cell">
          <div className="notebook-model-view-implicit-section-heading">
            <strong>{IMPLICIT_MATRIX_ACCUMULATION_SECTION_TITLE}</strong>
            {preferredRun ? (
              <span className="notebook-model-view-implicit-section-run">
                {preferredRun.title.trim() || "Baseline run"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {entries.map((entry) => (
        <ImplicitEquationReadRow
          key={entry.name}
          currentValues={currentValues}
          entry={entry}
          highlightedVariable={highlightedVariable}
          laggedCurrentValues={laggedCurrentValues}
          laggedPeriodLabel={laggedPeriodLabel}
          parameterNames={parameterNames}
          variableDescriptions={variableDescriptions}
          variableUnitMetadata={variableUnitMetadata}
          onInspectVariable={onInspectVariable}
        />
      ))}
    </>
  );
}

function ImplicitEquationReadRow({
  currentValues,
  entry,
  highlightedVariable = null,
  laggedCurrentValues,
  laggedPeriodLabel,
  parameterNames,
  variableDescriptions,
  variableUnitMetadata,
  onInspectVariable
}: {
  currentValues: Record<string, number | undefined>;
  entry: ImplicitMatrixAccumulationViewEntry;
  highlightedVariable?: string | null;
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  parameterNames: Set<string>;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
  onInspectVariable(variableName: string): void;
}) {
  const variableName = entry.name.trim();

  return (
    <div className="notebook-model-view-row notebook-model-view-row-implicit" role="row">
      <span className="notebook-model-view-name" role="cell">
        <button
          type="button"
          className={documentHighlightClassName(
            variableName,
            highlightedVariable,
            "result-variable-button"
          )}
          onClick={() => onInspectVariable(variableName)}
        >
          <VariableLabel
            currentValues={currentValues}
            name={variableName}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
        </button>
      </span>
      <span className="notebook-model-view-expression" role="cell">
        {entry.expression
          ? highlightFormula(
              entry.expression,
              parameterNames,
              undefined,
              variableDescriptions,
              variableUnitMetadata,
              onInspectVariable,
              undefined,
              currentValues,
              highlightedVariable,
              true,
              laggedCurrentValues,
              laggedPeriodLabel
            )
          : " "}
      </span>
      <span className="notebook-model-view-description" role="cell" title={entry.flowWarning ?? undefined}>
        {entry.flowWarning ?? "From matrix Sum row"}
      </span>
      <span className="notebook-model-view-initial" role="cell" aria-hidden="true">
        {" "}
      </span>
      <span className="notebook-model-view-current" role="cell">
        <VariableLabel
          className="notebook-current-value-tooltip-anchor"
          currentValue={currentValues[variableName]}
          name={variableName}
          variableDescriptions={variableDescriptions}
          variableUnitMetadata={variableUnitMetadata}
        >
          {formatNotebookCurrentValue(
            variableName,
            currentValues[variableName],
            variableDescriptions,
            variableUnitMetadata,
            false,
            2,
            true
          )}
        </VariableLabel>
      </span>
      <span className="notebook-model-view-gain" role="cell">
        {formatEquationVariableGain(
          computeEquationVariableGain(currentValues[variableName], laggedCurrentValues?.[variableName])
        )}
      </span>
      <span className="notebook-model-view-kind" role="cell">
        Accumulation
      </span>
    </div>
  );
}
