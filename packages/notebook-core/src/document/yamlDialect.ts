import { createNotebookSourceDiagnostic, type NotebookSourceDiagnostic } from "./sourcePipeline";
import { offsetToLineColumn } from "./documentUtils";

export function validateYamlDialectSource(source: string): NotebookSourceDiagnostic | null {
  let lineOffset = 0;
  for (const line of source.split(/\n/)) {
    const lineWithoutQuotedText = stripYamlQuotedText(line);
    const forbiddenMatch = lineWithoutQuotedText.match(/^(\s*)(?:<<\s*:|[^#]*\s[&*][A-Za-z0-9_-]+(?:\s|$))/);
    if (forbiddenMatch?.index != null) {
      const offset = lineOffset + forbiddenMatch[1].length;
      const position = offsetToLineColumn(source, offset);
      return createNotebookSourceDiagnostic({
        column: position.column,
        line: position.line,
        message: "Notebook YAML does not allow anchors, aliases, or merge keys.",
        offset,
        phase: "parse"
      });
    }
    lineOffset += line.length + 1;
  }

  return null;
}

export function stripYamlQuotedText(line: string): string {
  let result = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of line) {
    if (quote) {
      if (quote === '"' && char === "\\" && !escaped) {
        escaped = true;
        result += " ";
        continue;
      }
      if (char === quote && !escaped) {
        quote = null;
      }
      escaped = false;
      result += " ";
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += " ";
      continue;
    }

    result += char;
  }

  return result;
}

export function buildYamlParseDiagnostic(source: string, error: unknown): NotebookSourceDiagnostic {
  const yamlError = error as { linePos?: Array<{ col: number; line: number }>; message?: string; pos?: [number, number] };
  const offset = typeof yamlError.pos?.[0] === "number" ? yamlError.pos[0] : undefined;
  const linePosition = yamlError.linePos?.[0];
  const offsetPosition = offset == null ? null : offsetToLineColumn(source, offset);
  const position = linePosition
    ? { column: linePosition.col, line: linePosition.line }
    : offsetPosition;
  return createNotebookSourceDiagnostic({
    column: position?.column,
    endOffset: typeof yamlError.pos?.[1] === "number" ? yamlError.pos[1] : undefined,
    line: position?.line,
    message: `Notebook YAML parse failed: ${yamlError.message ?? "Unable to parse YAML notebook source."}`,
    offset,
    phase: "parse"
  });
}
