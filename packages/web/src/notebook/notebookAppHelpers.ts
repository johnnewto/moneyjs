import { buildVariableDescriptions, type VariableDescriptions } from "../lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../lib/units";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import {
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  isNotebookTemplateId,
  type NotebookTemplateId
} from "./templates";
import type { NotebookCell } from "./types";

const APP_BASE_URL = import.meta.env.BASE_URL;

export const NOTEBOOK_AI_INDEX_URL = resolveAppHref(".well-known/sfcr.json");
export const NOTEBOOK_AI_LANDING_URL = resolveAppHref("ai/index.html");
export const NOTEBOOK_AI_GUIDE_URL = resolveAppHref("notebook-guide.md");
export const NOTEBOOK_AI_MANIFEST_URL = resolveAppHref(".well-known/sfcr-notebook-guide.json");
export const NOTEBOOK_AI_SCHEMA_URL = resolveAppHref("sfcr-notebook.schema.json");
export const NOTEBOOK_AI_PROMPT_URL = resolveAppHref("ai-prompts/create-sfcr-notebook.md");

export function buildNotebookVariableDescriptions(cells: NotebookCell[]): VariableDescriptions {
  const descriptions: VariableDescriptions = new Map();

  for (const cell of cells) {
    const nextDescriptions =
      cell.type === "model"
        ? buildVariableDescriptions({
            equations: cell.editor.equations,
            externals: cell.editor.externals
          })
        : cell.type === "equations"
          ? buildVariableDescriptions({ equations: cell.equations })
          : cell.type === "externals"
            ? buildVariableDescriptions({ externals: cell.externals })
            : null;

    for (const [name, description] of nextDescriptions ?? []) {
      if (!descriptions.has(name)) {
        descriptions.set(name, description);
      }
    }
  }

  return descriptions;
}

export function buildNotebookVariableUnitMetadata(cells: NotebookCell[]): VariableUnitMetadata {
  const metadata: VariableUnitMetadata = new Map();

  for (const cell of cells) {
    const nextMetadata =
      cell.type === "model"
        ? buildVariableUnitMetadata({
            equations: cell.editor.equations,
            externals: cell.editor.externals
          })
        : cell.type === "equations"
          ? buildVariableUnitMetadata({ equations: cell.equations })
          : cell.type === "externals"
            ? buildVariableUnitMetadata({ externals: cell.externals })
            : null;

    for (const [name, unitMeta] of nextMetadata ?? []) {
      if (!metadata.has(name)) {
        metadata.set(name, unitMeta);
      }
    }
  }

  return metadata;
}

export function formatElapsedTime(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)} s`;
}

export function resolveNotebookTemplateIdFromHash(hash: string): NotebookTemplateId {
  return parseNotebookTemplateIdFromHash(hash) ?? DEFAULT_NOTEBOOK_TEMPLATE_ID;
}

export function parseNotebookTemplateIdFromHash(hash: string): NotebookTemplateId | null {
  const match = hash.match(/^#\/notebook\/([^/?#]+)/);
  const candidate = match?.[1]?.trim();
  return candidate && isNotebookTemplateId(candidate) ? candidate : null;
}

export function writeNotebookHash(templateId?: NotebookTemplateId): void {
  const nextHash = templateId ? `#/notebook/${templateId}` : "#/notebook";
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function resolveAppHref(path: string): string {
  return `${APP_BASE_URL}${path.replace(/^\/+/, "")}`;
}
