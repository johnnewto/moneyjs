import { useCallback, useState } from "react";

import { isRowComment, normalizeRowCommentText, type RowComment } from "@sfcr/notebook-core";

import { patchCommentInRows, validateCommentDraftText } from "./rowCommentHelpers";

export function useInlineCommentRowEdit<TRow>({
  onChangeRows,
  rows
}: {
  onChangeRows(next: (TRow | RowComment)[]): void;
  rows: (TRow | RowComment)[];
}) {
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const cancelRowEdit = useCallback(() => {
    setEditingCommentId(null);
    setDraftText("");
    setValidationError(null);
  }, []);

  const beginRowEdit = useCallback(
    (commentId: string) => {
      const comment = rows.find((row) => isRowComment(row) && row.id === commentId);
      if (!comment || !isRowComment(comment)) {
        return;
      }

      setEditingCommentId(commentId);
      setDraftText(comment.text);
      setValidationError(null);
    },
    [rows]
  );

  const applyRowEdit = useCallback(() => {
    if (!editingCommentId) {
      return;
    }

    const error = validateCommentDraftText(draftText);
    if (error) {
      setValidationError(error);
      return;
    }

    const comment = rows.find((row) => isRowComment(row) && row.id === editingCommentId);
    if (comment && isRowComment(comment) && normalizeRowCommentText(draftText) === comment.text.trim()) {
      cancelRowEdit();
      return;
    }

    onChangeRows(patchCommentInRows(rows, editingCommentId, draftText));
    cancelRowEdit();
  }, [cancelRowEdit, draftText, editingCommentId, onChangeRows, rows]);

  return {
    applyRowEdit,
    beginRowEdit,
    cancelRowEdit,
    draftText,
    editingCommentId,
    setDraftText,
    validationError
  };
}
