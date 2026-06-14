// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createNotebookFromTemplate } from "../src/notebook/templates";
import {
  buildPublicationInspectRequest,
  resolvePublicationInspectContext
} from "../src/publication/publicationInspect";

describe("publicationInspect", () => {
  it("resolves inspect context for bmw equations from the linked run", () => {
    const document = createNotebookFromTemplate("bmw");
    const equationsCell = document.cells.find((cell) => cell.id === "equations-newton");
    expect(equationsCell?.type).toBe("equations");

    if (equationsCell?.type !== "equations") {
      return;
    }

    const context = resolvePublicationInspectContext({
      cell: equationsCell,
      document,
      getResult: () => null,
      selectedPeriodIndex: 0
    });

    expect(context).not.toBeNull();
    expect(context?.modelSource).toEqual({ sourceModelId: equationsCell.modelId });
    expect(context?.editor.equations.length).toBeGreaterThan(0);
  });

  it("builds inspect requests with trimmed variable names", () => {
    const document = createNotebookFromTemplate("bmw");
    const equationsCell = document.cells.find((cell) => cell.id === "equations-newton");
    expect(equationsCell?.type).toBe("equations");

    if (equationsCell?.type !== "equations") {
      return;
    }

    const context = resolvePublicationInspectContext({
      cell: equationsCell,
      document,
      getResult: () => null,
      selectedPeriodIndex: 0
    });
    expect(context).not.toBeNull();

    if (!context) {
      return;
    }

    const request = buildPublicationInspectRequest({
      context,
      document,
      selectedVariable: " Y "
    });

    expect(request.selectedVariable).toBe("Y");
    expect(request.sourceRunCellId).toBeTruthy();
  });
});
