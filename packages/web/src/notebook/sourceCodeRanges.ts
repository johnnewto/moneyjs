import {
  notebookToMarkdown,
  notebookToYaml,
  serializeNotebookCell,
  type NotebookSourceDiagnostic,
  type NotebookSourceFormat
} from "./document";
import type { NotebookDocument } from "./types";
import { stringifyJsonWithCompactLeaves } from "../lib/jsonFormat";

export interface SourceRange {
  from: number;
  to: number;
}

export function resolveDiagnosticRange(
  issue: NotebookSourceDiagnostic,
  documentLength: number
): { from: number; to: number } {
  const from = Math.max(0, Math.min(issue.offset ?? 0, documentLength));
  const desiredTo = issue.endOffset ?? from + 1;
  const to = Math.max(from + (documentLength > from ? 1 : 0), Math.min(desiredTo, documentLength));
  return { from, to };
}

export function resolveSelectedCellSourceRange(args: {
  document: NotebookDocument;
  format: NotebookSourceFormat;
  selectedCellId: string | null;
  source: string;
}): SourceRange | null {
  if (!args.selectedCellId) {
    return null;
  }

  const cell = args.document.cells.find((candidate) => candidate.id === args.selectedCellId);
  if (!cell) {
    return null;
  }

  if (args.format === "json") {
    const serializedCell = stringifyJsonWithCompactLeaves(serializeNotebookCell(cell));
    const exactMatchIndex = args.source.indexOf(serializedCell);
    if (exactMatchIndex >= 0) {
      return {
        from: exactMatchIndex,
        to: exactMatchIndex + serializedCell.length
      };
    }

    return resolveJsonCellSourceRange(args.source, cell.id);
  }

  if (args.format === "yaml") {
    const singleCellSource = notebookToYaml({
      ...args.document,
      cells: [cell]
    });
    const singleCellMatch = singleCellSource.match(/\n\s*-\s+id:\s+.+[\s\S]*$/);
    const sectionSource = singleCellMatch?.[0].trim();
    if (sectionSource) {
      const exactMatchIndex = args.source.indexOf(sectionSource);
      if (exactMatchIndex >= 0) {
        return {
          from: exactMatchIndex,
          to: exactMatchIndex + sectionSource.length
        };
      }
    }

    return resolveYamlCellSourceRange(args.source, cell.id);
  }

  const markdownSource = notebookToMarkdown({
    ...args.document,
    cells: [cell]
  });
  const sectionSource = markdownSource.replace(/^#\s+.+?\n\n/, "").trim();
  const exactMatchIndex = args.source.indexOf(sectionSource);
  if (exactMatchIndex < 0) {
    return null;
  }

  return {
    from: exactMatchIndex,
    to: exactMatchIndex + sectionSource.length
  };
}

function resolveYamlCellSourceRange(source: string, cellId: string): SourceRange | null {
  const idPattern = new RegExp(`(^|\\n)(\\s*-\\s+id:\\s+|\\s+id:\\s+)["']?${escapeRegExp(cellId)}["']?(?:\\s|$)`);
  const match = source.match(idPattern);
  if (!match || match.index == null) {
    return null;
  }

  const start = match.index + match[1].length;
  const indentMatch = match[2].match(/^(\s*)/);
  const indent = indentMatch?.[1] ?? "";
  const nextCellPattern = new RegExp(`\\n${escapeRegExp(indent)}-\\s+id:\\s+`, "g");
  nextCellPattern.lastIndex = start + match[0].length;
  const nextMatch = nextCellPattern.exec(source);
  return {
    from: start,
    to: nextMatch?.index ?? source.length
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveJsonCellSourceRange(source: string, cellId: string): SourceRange | null {
  const idToken = `"id": "${cellId}"`;
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const matchIndex = source.indexOf(idToken, searchIndex);
    if (matchIndex < 0) {
      return null;
    }

    const objectStart = findEnclosingJsonObjectStart(source, matchIndex);
    if (objectStart == null) {
      return null;
    }

    const objectEnd = findMatchingJsonObjectEnd(source, objectStart);
    if (objectEnd == null) {
      return null;
    }

    try {
      const parsed = JSON.parse(source.slice(objectStart, objectEnd + 1)) as { id?: unknown };
      if (parsed.id === cellId) {
        return {
          from: objectStart,
          to: objectEnd + 1
        };
      }
    } catch {
      // Continue searching in case the enclosing object was not the cell object.
    }

    searchIndex = matchIndex + idToken.length;
  }

  return null;
}

function findEnclosingJsonObjectStart(source: string, anchorIndex: number): number | null {
  const objectStack: number[] = [];
  let inString = false;
  let isEscaped = false;

  for (let index = 0; index < anchorIndex; index += 1) {
    const character = source[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      objectStack.push(index);
      continue;
    }

    if (character === "}") {
      objectStack.pop();
    }
  }

  return objectStack.at(-1) ?? null;
}

function findMatchingJsonObjectEnd(source: string, startIndex: number): number | null {
  let inString = false;
  let isEscaped = false;
  let depth = 0;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}
