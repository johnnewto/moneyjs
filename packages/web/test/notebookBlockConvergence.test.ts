import { describe, expect, it } from "vitest";

import {
  buildNotebookBlockConvergenceRuntime,
  buildNotebookModelVariableInspectRequest
} from "../src/lib/notebookBlockConvergence";
import simNotebook from "../src/notebook/templates/generated/sim.notebook.json";

describe("buildNotebookBlockConvergenceRuntime", () => {
  it("builds a runnable probe config for the SIM template", () => {
    const initialValuesCell = simNotebook.cells.find((cell) => cell.type === "initial-values");
    expect(initialValuesCell?.type).toBe("initial-values");

    const runtime = buildNotebookBlockConvergenceRuntime(simNotebook, {
      modelId: initialValuesCell!.modelId,
      initialValuesOverride: initialValuesCell!.initialValues,
      periodsMin: 2
    });

    expect(runtime).not.toBeNull();
    expect(runtime?.options.periods).toBeGreaterThan(1);
    expect(runtime?.model.equations.length).toBeGreaterThan(0);
  });

  it("builds variable inspect requests for notebook models", () => {
    const request = buildNotebookModelVariableInspectRequest(simNotebook, {
      modelId: "sim",
      selectedVariable: "Y",
      currentValues: { Y: 80 }
    });

    expect(request).toMatchObject({
      modelSource: { sourceModelId: "sim" },
      selectedVariable: "Y",
      sourceRunCellId: "baseline-run"
    });
    expect(request?.editor.equations.length).toBeGreaterThan(0);
  });
});
