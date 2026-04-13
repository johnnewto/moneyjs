import type { ReactNode } from "react";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import { formatVariableTooltip, type VariableUnitMetadata } from "../lib/unitMeta";
import { getVariableUnitLabel } from "../lib/units";
import { InstantTooltip } from "./InstantTooltip";

interface VariableLabelProps {
  children?: ReactNode;
  className?: string;
  description?: string;
  name: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function VariableLabel({
  children,
  className,
  description,
  name,
  variableDescriptions,
  variableUnitMetadata
}: VariableLabelProps) {
  const normalizedName = name.trim();
  const tooltip = formatVariableTooltip(
    description ?? (normalizedName ? variableDescriptions?.get(normalizedName) : undefined),
    normalizedName ? variableUnitMetadata?.get(normalizedName) : undefined
  );
  const unitLabel = normalizedName ? getVariableUnitLabel(variableUnitMetadata ?? new Map(), normalizedName) : null;

  return (
    <InstantTooltip className={className} tooltip={tooltip}>
      <span className="variable-label-inline">
        <span>{children ?? name}</span>
        {unitLabel ? <span className="unit-badge">{unitLabel}</span> : null}
      </span>
    </InstantTooltip>
  );
}
