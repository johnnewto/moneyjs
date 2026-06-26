import {
  isRowComment,
  normalizeRowCommentText,
  normalizeSectionCommentText,
  type RowComment,
  validateSectionCommentText
} from "@sfcr/notebook-core";

export function newRowComment(): RowComment {
  return {
    id: `comment-${crypto.randomUUID()}`,
    kind: "comment",
    text: ""
  };
}

export function patchCommentInRows<TRow>(
  rows: readonly (TRow | RowComment)[],
  commentId: string,
  text: string
): (TRow | RowComment)[] {
  return rows.map((row) =>
    isRowComment(row) && row.id === commentId
      ? { ...row, text: normalizeSectionCommentText(normalizeRowCommentText(text)) }
      : row
  );
}

export function validateCommentDraftText(text: string): string | null {
  return validateSectionCommentText(text);
}
