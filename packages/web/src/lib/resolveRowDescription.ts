import { getVariableDescription, type VariableDescriptions } from "./variableDescriptions";

export function resolveStoredOrDerivedDescription(
  storedDesc: string | undefined,
  variableName: string,
  variableDescriptions: VariableDescriptions
): string {
  const trimmedStored = storedDesc?.trim();
  if (trimmedStored) {
    return trimmedStored;
  }

  return getVariableDescription(variableDescriptions, variableName)?.trim() ?? "";
}
