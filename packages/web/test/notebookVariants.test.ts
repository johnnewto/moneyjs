// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { notebookToJson } from "../src/notebook/document";
import { createNotebookFromTemplate } from "../src/notebook/templates";
import {
  CUSTOM_NOTEBOOK_STORAGE_KEY,
  IMPORTED_NOTEBOOK_VARIANT_ID,
  NOTEBOOK_VARIANT_INDEX_STORAGE_KEY,
  createNotebookVariantFromFileImport,
  createNotebookVariantFromTemplate,
  listNotebookVariants,
  loadNotebookVariantDocument,
  migrateLegacyStoredNotebooks,
  removeNotebookVariant,
  renameNotebookVariant,
  upsertImportedNotebookVariant
} from "../src/notebook/notebookVariants";

afterEach(() => {
  window.localStorage.clear();
});

describe("notebookVariants", () => {
  it("creates and loads a template variant", () => {
    const entry = createNotebookVariantFromTemplate("sim", "SIM shock 1");
    expect(entry).not.toBeNull();

    const loaded = loadNotebookVariantDocument(entry!.id);
    expect(loaded?.title).toBe("SIM shock 1");
    expect(loaded?.metadata.template).toBe("sim");
    expect(listNotebookVariants().some((variant) => variant.id === entry!.id)).toBe(true);
  });

  it("renames a variant title", () => {
    const entry = createNotebookVariantFromTemplate("bmw", "BMW baseline");
    expect(renameNotebookVariant(entry!.id, "BMW shock 1")).toBe(true);

    const loaded = loadNotebookVariantDocument(entry!.id);
    expect(loaded?.title).toBe("BMW shock 1");
  });

  it("migrates the legacy custom notebook into an imported variant", () => {
    const legacy = createNotebookFromTemplate("bmw");
    legacy.title = "Legacy custom";
    legacy.metadata = { version: 1 };
    window.localStorage.setItem(CUSTOM_NOTEBOOK_STORAGE_KEY, notebookToJson(legacy));

    migrateLegacyStoredNotebooks();

    expect(window.localStorage.getItem(CUSTOM_NOTEBOOK_STORAGE_KEY)).toBeNull();
    expect(loadNotebookVariantDocument(IMPORTED_NOTEBOOK_VARIANT_ID)?.title).toBe("Legacy custom");
    expect(window.localStorage.getItem(NOTEBOOK_VARIANT_INDEX_STORAGE_KEY)).toContain(
      IMPORTED_NOTEBOOK_VARIANT_ID
    );
  });

  it("upserts the imported notebook slot", () => {
    const first = createNotebookFromTemplate("sim");
    first.title = "First import";
    upsertImportedNotebookVariant(first);

    const second = createNotebookFromTemplate("sim");
    second.title = "Second import";
    upsertImportedNotebookVariant(second);

    expect(listNotebookVariants().filter((entry) => entry.id === IMPORTED_NOTEBOOK_VARIANT_ID)).toHaveLength(
      1
    );
    expect(loadNotebookVariantDocument(IMPORTED_NOTEBOOK_VARIANT_ID)?.title).toBe("Second import");
  });

  it("removes a variant from storage", () => {
    const entry = createNotebookVariantFromTemplate("bmw", "Temporary");
    removeNotebookVariant(entry!.id);
    expect(loadNotebookVariantDocument(entry!.id)).toBeNull();
    expect(listNotebookVariants().some((variant) => variant.id === entry!.id)).toBe(false);
  });

  it("creates a file-import variant with source metadata", () => {
    const source = createNotebookFromTemplate("sim");
    source.title = "SIM browser notebook";

    const entry = createNotebookVariantFromFileImport(source, "browser-notebook.notebook.yaml");
    expect(entry?.id).toBe("sim-browser-notebook");

    const loaded = loadNotebookVariantDocument(entry!.id);
    expect(loaded?.metadata.sourceFileName).toBe("browser-notebook.notebook.yaml");
    expect(loaded?.metadata.template).toBe("sim");
    expect(loaded?.title).toBe("SIM browser notebook");
  });
});
