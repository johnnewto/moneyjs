import { previewNotebookPatch as previewPatch, type NotebookPatch } from "../notebookPatch";
import type { NotebookAssistantSnapshot } from "./types";
import { summarizeNotebookPatchResult } from "./shared";

export function explainNotebookPatch(snapshot: NotebookAssistantSnapshot, patch: NotebookPatch) {
  const result = previewPatch(snapshot.document, patch);
  const summary = summarizeNotebookPatchResult(result);
  const actionParts = [];

  if (summary.summary.addedCells > 0) {
    actionParts.push(`adds ${summary.summary.addedCells} cell${summary.summary.addedCells === 1 ? "" : "s"}`);
  }
  if (summary.summary.changedCells > 0) {
    actionParts.push(`changes ${summary.summary.changedCells} cell${summary.summary.changedCells === 1 ? "" : "s"}`);
  }
  if (summary.summary.removedCells > 0) {
    actionParts.push(`removes ${summary.summary.removedCells} cell${summary.summary.removedCells === 1 ? "" : "s"}`);
  }

  const actionText = actionParts.length > 0 ? actionParts.join(", ") : "does not change notebook cells";
  const validationText = summary.ok
    ? "The patch is valid against the notebook schema and reference checks."
    : `The patch is not valid: ${summary.issues.map((issue) => issue.message).join("; ")}`;

  return {
    ...summary,
    explanation: `This patch ${actionText}. ${validationText}`
  };
}


