import type {
  EquationListItem,
  ExternalListItem,
  RowComment,
  SectionBoundarySignature
} from "@sfcr/notebook-core";
import { resolveInferredSectionBoundary } from "@sfcr/notebook-core";

import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../../lib/unitMeta";
import type { useInlineCommentRowEdit } from "../useInlineCommentRowEdit";
import { NotebookRowComment } from "./NotebookRowComment";

export function CommentRowReadView({
  commentEdit,
  currentValues,
  equations = [],
  externals = [],
  highlightedVariable = null,
  index,
  inferredBoundary = null,
  onCancelDataRowEdit,
  onContextMenu,
  onInspectVariable,
  onToggleSectionCollapse,
  parameterNames,
  row,
  sectionCollapsible = false,
  sectionCollapsed = false,
  variableDescriptions,
  variableUnitMetadata
}: {
  commentEdit: ReturnType<typeof useInlineCommentRowEdit<unknown>>;
  currentValues?: Record<string, number | undefined>;
  equations?: readonly EquationListItem[];
  externals?: readonly ExternalListItem[];
  highlightedVariable?: string | null;
  inferredBoundary?: SectionBoundarySignature | null;
  index: number;
  onCancelDataRowEdit(): void;
  onContextMenu(event: React.MouseEvent<HTMLDivElement>, rowIndex: number): void;
  onInspectVariable?(variableName: string): void;
  onToggleSectionCollapse?(): void;
  parameterNames?: Set<string>;
  sectionCollapsible?: boolean;
  sectionCollapsed?: boolean;
  row: RowComment;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const resolvedBoundary =
    inferredBoundary ??
    resolveInferredSectionBoundary({
      comment: row,
      equations,
      externals
    });

  return (
    <NotebookRowComment
      key={row.id}
      currentValues={currentValues}
      draftText={commentEdit.draftText}
      inferredBoundary={resolvedBoundary}
      highlightedVariable={highlightedVariable}
      isEditing={commentEdit.editingCommentId === row.id}
      parameterNames={parameterNames}
      sectionCollapsible={sectionCollapsible}
      sectionCollapsed={sectionCollapsed}
      text={row.text}
      validationError={commentEdit.validationError}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
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
      onInspectVariable={onInspectVariable}
      onToggleSectionCollapse={onToggleSectionCollapse}
    />
  );
}
