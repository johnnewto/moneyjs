import type { RowComment } from "@sfcr/notebook-core";

import type { useInlineCommentRowEdit } from "../useInlineCommentRowEdit";
import { NotebookRowComment } from "./NotebookRowComment";

export function CommentRowReadView({
  commentEdit,
  index,
  onCancelDataRowEdit,
  onContextMenu,
  row
}: {
  commentEdit: ReturnType<typeof useInlineCommentRowEdit<unknown>>;
  index: number;
  onCancelDataRowEdit(): void;
  onContextMenu(event: React.MouseEvent<HTMLDivElement>, rowIndex: number): void;
  row: RowComment;
}) {
  return (
    <NotebookRowComment
      key={row.id}
      draftText={commentEdit.draftText}
      isEditing={commentEdit.editingCommentId === row.id}
      text={row.text}
      validationError={commentEdit.validationError}
      onApplyEdit={commentEdit.applyRowEdit}
      onBeginEdit={() => {
        onCancelDataRowEdit();
        commentEdit.beginRowEdit(row.id);
      }}
      onCancelEdit={commentEdit.cancelRowEdit}
      onContextMenu={(event) => {
        if (commentEdit.editingCommentId === row.id) {
          return;
        }
        onContextMenu(event, index);
      }}
      onDraftTextChange={commentEdit.setDraftText}
    />
  );
}
