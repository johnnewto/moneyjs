import type { ReactNode } from "react";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import { InstantTooltip } from "./InstantTooltip";

interface VariableLabelProps {
  children?: ReactNode;
  className?: string;
  description?: string;
  name: string;
  variableDescriptions?: VariableDescriptions;
}

export function VariableLabel({
  children,
  className,
  description,
  name,
  variableDescriptions
}: VariableLabelProps) {
  const normalizedName = name.trim();
  const tooltip = description ?? (normalizedName ? variableDescriptions?.get(normalizedName) : undefined);

  return (
    <InstantTooltip className={className} tooltip={tooltip}>
      {children ?? name}
    </InstantTooltip>
  );
}
