import { equationOutputVariable } from "@sfcr/core";

import { isRowComment } from "@sfcr/notebook-core";

import type { EquationListItem, ExternalListItem } from "@sfcr/notebook-core";

import type { EquationRow, ExternalRow } from "./editorModel";

export type VariableDescriptions = Map<string, string>;

export function buildVariableDescriptions(args: {
  equations?: readonly (EquationRow | EquationListItem)[];
  externals?: readonly (ExternalRow | ExternalListItem)[];
}): VariableDescriptions {
  const descriptions: VariableDescriptions = new Map();

  for (const equation of args.equations ?? []) {
    if (isRowComment(equation)) {
      continue;
    }
    setVariableDescription(descriptions, equation.name, equation.desc);
    // Transformed/derivative LHS forms (d(stock), TSDELTALOG(x,n), ...) define an
    // inner variable; mirror the description onto it so hints/inspector resolve it.
    const outputName = equationOutputVariable(equation.name);
    if (outputName && outputName !== equation.name.trim()) {
      setVariableDescription(descriptions, outputName, equation.desc);
    }
  }

  for (const external of args.externals ?? []) {
    if (isRowComment(external)) {
      continue;
    }
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
