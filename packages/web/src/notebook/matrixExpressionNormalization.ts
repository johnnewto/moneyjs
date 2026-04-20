export type NormalizedMatrixOccurrenceSign = "+" | "-" | "neutral";

export interface NormalizedMatrixOccurrence {
  displayLabel: string;
  sign: NormalizedMatrixOccurrenceSign;
  variable: string;
}

export function extractNormalizedMatrixOccurrences(expression: string): NormalizedMatrixOccurrence[] {
  const trimmed = expression.trim();
  const sign: NormalizedMatrixOccurrenceSign = trimmed.startsWith("-")
    ? "-"
    : trimmed.startsWith("+")
      ? "+"
      : "neutral";
  const normalized = trimmed.replace(/^[-+]+\s*/, "").trim();

  const deltaMatch = normalized.match(/^d\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (deltaMatch?.[1]) {
    return [{ sign, variable: deltaMatch[1], displayLabel: `d${deltaMatch[1]}` }];
  }

  const changeMatch = normalized.match(
    /^\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*-\s*(?:lag\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)|([A-Za-z_][A-Za-z0-9_]*)\s*\[-1\])\s*\)?$/i
  );
  const currentVariable = changeMatch?.[1];
  const laggedVariable = changeMatch?.[2] ?? changeMatch?.[3];
  if (currentVariable && laggedVariable && currentVariable.toLowerCase() === laggedVariable.toLowerCase()) {
    return [{ sign, variable: currentVariable, displayLabel: `d${currentVariable}` }];
  }

  const productMatch = normalized.match(
    /^(?:lag\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)|([A-Za-z_][A-Za-z0-9_]*)\s*\[-1\]|([A-Za-z_][A-Za-z0-9_]*))\s*\*\s*(?:lag\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)|([A-Za-z_][A-Za-z0-9_]*)\s*\[-1\]|([A-Za-z_][A-Za-z0-9_]*))$/i
  );
  if (productMatch) {
    const left = productMatch[1] ?? productMatch[2] ?? productMatch[3];
    const right = productMatch[4] ?? productMatch[5] ?? productMatch[6];
    if (left && right) {
      if (isRateLikeDisplayToken(left)) {
        return [{ sign, variable: right, displayLabel: `${left}*${right}` }];
      }
      if (isRateLikeDisplayToken(right)) {
        return [{ sign, variable: left, displayLabel: `${right}*${left}` }];
      }
    }
  }

  const lagMatch = normalized.match(/^lag\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (lagMatch?.[1]) {
    return [{ sign, variable: lagMatch[1], displayLabel: lagMatch[1] }];
  }

  const variableMatch = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[-1\])?$/);
  if (variableMatch?.[1]) {
    return [{ sign, variable: variableMatch[1], displayLabel: variableMatch[1] }];
  }

  return [];
}

export function buildNormalizedMatrixReferenceLabel(variable: string, expression: string): string {
  const occurrence = extractNormalizedMatrixOccurrences(expression).find(
    (entry) => entry.variable.toLowerCase() === variable.toLowerCase()
  );
  if (occurrence) {
    return occurrence.displayLabel;
  }

  return expression
    .replace(/^[-+]+\s*/, "")
    .replace(/\s+/g, "")
    .replace(/lag\(([^)]+)\)/g, "$1[-1]")
    .replace(/\[-1\]/g, "")
    .replace(/^\((.*)\)$/g, "$1");
}

function isRateLikeDisplayToken(token: string): boolean {
  return /^r[a-z]?$/i.test(token);
}