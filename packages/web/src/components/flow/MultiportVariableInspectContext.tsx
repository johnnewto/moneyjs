import { createContext, useContext, type ReactNode } from "react";

import type { VariableUnitMetadata } from "../../lib/unitMeta";
import type { VariableDescriptions } from "../../lib/variableDescriptions";

export interface MultiportVariableInspectContextValue {
  currentValues: Record<string, number | undefined>;
  highlightedVariable: string | null;
  onSelectVariable?: (variableName: string) => void;
  parameterNames: Set<string>;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
}

const MultiportVariableInspectContext = createContext<MultiportVariableInspectContextValue | null>(
  null
);

export function MultiportVariableInspectProvider({
  children,
  value
}: {
  children: ReactNode;
  value: MultiportVariableInspectContextValue;
}) {
  return (
    <MultiportVariableInspectContext.Provider value={value}>
      {children}
    </MultiportVariableInspectContext.Provider>
  );
}

export function useMultiportVariableInspect(): MultiportVariableInspectContextValue | null {
  return useContext(MultiportVariableInspectContext);
}
