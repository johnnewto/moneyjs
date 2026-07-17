import type { ReactNode } from "react";

import { highlightFormula } from "../components/EquationGridEditor";
import type { TraceTokenRole } from "../components/EquationTrace";
import { VariableLabel } from "../components/VariableLabel";
import { documentHighlightClassName } from "../lib/variableHighlight";
import type { PublicationVariableInteraction } from "./publicationInspect";

export function renderPublicationFormula(
  expression: string,
  interaction: PublicationVariableInteraction,
  highlightedTokens?: Map<string, TraceTokenRole>
): ReactNode[] {
  return highlightFormula(
    expression,
    interaction.parameterNames,
    highlightedTokens,
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
  name,
  traceRole = null
}: {
  interaction: PublicationVariableInteraction;
  name: string;
  traceRole?: TraceTokenRole | null;
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

  const traceClassName = traceRole ? `formula-token trace-token-${traceRole}` : "";
  const baseClassName = ["result-variable-button", "publication-variable-button", traceClassName]
    .filter(Boolean)
    .join(" ");

  if (!interaction.onSelectVariable) {
    if (!traceClassName) {
      return label;
    }
    return <span className={traceClassName}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={documentHighlightClassName(
        normalizedName,
        interaction.highlightedVariable,
        baseClassName
      )}
      aria-label={`Inspect variable ${normalizedName}`}
      onClick={() => interaction.onSelectVariable?.(normalizedName)}
    >
      {label}
    </button>
  );
}
