import { describe, expect, it } from "vitest";

import {
  buildIncrementalNotebookSaveFileName,
  NOTEBOOK_NO_FILE_CHOSEN_LABEL,
  resolveNotebookSaveBaseName,
  stripIncrementalSaveSuffix,
  stripNotebookFileExtension,
  withNotebookSourceFileName
} from "../src/notebook/notebookSourceWorkflow";
import { createNotebookFromTemplate } from "../src/notebook/templates";

describe("notebook save file names", () => {
  it("strips common notebook file extensions", () => {
    expect(stripNotebookFileExtension("model.notebook.yaml")).toBe("model");
    expect(stripNotebookFileExtension("model.sfnb.json")).toBe("model");
    expect(stripNotebookFileExtension("model.sfnb.md")).toBe("model");
    expect(stripNotebookFileExtension("model.markdown")).toBe("model");
  });

  it("removes an existing incremental suffix before building the next save name", () => {
    expect(stripIncrementalSaveSuffix("model (2)")).toBe("model");
    expect(buildIncrementalNotebookSaveFileName({
      baseName: "model (2)",
      counter: 3,
      format: "yaml"
    })).toBe("model (3).notebook.yaml");
  });

  it("uses the loaded file base name when available", () => {
    expect(
      resolveNotebookSaveBaseName({
        loadedFileName: "import.notebook.yaml",
        fallbackId: "bmw-notebook"
      })
    ).toBe("import");
    expect(
      resolveNotebookSaveBaseName({
        loadedFileName: NOTEBOOK_NO_FILE_CHOSEN_LABEL,
        fallbackId: "bmw-notebook"
      })
    ).toBe("bmw-notebook");
  });

  it("prefers metadata sourceFileName over loaded file UI state", () => {
    expect(
      resolveNotebookSaveBaseName({
        sourceFileName: "browser-notebook.notebook.yaml",
        loadedFileName: "other.notebook.yaml",
        fallbackId: "sim-browser-notebook"
      })
    ).toBe("browser-notebook");
  });

  it("sets metadata sourceFileName on the document", () => {
    const document = createNotebookFromTemplate("sim");
    const updated = withNotebookSourceFileName(document, "browser-notebook.notebook.yaml");
    expect(updated.metadata.sourceFileName).toBe("browser-notebook.notebook.yaml");
    expect(updated.metadata.template).toBe("sim");
  });

  it("builds numbered save names for the active format", () => {
    expect(
      buildIncrementalNotebookSaveFileName({
        baseName: "import",
        counter: 1,
        format: "yaml"
      })
    ).toBe("import (1).notebook.yaml");
    expect(
      buildIncrementalNotebookSaveFileName({
        baseName: "import",
        counter: 2,
        format: "json"
      })
    ).toBe("import (2).sfnb.json");
  });
});
