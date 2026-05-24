import {
  derivativeBalanceStockName,
  equationDefinesVariable,
  equationOutputVariable
} from "@sfcr/core";

export function canonicalVariableName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }

  const bracketLagMatch = /^(.+?)(\[-\d+\])+$/u.exec(trimmed);
  if (bracketLagMatch?.[1]) {
    return equationOutputVariable(bracketLagMatch[1]);
  }

  return equationOutputVariable(trimmed);
}

export function variableMatchesHighlight(
  mentionName: string,
  highlightedVariable: string | null | undefined
): boolean {
  if (!highlightedVariable) {
    return false;
  }

  const mention = mentionName.trim();
  const highlighted = highlightedVariable.trim();
  if (!mention || !highlighted) {
    return false;
  }

  if (mention === highlighted) {
    return true;
  }

  if (equationDefinesVariable(mention, highlighted)) {
    return true;
  }

  if (equationOutputVariable(mention) === highlighted) {
    return true;
  }

  if (derivativeBalanceStockName(mention) === highlighted) {
    return true;
  }

  if (canonicalVariableName(mention) === highlighted) {
    return true;
  }

  return false;
}

export function documentHighlightClassName(
  mentionName: string,
  highlightedVariable: string | null | undefined,
  baseClassName: string
): string {
  return variableMatchesHighlight(mentionName, highlightedVariable)
    ? `${baseClassName} is-document-highlighted`
    : baseClassName;
}
