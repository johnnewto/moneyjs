import { describe, expect, it } from "vitest";

import {
  createNotebookFromTemplate,
  createNotebookFromTemplateWithFallback,
  getNotebookTemplateDocument,
  isNotebookTemplateLoadable,
  loadNotebookTemplate,
  NOTEBOOK_TEMPLATES
} from "../src/notebook/templates";

describe("notebook template lazy loading", () => {
  it("imports template metadata without parsing YAML eagerly", () => {
    expect(Object.keys(NOTEBOOK_TEMPLATES)).toContain("bmw");
    expect(NOTEBOOK_TEMPLATES.bmw.label).toBe("BMW");
  });

  it("loads template documents on demand", () => {
    const loaded = loadNotebookTemplate("bmw");
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.document.cells.length).toBeGreaterThan(0);
    }
    expect(getNotebookTemplateDocument("bmw").id).toBeTruthy();
    expect(createNotebookFromTemplate("bmw").cells.length).toBeGreaterThan(0);
  });

  it("reports all shipped templates as loadable", () => {
    for (const templateId of Object.keys(NOTEBOOK_TEMPLATES)) {
      expect(isNotebookTemplateLoadable(templateId as keyof typeof NOTEBOOK_TEMPLATES)).toBe(true);
    }
  });

  it("returns the requested template when load succeeds", () => {
    const loaded = createNotebookFromTemplateWithFallback("sim");
    expect(loaded.requestedTemplateId).toBe("sim");
    expect(loaded.resolvedTemplateId).toBe("sim");
    expect(loaded.loadError).toBeNull();
    expect(loaded.document.metadata.template).toBe("sim");
  });
});
