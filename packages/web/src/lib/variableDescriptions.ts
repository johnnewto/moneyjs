import type { EquationRow, ExternalRow } from "./editorModel";

export type VariableDescriptions = Map<string, string>;

export function buildVariableDescriptions(args: {
  equations?: EquationRow[];
  externals?: ExternalRow[];
}): VariableDescriptions {
  const descriptions: VariableDescriptions = new Map();

  for (const equation of args.equations ?? []) {
    setVariableDescription(descriptions, equation.name, equation.desc);
  }

  for (const external of args.externals ?? []) {
    setVariableDescription(descriptions, external.name, external.desc);
  }

  return descriptions;
}

export function getVariableDescription(
  descriptions: VariableDescriptions,
  variableName: string
): string | undefined {
  return descriptions.get(variableName.trim());
}

function setVariableDescription(
  descriptions: VariableDescriptions,
  variableName: string,
  description?: string
): void {
  const normalizedName = variableName.trim();
  const normalizedDescription = description?.trim();

  if (!normalizedName || !normalizedDescription || descriptions.has(normalizedName)) {
    return;
  }

  descriptions.set(normalizedName, normalizedDescription);
}
