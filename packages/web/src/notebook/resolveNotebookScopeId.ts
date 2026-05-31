import { isNotebookTemplateId } from "./templates";
import type { NotebookDocument } from "./types";
import type { NotebookTemplateId } from "./templates";

/** Stable browser-local scope for matrix UI prefs and similar per-notebook state. */
export function resolveNotebookScopeId(args: {
  activeVariantId: string | null;
  document: Pick<NotebookDocument, "id" | "metadata">;
  currentTemplateId: NotebookTemplateId | "";
}): string {
  const variantId = args.activeVariantId?.trim();
  if (variantId) {
    return `variant:${variantId}`;
  }

  const templateId = args.currentTemplateId || args.document.metadata.template;
  if (templateId && isNotebookTemplateId(templateId)) {
    return `template:${templateId}`;
  }

  const documentId = args.document.id?.trim();
  if (documentId) {
    return `doc:${documentId}`;
  }

  return "notebook:anonymous";
}
