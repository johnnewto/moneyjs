import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { SectionBoundarySignature } from "@sfcr/notebook-core";

import { InstantTooltip } from "../../components/InstantTooltip";
import { VariableMathLabel } from "../../components/VariableMathLabel";
import { classifyVariableToken } from "../../lib/formulaTokenClass";
import type { VariableDescriptions } from "../../lib/variableDescriptions";
import { documentHighlightClassName } from "../../lib/variableHighlight";
import { resolveVariableTooltip, type VariableUnitMetadata } from "../../lib/unitMeta";

function BoundaryVariableButton({
  currentValues,
  highlightedVariable = null,
  name,
  onInspectVariable,
  parameterNames,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  name: string;
  onInspectVariable?(variableName: string): void;
  parameterNames: Set<string>;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const tokenClass = classifyVariableToken(name, parameterNames);
  const label = (
    <InstantTooltip
      tooltip={resolveVariableTooltip({
        name,
        variableDescriptions,
        variableUnitMetadata,
        currentValues
      })}
    >
      <span className={`variable-label-inline ${tokenClass}`}>
        <VariableMathLabel name={name} />
      </span>
    </InstantTooltip>
  );

  if (!onInspectVariable) {
    return <span className={`section-boundary-variable-label ${tokenClass}`}>{label}</span>;
  }

  return (
    <button
      type="button"
      className={documentHighlightClassName(
        name,
        highlightedVariable,
        `result-variable-button section-boundary-variable-button ${tokenClass}`
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
    parameterNames: Set<string>;
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
        parameterNames={args.parameterNames}
        variableDescriptions={args.variableDescriptions}
        variableUnitMetadata={args.variableUnitMetadata}
      />
    );
    return nodes;
  });
}

export function SectionBoundarySignatureView({
  boundary,
  collapsible = false,
  currentValues,
  highlightedVariable = null,
  isCollapsed = false,
  onInspectVariable,
  onToggleCollapse,
  parameterNames = new Set<string>(),
  variableDescriptions,
  variableUnitMetadata
}: {
  boundary: SectionBoundarySignature;
  collapsible?: boolean;
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  isCollapsed?: boolean;
  onInspectVariable?(variableName: string): void;
  onToggleCollapse?(): void;
  parameterNames?: Set<string>;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const variableArgs = {
    currentValues,
    highlightedVariable,
    onInspectVariable,
    parameterNames,
    variableDescriptions,
    variableUnitMetadata
  };

  const handleToggle = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    if (!collapsible || !onToggleCollapse) {
      return;
    }
    if ("target" in event) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".section-boundary-variable-button, .section-boundary-variable-label")
      ) {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    onToggleCollapse();
  };

  return (
    <div
      className={[
        "section-boundary-signature",
        collapsible ? "is-collapsible" : "",
        collapsible && isCollapsed ? "is-collapsed" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      aria-expanded={collapsible ? !isCollapsed : undefined}
      role={collapsible ? "button" : undefined}
      tabIndex={collapsible ? 0 : undefined}
      title={
        collapsible ? (isCollapsed ? "Expand section equations" : "Collapse section equations") : undefined
      }
      onClick={collapsible ? handleToggle : undefined}
      onKeyDown={
        collapsible
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                handleToggle(event);
              }
            }
          : undefined
      }
    >
      {collapsible ? (
        <span className="section-boundary-toggle-icon" aria-hidden="true">
          {isCollapsed ? "▸" : "▾"}
        </span>
      ) : null}
      <span className="section-boundary-signature-body">
        {renderVariableList(boundary.outputs, variableArgs)}
        <span className="section-boundary-signature-separator"> = </span>
        <span className="formula-function">{boundary.functionName}</span>
        <span className="section-boundary-signature-separator"> (</span>
        {renderVariableList(boundary.inputs, variableArgs)}
        <span className="section-boundary-signature-separator">)</span>
      </span>
    </div>
  );
}
