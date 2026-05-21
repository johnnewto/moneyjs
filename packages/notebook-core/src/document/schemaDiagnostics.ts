import type { NotebookValidationIssue } from "../validation";
import { type NotebookSourceDiagnostic, type NotebookSourceFormat } from "./sourcePipeline";
import { escapeRegExp, offsetToLineColumn } from "./documentUtils";

export function formatLabelForSourceFormat(format: NotebookSourceFormat): "JSON" | "Markdown" | "YAML" {
  if (format === "json") {
    return "JSON";
  }
  if (format === "yaml") {
    return "YAML";
  }
  return "Markdown";
}

export function locateSchemaDiagnosticInSource(
  source: string,
  format: NotebookSourceFormat,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  if (format === "json") {
    return locateJsonSchemaDiagnostic(source, issue, allIssues);
  }
  if (format === "yaml") {
    return locateYamlSchemaDiagnostic(source, issue, allIssues);
  }

  return {};
}

export function locateYamlSchemaDiagnostic(
  source: string,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  const targetPath = buildSchemaTargetPath(issue, allIssues);
  const targetKey =
    (targetPath.length > 0 && typeof targetPath[targetPath.length - 1] === "string"
      ? (targetPath[targetPath.length - 1] as string)
      : undefined) ?? issue.relatedProperty;
  if (!targetKey) {
    return {};
  }

  const keyPattern = new RegExp(`(^|\\n)\\s*(?:${escapeRegExp(targetKey)}|["']${escapeRegExp(targetKey)}["'])\\s*:`, "m");
  const match = source.match(keyPattern);
  if (!match || match.index == null) {
    return {};
  }

  const offset = match.index + match[1].length + match[0].slice(match[1].length).search(/\S/);
  const keyLength = targetKey.length;
  const position = offsetToLineColumn(source, offset);
  return {
    column: position.column,
    endOffset: offset + keyLength,
    line: position.line,
    offset
  };
}

export function looksLikeYamlNotebookSource(source: string): boolean {
  return /^(?:---\s*\n)?\s*(?:format|id|title|metadata|cells)\s*:/m.test(source);
}

export function locateJsonSchemaDiagnostic(
  source: string,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  const targetPath = buildSchemaTargetPath(issue, allIssues);
  const targetKey =
    (targetPath.length > 0 && typeof targetPath[targetPath.length - 1] === "string"
      ? (targetPath[targetPath.length - 1] as string)
      : undefined) ?? issue.relatedProperty;
  if (!targetKey) {
    return {};
  }

  const keyToken = `"${targetKey}"`;
  const offset = source.indexOf(keyToken);
  if (offset < 0) {
    return {};
  }

  const position = offsetToLineColumn(source, offset);
  return {
    column: position.column,
    endOffset: offset + keyToken.length,
    line: position.line,
    offset
  };
}

export function buildSchemaTargetPath(issue: NotebookValidationIssue, allIssues: NotebookValidationIssue[]): unknown[] {
  const path = parseNotebookIssuePath(issue.path);
  const relatedProperty = resolveSchemaRelatedProperty(issue, allIssues);
  if (issue.keyword === "required" && !relatedProperty) {
    return path;
  }
  if (relatedProperty) {
    return [...path, relatedProperty];
  }
  return path;
}

export function resolveSchemaRelatedProperty(
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): string | undefined {
  if (issue.keyword !== "required") {
    return issue.relatedProperty;
  }

  const expectedProperty = issue.relatedProperty;
  if (!expectedProperty) {
    return undefined;
  }

  const siblingAdditionalProperty = allIssues.find(
    (candidate) =>
      candidate !== issue &&
      candidate.keyword === "additionalProperties" &&
      candidate.path === issue.path &&
      isLikelyMisspelledProperty(expectedProperty, candidate.relatedProperty)
  );

  return siblingAdditionalProperty?.relatedProperty ?? expectedProperty;
}

export function isLikelyMisspelledProperty(expected: string, candidate: string | undefined): boolean {
  if (!candidate) {
    return false;
  }

  if (candidate === expected) {
    return true;
  }

  if (candidate.includes(expected) || expected.includes(candidate)) {
    return true;
  }

  return levenshteinDistance(expected, candidate) <= 2;
}

export function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][columns - 1];
}

export function parseNotebookIssuePath(path: string | undefined): unknown[] {
  if (!path || path === "/") {
    return [];
  }

  return path
    .split("/")
    .slice(1)
    .map((segment) => decodeJsonPointerSegment(segment))
    .map((segment) => (/^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment));
}

export function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
