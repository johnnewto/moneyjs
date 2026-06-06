import {
  normalizeRowCommentText,
  parseSectionCommentText,
  type SectionBoundarySignature
} from "@sfcr/notebook-core";

import type { VariableDescriptions } from "../../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../../lib/unitMeta";

import { CommentRowInlineEditor } from "./CommentRowInlineEditor";
import { RowCommentMarkdown } from "./RowCommentMarkdown";
import { SectionBoundarySignatureView } from "./SectionBoundarySignatureView";

export function NotebookRowComment({
  draftText,
  isEditing = false,
  mode = "read",
  text,
  validationError = null,
  onApplyEdit,
  onBeginEdit,
  onCancelEdit,
  onContextMenu,
  onDraftTextChange,
  inferredBoundary = null,
  onInspectVariable,
  onTextChange,
  onToggleSectionCollapse,
  currentValues,
  highlightedVariable = null,
  parameterNames,
  sectionCollapsible = false,
  sectionCollapsed = false,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  draftText?: string;
  inferredBoundary?: SectionBoundarySignature | null;
  highlightedVariable?: string | null;
  isEditing?: boolean;
  mode?: "grid" | "read";
  parameterNames?: Set<string>;
  sectionCollapsible?: boolean;
  sectionCollapsed?: boolean;
  text: string;
  validationError?: string | null;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
  onApplyEdit?(): void;
  onBeginEdit?(): void;
  onCancelEdit?(): void;
  onContextMenu?(event: React.MouseEvent<HTMLDivElement>): void;
  onDraftTextChange?(value: string): void;
  onInspectVariable?(variableName: string): void;
  onTextChange?(value: string): void;
  onToggleSectionCollapse?(): void;
}) {
  if (mode === "grid") {
    return (
      <div
        className="notebook-model-view-row notebook-model-view-row-comment notebook-model-view-row-comment-grid"
        role="row"
        onContextMenu={onContextMenu}
      >
        <div className="notebook-model-view-row-comment-grid-body" role="cell">
          <label className="notebook-model-view-row-comment-editor">
            <span className="notebook-model-view-row-comment-editor-label">Section</span>
            <input
              aria-label="Section comment"
              className="notebook-model-view-row-comment-input"
              placeholder="Section title"
              value={text}
              onChange={(event) => onTextChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onTextChange?.(text);
                }
              }}
            />
          </label>
          {inferredBoundary ? (
            <SectionBoundarySignatureView
              boundary={inferredBoundary}
              currentValues={currentValues}
              highlightedVariable={highlightedVariable}
              parameterNames={parameterNames}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
              onInspectVariable={onInspectVariable}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (isEditing) {
    const hasDraftChanges =
      normalizeRowCommentText(draftText ?? "") !== normalizeRowCommentText(text);

    return (
      <div
        className="notebook-model-view-row notebook-model-view-row-editing notebook-model-view-row-section"
        role="row"
      >
        <div className="notebook-model-view-row-editor-cell" role="cell">
          <CommentRowInlineEditor
            draftText={draftText ?? ""}
            hasDraftChanges={hasDraftChanges}
            validationError={validationError}
            onApply={() => onApplyEdit?.()}
            onCancel={() => onCancelEdit?.()}
            onDraftTextChange={(value) => onDraftTextChange?.(value)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="notebook-model-view-row notebook-model-view-row-comment notebook-model-view-row-section"
      role="row"
      title="Double-click to edit"
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onBeginEdit?.();
      }}
    >
      <div className="notebook-model-view-row-comment-text" role="cell">
        <SectionCommentReadView
          currentValues={currentValues}
          highlightedVariable={highlightedVariable}
          inferredBoundary={inferredBoundary}
          parameterNames={parameterNames}
          sectionCollapsible={sectionCollapsible}
          sectionCollapsed={sectionCollapsed}
          text={text}
          variableDescriptions={variableDescriptions}
          variableUnitMetadata={variableUnitMetadata}
          onInspectVariable={onInspectVariable}
          onToggleSectionCollapse={onToggleSectionCollapse}
        />
      </div>
    </div>
  );
}

function SectionCommentReadView({
  currentValues,
  highlightedVariable = null,
  inferredBoundary = null,
  onInspectVariable,
  onToggleSectionCollapse,
  parameterNames,
  sectionCollapsible = false,
  sectionCollapsed = false,
  text,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  inferredBoundary?: SectionBoundarySignature | null;
  onInspectVariable?(variableName: string): void;
  onToggleSectionCollapse?(): void;
  parameterNames?: Set<string>;
  sectionCollapsible?: boolean;
  sectionCollapsed?: boolean;
  text: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const title = parseSectionCommentText(text).title;
  if (!title && !inferredBoundary) {
    return null;
  }

  return (
    <div className="section-comment-read-view">
      {title ? <RowCommentMarkdown text={title} /> : null}
      {inferredBoundary ? (
        <SectionBoundarySignatureView
          boundary={inferredBoundary}
          collapsible={sectionCollapsible}
          currentValues={currentValues}
          highlightedVariable={highlightedVariable}
          isCollapsed={sectionCollapsed}
          parameterNames={parameterNames}
          variableDescriptions={variableDescriptions}
          variableUnitMetadata={variableUnitMetadata}
          onInspectVariable={onInspectVariable}
          onToggleCollapse={onToggleSectionCollapse}
        />
      ) : null}
    </div>
  );
}
