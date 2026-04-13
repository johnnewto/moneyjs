import bmwNotebookJson from "./templates/bmw.notebook.json";
import gl6DisNotebookJson from "./templates/gl6-dis.notebook.json";
import gl7InsoutNotebookJson from "./templates/gl7-insout.notebook.json";
import gl8GrowthNotebookJson from "./templates/gl8-growth.notebook.json";
import { notebookFromJson } from "./document";
import type { NotebookDocument } from "./types";

export type NotebookTemplateId = "bmw" | "gl6-dis" | "gl7-insout" | "gl8-growth";
export const DEFAULT_NOTEBOOK_TEMPLATE_ID: NotebookTemplateId = "bmw";

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
  },
  "gl6-dis": {
    id: "gl6-dis",
    label: "GL6 DIS",
    description: "DIS notebook based on the gl6-dis article baseline, matrices, and two scenarios.",
    document: notebookFromJson(JSON.stringify(gl6DisNotebookJson))
  },
  "gl7-insout": {
    id: "gl7-insout",
    label: "GL7 INSOUT",
    description:
      "INSOUT notebook based on the gl7-insout article baseline, matrices, and selected scenario experiments.",
    document: notebookFromJson(JSON.stringify(gl7InsoutNotebookJson))
  },
  "gl8-growth": {
    id: "gl8-growth",
    label: "GL8 GROWTH",
    description:
      "GROWTH notebook based on the gl8-growth article baseline, accounting matrices, and selected policy experiments.",
    document: notebookFromJson(JSON.stringify(gl8GrowthNotebookJson))
  }
};

export function createNotebookFromTemplate(
  id: NotebookTemplateId = DEFAULT_NOTEBOOK_TEMPLATE_ID
): NotebookDocument {
  return structuredClone(NOTEBOOK_TEMPLATES[id].document);
}

export function isNotebookTemplateId(value: string): value is NotebookTemplateId {
  return value in NOTEBOOK_TEMPLATES;
}
