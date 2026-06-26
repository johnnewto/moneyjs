import { parseNotebookSource } from "./document";
import {
  isNotebookTemplateId,
  loadNotebookTemplate,
  NOTEBOOK_TEMPLATES,
  type NotebookTemplateId
} from "./templates";
import type { NotebookDocument } from "./types";
import { serializeNotebookSource, stripNotebookFileExtension } from "./notebookSourceWorkflow";

export const NOTEBOOK_VARIANT_INDEX_STORAGE_KEY = "sfcr:notebook-variants:index";

/** @deprecated Migrated into named variants on first load. */
export const CUSTOM_NOTEBOOK_STORAGE_KEY = "sfcr:notebook-custom-document";

export const IMPORTED_NOTEBOOK_VARIANT_ID = "imported-notebook";

const VARIANT_PAYLOAD_PREFIX = "sfcr:notebook-variant:";

export interface NotebookVariantIndexEntry {
  id: string;
  title: string;
  derivedFrom?: NotebookTemplateId;
  updatedAt: string;
}

function variantPayloadKey(variantId: string): string {
  return `${VARIANT_PAYLOAD_PREFIX}${variantId}`;
}

function readVariantIndexRaw(): NotebookVariantIndexEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const source = window.localStorage.getItem(NOTEBOOK_VARIANT_INDEX_STORAGE_KEY);
  if (!source) {
    return [];
  }

  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : "";
      const derivedFrom =
        typeof record.derivedFrom === "string" && isNotebookTemplateId(record.derivedFrom)
          ? record.derivedFrom
          : undefined;

      if (!id || !title) {
        return [];
      }

      if (isNotebookTemplateId(id)) {
        return [];
      }

      return [
        {
          id,
          title,
          derivedFrom,
          updatedAt: updatedAt || new Date(0).toISOString()
        }
      ];
    });
  } catch {
    return [];
  }
}

function writeVariantIndex(entries: NotebookVariantIndexEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(NOTEBOOK_VARIANT_INDEX_STORAGE_KEY, JSON.stringify(entries));
}

export function listNotebookVariants(): NotebookVariantIndexEntry[] {
  return readVariantIndexRaw().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function getNotebookVariantIndexEntry(variantId: string): NotebookVariantIndexEntry | null {
  return listNotebookVariants().find((entry) => entry.id === variantId) ?? null;
}

export function isNotebookVariantId(value: string): boolean {
  return getNotebookVariantIndexEntry(value) != null;
}

export function loadNotebookVariantDocument(variantId: string): NotebookDocument | null {
  if (typeof window === "undefined") {
    return null;
  }

  const entry = getNotebookVariantIndexEntry(variantId);
  if (!entry) {
    return null;
  }

  const source = window.localStorage.getItem(variantPayloadKey(variantId));
  if (!source) {
    return null;
  }

  try {
    const document = parseNotebookSource(source, "json").document;
    return applyVariantEntryToDocument(document, entry);
  } catch {
    removeNotebookVariant(variantId);
    return null;
  }
}

function applyVariantEntryToDocument(
  document: NotebookDocument,
  entry: NotebookVariantIndexEntry
): NotebookDocument {
  const metadata: NotebookDocument["metadata"] = { version: 1 };
  if (entry.derivedFrom) {
    metadata.template = entry.derivedFrom;
  }
  if (document.metadata.sourceFileName) {
    metadata.sourceFileName = document.metadata.sourceFileName;
  }

  return {
    ...structuredClone(document),
    id: entry.id,
    title: document.title.trim() || entry.title,
    metadata
  };
}

export function saveNotebookVariantDocument(
  variantId: string,
  document: NotebookDocument
): NotebookDocument | null {
  const entry = getNotebookVariantIndexEntry(variantId);
  if (!entry || typeof window === "undefined") {
    return null;
  }

  const prepared = applyVariantEntryToDocument(document, entry);

  try {
    window.localStorage.setItem(
      variantPayloadKey(variantId),
      serializeNotebookSource(prepared, "json")
    );
    upsertVariantIndexEntry({
      ...entry,
      title: prepared.title,
      updatedAt: new Date().toISOString()
    });
    return prepared;
  } catch {
    return null;
  }
}

function upsertVariantIndexEntry(entry: NotebookVariantIndexEntry): void {
  const next = readVariantIndexRaw().filter((existing) => existing.id !== entry.id);
  next.push(entry);
  writeVariantIndex(next);
}

export function removeNotebookVariant(variantId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(variantPayloadKey(variantId));
  writeVariantIndex(readVariantIndexRaw().filter((entry) => entry.id !== variantId));
}

export function renameNotebookVariant(variantId: string, nextTitle: string): boolean {
  const title = nextTitle.trim();
  if (!title) {
    return false;
  }

  const entry = getNotebookVariantIndexEntry(variantId);
  const document = loadNotebookVariantDocument(variantId);
  if (!entry || !document) {
    return false;
  }

  const nextDocument: NotebookDocument = {
    ...document,
    title
  };

  upsertVariantIndexEntry({
    ...entry,
    title,
    updatedAt: new Date().toISOString()
  });

  try {
    window.localStorage.setItem(
      variantPayloadKey(variantId),
      serializeNotebookSource(nextDocument, "json")
    );
    return true;
  } catch {
    return false;
  }
}

function slugifySegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "variant"
  );
}

function allocateNotebookVariantId(
  derivedFrom: NotebookTemplateId | undefined,
  title: string
): string {
  const prefix = derivedFrom ?? "notebook";
  const slug = slugifySegment(title);
  const base = slug.startsWith(`${prefix}-`) ? slug : `${prefix}-${slug}`;
  const taken = new Set(listNotebookVariants().map((entry) => entry.id));

  if (!taken.has(base) && !isNotebookTemplateId(base)) {
    return base;
  }

  let index = 2;
  while (taken.has(`${base}-${index}`) || isNotebookTemplateId(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
}

export function createNotebookVariantFromTemplate(
  derivedFrom: NotebookTemplateId,
  title: string
): NotebookVariantIndexEntry | null {
  const trimmedTitle = title.trim() || `${NOTEBOOK_TEMPLATES[derivedFrom].label} variant`;
  const id = allocateNotebookVariantId(derivedFrom, trimmedTitle);
  const loaded = loadNotebookTemplate(derivedFrom);
  if (!loaded.ok) {
    return null;
  }
  const document = structuredClone(loaded.document);
  document.id = id;
  document.title = trimmedTitle;
  document.metadata = { version: 1, template: derivedFrom };

  return createNotebookVariant(id, trimmedTitle, derivedFrom, document);
}

export function createNotebookVariantFromDocument(
  source: NotebookDocument,
  options: {
    derivedFrom?: NotebookTemplateId;
    title: string;
  }
): NotebookVariantIndexEntry | null {
  const trimmedTitle = options.title.trim();
  if (!trimmedTitle) {
    return null;
  }

  const id = allocateNotebookVariantId(options.derivedFrom, trimmedTitle);
  const document: NotebookDocument = {
    ...structuredClone(source),
    id,
    title: trimmedTitle,
    metadata: { version: 1, ...(options.derivedFrom ? { template: options.derivedFrom } : {}) }
  };

  return createNotebookVariant(id, trimmedTitle, options.derivedFrom, document);
}

export function createNotebookVariantFromFileImport(
  source: NotebookDocument,
  fileName: string
): NotebookVariantIndexEntry | null {
  const trimmedFileName = fileName.trim();
  if (!trimmedFileName) {
    return null;
  }

  const templateId = source.metadata.template;
  const derivedFrom =
    typeof templateId === "string" && isNotebookTemplateId(templateId) ? templateId : undefined;
  const titleFromFile = stripNotebookFileExtension(trimmedFileName).trim();
  const title = titleFromFile || source.title.trim() || "Imported notebook";
  const id = allocateNotebookVariantId(derivedFrom, title);
  const document: NotebookDocument = {
    ...structuredClone(source),
    id,
    title: source.title.trim() || title,
    metadata: {
      version: 1,
      ...(derivedFrom ? { template: derivedFrom } : {}),
      sourceFileName: trimmedFileName
    }
  };

  return createNotebookVariant(id, title, derivedFrom, document);
}

function createNotebookVariant(
  id: string,
  title: string,
  derivedFrom: NotebookTemplateId | undefined,
  document: NotebookDocument
): NotebookVariantIndexEntry | null {
  if (typeof window === "undefined") {
    return null;
  }

  const entry: NotebookVariantIndexEntry = {
    id,
    title,
    derivedFrom,
    updatedAt: new Date().toISOString()
  };

  try {
    window.localStorage.setItem(
      variantPayloadKey(id),
      serializeNotebookSource(applyVariantEntryToDocument(document, entry), "json")
    );
    upsertVariantIndexEntry(entry);
    return entry;
  } catch {
    return null;
  }
}

function loadLegacyCustomNotebook(): NotebookDocument | null {
  if (typeof window === "undefined") {
    return null;
  }

  const source = window.localStorage.getItem(CUSTOM_NOTEBOOK_STORAGE_KEY);
  if (!source) {
    return null;
  }

  try {
    return parseNotebookSource(source, "json").document;
  } catch {
    window.localStorage.removeItem(CUSTOM_NOTEBOOK_STORAGE_KEY);
    return null;
  }
}

export function migrateLegacyStoredNotebooks(): NotebookVariantIndexEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const legacy = loadLegacyCustomNotebook();
  if (!legacy) {
    return listNotebookVariants();
  }

  window.localStorage.removeItem(CUSTOM_NOTEBOOK_STORAGE_KEY);

  const templateId = legacy.metadata.template;
  const derivedFrom =
    typeof templateId === "string" && isNotebookTemplateId(templateId) ? templateId : undefined;

  if (derivedFrom) {
    createNotebookVariantFromDocument(legacy, {
      derivedFrom,
      title: legacy.title.trim() || `${NOTEBOOK_TEMPLATES[derivedFrom].label} variant`
    });
  } else {
    upsertImportedNotebookVariant(legacy);
  }

  return listNotebookVariants();
}

export function listImportedNotebookVariants(): NotebookVariantIndexEntry[] {
  return listNotebookVariants().filter((entry) => entry.derivedFrom == null);
}

export function upsertImportedNotebookVariant(document: NotebookDocument): NotebookVariantIndexEntry | null {
  removeNotebookVariant(IMPORTED_NOTEBOOK_VARIANT_ID);

  const templateId = document.metadata.template;
  const derivedFrom =
    typeof templateId === "string" && isNotebookTemplateId(templateId) ? templateId : undefined;
  const title = document.title.trim() || "Imported notebook";

  return createNotebookVariant(
    IMPORTED_NOTEBOOK_VARIANT_ID,
    title,
    derivedFrom,
    {
      ...structuredClone(document),
      id: IMPORTED_NOTEBOOK_VARIANT_ID,
      title,
      metadata: { version: 1, ...(derivedFrom ? { template: derivedFrom } : {}) }
    }
  );
}
