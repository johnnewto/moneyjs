import { useEffect, useMemo, useState } from "react";

import type { SimulationResult } from "@sfcr/core";

import { buildRuntimeConfig } from "../lib/editorModel";
import { createWorkerClient } from "../lib/workerClient";
import type { NotebookDocument, NotebookRuntimeState, RunCell } from "./types";

export interface NotebookRunnerApi extends NotebookRuntimeState {
  runCell(cellId: string): Promise<void>;
  runAll(): Promise<void>;
  getResult(cellId: string): SimulationResult | null;
}

export function useNotebookRunner(document: NotebookDocument): NotebookRunnerApi {
  const [client] = useState(() => createWorkerClient());
  const [state, setState] = useState<NotebookRuntimeState>({ outputs: {}, status: {}, errors: {} });

  useEffect(() => () => client.dispose(), [client]);

  const modelCells = useMemo(
    () => new Map(document.cells.filter((cell) => cell.type === "model").map((cell) => [cell.id, cell])),
    [document.cells]
  );
  const runCells = useMemo(
    () => document.cells.filter((cell): cell is RunCell => cell.type === "run"),
    [document.cells]
  );

  async function runCell(cellId: string): Promise<void> {
    const cell = document.cells.find((entry) => entry.id === cellId);
    if (!cell || cell.type !== "run") {
      return;
    }

    const modelCell = modelCells.get(cell.sourceModelCellId);
    if (!modelCell) {
      setState((current) => ({
        ...current,
        status: { ...current.status, [cellId]: "error" },
        errors: { ...current.errors, [cellId]: "Source model cell not found." }
      }));
      return;
    }

    setState((current) => ({
      ...current,
      status: { ...current.status, [cellId]: "running" },
      errors: { ...current.errors, [cellId]: undefined }
    }));

    try {
      const runtime = buildRuntimeConfig(modelCell.editor);
      let result: SimulationResult;

      if (cell.mode === "baseline") {
        result = await client.runBaseline(runtime.model, runtime.options);
      } else {
        const baseline = await client.runBaseline(runtime.model, runtime.options);
        if (!cell.scenario) {
          throw new Error("Scenario cell is missing its scenario definition.");
        }
        result = await client.runScenario(runtime.model, baseline, cell.scenario, runtime.options);
      }

      setState((current) => ({
        ...current,
        outputs: {
          ...current.outputs,
          [modelCell.id]: { type: "model", runtime },
          [cellId]: { type: "result", result }
        },
        status: { ...current.status, [cellId]: "success" }
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: { ...current.status, [cellId]: "error" },
        errors: {
          ...current.errors,
          [cellId]: error instanceof Error ? error.message : "Unknown notebook error"
        }
      }));
    }
  }

  async function runAll(): Promise<void> {
    for (const cell of runCells) {
      await runCell(cell.id);
    }
  }

  function getResult(cellId: string): SimulationResult | null {
    const output = state.outputs[cellId];
    return output?.type === "result" ? output.result : null;
  }

  return {
    ...state,
    runCell,
    runAll,
    getResult
  };
}
