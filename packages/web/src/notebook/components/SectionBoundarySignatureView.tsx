import type { ReactNode } from "react";
import type { SectionBoundarySignature } from "@sfcr/notebook-core";

import { InstantTooltip } from "../../components/InstantTooltip";
import { VariableMathLabel } from "../../components/VariableMathLabel";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import { documentHighlightClassName } from "../../lib/variableHighlight";
import { resolveVariableTooltip, type VariableUnitMetadata } from "../../lib/unitMeta";

function BoundaryVariableButton({
  currentValues,
  highlightedVariable = null,
  name,
  onInspectVariable,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  name: string;
  onInspectVariable?(variableName: string): void;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const label = (
    <InstantTooltip
      tooltip={resolveVariableTooltip({
        name,
        variableDescriptions,
        variableUnitMetadata,
        currentValues
      })}
    >
      <span className="variable-label-inline">
        <VariableMathLabel name={name} />
      </span>
    </InstantTooltip>
  );

  if (!onInspectVariable) {
    return <span className="section-boundary-variable-label">{label}</span>;
  }

  return (
    <button
      type="button"
      className={documentHighlightClassName(
        name,
        highlightedVariable,
        "result-variable-button section-boundary-variable-button"
      )}
      aria-label={`Inspect variable ${name}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onInspectVariable(name);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {label}
    </button>
  );
}

function renderVariableList(
  names: string[],
  args: {
    currentValues?: Record<string, number | undefined>;
    highlightedVariable?: string | null;
    onInspectVariable?(variableName: string): void;
    variableDescriptions?: VariableDescriptions;
    variableUnitMetadata?: VariableUnitMetadata;
  }
): ReactNode[] {
  return names.flatMap((name, index) => {
    const nodes: ReactNode[] = [];
    if (index > 0) {
      nodes.push(", ");
    }
    nodes.push(
      <BoundaryVariableButton
        key={`${name}-${index}`}
        currentValues={args.currentValues}
        highlightedVariable={args.highlightedVariable}
        name={name}
        onInspectVariable={args.onInspectVariable}
        variableDescriptions={args.variableDescriptions}
        variableUnitMetadata={args.variableUnitMetadata}
      />
    );
    return nodes;
  });
}

export function SectionBoundarySignatureView({
  boundary,
  currentValues,
  highlightedVariable = null,
  onInspectVariable,
  variableDescriptions,
  variableUnitMetadata
}: {
  boundary: SectionBoundarySignature;
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  onInspectVariable?(variableName: string): void;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const variableArgs = {
    currentValues,
    highlightedVariable,
    onInspectVariable,
    variableDescriptions,
    variableUnitMetadata
  };

  return (
    <span className="section-boundary-signature">
      {renderVariableList(boundary.outputs, variableArgs)}
      <span className="section-boundary-signature-separator"> = {boundary.functionName} (</span>
      {renderVariableList(boundary.inputs, variableArgs)}
      <span className="section-boundary-signature-separator">)</span>
    </span>
  );
}
