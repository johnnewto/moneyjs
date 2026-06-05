import { isRecord, slugifyIdentifier, stringValue } from "./document/documentUtils";
import { sectionCommentSlugSource } from "./sectionBoundary";
import type { RowComment } from "./types";

export type { RowComment } from "./types";

export function isRowComment(row: unknown): row is RowComment {
  return isRecord(row) && row.kind === "comment" && typeof row.text === "string";
}

export function normalizeRowCommentText(raw: string): string {
  return raw.trim();
}

export function formatCompactRowCommentText(text: string): string {
  return normalizeRowCommentText(text);
}

export function assertCompactRowPresent(row: unknown, index: number, sectionLabel: string): void {
  if (row == null) {
    throw new Error(
      `${sectionLabel} row ${index + 1} is empty. Quote section comments so YAML does not treat them as comments, for example: - "Section title".`
    );
  }
}

function rowCommentId(idPrefix: string, index: number, text: string, explicitId?: string): string {
  if (explicitId?.trim()) {
    return explicitId.trim();
  }
  const slug = slugifyIdentifier(sectionCommentSlugSource(text)) || "section";
  return `${idPrefix}-${index}-${slug}`;
}

export function parseCompactRowComment(row: unknown, index: number, idPrefix: string): RowComment | null {
  if (typeof row === "string") {
    const text = normalizeRowCommentText(row);
    return {
      id: rowCommentId(idPrefix, index, text),
      kind: "comment",
      text
    };
  }

  if (!isRecord(row)) {
    return null;
  }

  if (row.kind === "comment") {
    const text = normalizeRowCommentText(stringValue(row.text ?? row.comment, ""));
    return {
      id: rowCommentId(idPrefix, index, text, stringValue(row.id, "")),
      kind: "comment",
      text
    };
  }

  if (typeof row.comment === "string") {
    const text = normalizeRowCommentText(row.comment);
    return {
      id: rowCommentId(idPrefix, index, text, stringValue(row.id, "")),
      kind: "comment",
      text
    };
  }

  return null;
}

export function buildCompactRowComment(comment: RowComment): string | Record<string, unknown> {
  const text = formatCompactRowCommentText(comment.text);
  if (!text) {
    return {
      id: comment.id,
      kind: "comment",
      text: ""
    };
  }
  return text;
}

export function equationRowsOnly<T extends { name: string }>(items: readonly (T | RowComment)[]): T[] {
  return items.filter((item): item is T => !isRowComment(item));
}

export function externalRowsOnly<T extends { name: string }>(items: readonly (T | RowComment)[]): T[] {
  return items.filter((item): item is T => !isRowComment(item));
}

export function initialValueRowsOnly<T extends { name: string }>(items: readonly (T | RowComment)[]): T[] {
  return items.filter((item): item is T => !isRowComment(item));
}

export function countDataRows(items: readonly unknown[]): number {
  return items.filter((item) => !isRowComment(item)).length;
}
