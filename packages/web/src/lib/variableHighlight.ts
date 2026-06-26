import {
  derivativeBalanceStockName,
  equationDefinesVariable,
  equationOutputVariable
} from "@sfcr/core";

function canonicalVariableName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }

  const bracketLagMatch = /^(.+?)(\[-\d+\])+$/u.exec(trimmed);
  if (bracketLagMatch?.[1]) {
    return equationOutputVariable(bracketLagMatch[1]);
  }

  const primeLagMatch = /^(.+)'$/u.exec(trimmed);
  if (primeLagMatch?.[1]) {
    return equationOutputVariable(primeLagMatch[1]);
  }

  return equationOutputVariable(trimmed);
}

function variableMatchesHighlight(
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

export function normalizeMatrixHighlightKey(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function matrixSourceMatchesHighlight(
  source: string,
  highlightedVariable: string | null | undefined
): boolean {
  if (!highlightedVariable?.trim()) {
    return false;
  }

  const normalizedSource = normalizeMatrixHighlightKey(source);
  const normalizedHighlight = normalizeMatrixHighlightKey(highlightedVariable);
  if (!normalizedSource || !normalizedHighlight) {
    return false;
  }

  return normalizedSource === normalizedHighlight;
}

export function documentMentionMatchesHighlight(
  mentionName: string,
  highlightedVariable: string | null | undefined
): boolean {
  return (
    variableMatchesHighlight(mentionName, highlightedVariable) ||
    matrixSourceMatchesHighlight(mentionName, highlightedVariable)
  );
}

export function documentHighlightClassName(
  mentionName: string,
  highlightedVariable: string | null | undefined,
  baseClassName: string
): string {
  return documentMentionMatchesHighlight(mentionName, highlightedVariable)
    ? `${baseClassName} is-document-highlighted`
    : baseClassName;
}
