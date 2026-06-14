import type { ReactNode } from "react";

import { highlightFormula } from "../components/EquationGridEditor";
import { VariableLabel } from "../components/VariableLabel";
import { documentHighlightClassName } from "../lib/variableHighlight";
import type { PublicationVariableInteraction } from "./publicationInspect";

export function renderPublicationFormula(
  expression: string,
  interaction: PublicationVariableInteraction
): ReactNode[] {
  return highlightFormula(
    expression,
    interaction.parameterNames,
    undefined,
    interaction.variableDescriptions,
    interaction.variableUnitMetadata,
    interaction.onSelectVariable,
    undefined,
    interaction.currentValues,
    interaction.highlightedVariable,
    true
  );
}

export function PublicationVariableName({
  interaction,
  name
}: {
  interaction: PublicationVariableInteraction;
  name: string;
}) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return null;
  }

  const label = (
    <VariableLabel
      currentValues={interaction.currentValues}
      name={normalizedName}
      variableDescriptions={interaction.variableDescriptions}
      variableUnitMetadata={interaction.variableUnitMetadata}
    />
  );

  if (!interaction.onSelectVariable) {
    return label;
  }

  return (
    <button
      type="button"
      className={documentHighlightClassName(
        normalizedName,
        interaction.highlightedVariable,
        "result-variable-button publication-variable-button"
      )}
      aria-label={`Inspect variable ${normalizedName}`}
      onClick={() => interaction.onSelectVariable?.(normalizedName)}
    >
      {label}
    </button>
  );
}
