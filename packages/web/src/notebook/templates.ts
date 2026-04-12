import bmwNotebookJson from "./templates/bmw.notebook.json";
import { notebookFromJson } from "./document";
import type { NotebookDocument } from "./types";

export type NotebookTemplateId = "bmw";

export interface NotebookTemplateDefinition {
  id: NotebookTemplateId;
  label: string;
  description: string;
  document: NotebookDocument;
}

export const NOTEBOOK_TEMPLATES: Record<NotebookTemplateId, NotebookTemplateDefinition> = {
  bmw: {
    id: "bmw",
    label: "BMW",
    description: "BMW browser notebook with a baseline run, two scenarios, and accounting views.",
    document: notebookFromJson(JSON.stringify(bmwNotebookJson))
  }
};

export function createNotebookFromTemplate(
  id: NotebookTemplateId = "bmw"
): NotebookDocument {
  return structuredClone(NOTEBOOK_TEMPLATES[id].document);
}
