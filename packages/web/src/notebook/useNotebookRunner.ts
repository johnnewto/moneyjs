import { useEffect, useMemo, useRef, useState } from "react";

import type { SimulationResult } from "@sfcr/core";

import { buildRuntimeConfig } from "../lib/editorModel";
import { createWorkerClient } from "../lib/workerClient";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "./modelSections";
import type { NotebookDocument, NotebookRuntimeState, RunCell } from "./types";

export interface NotebookRunnerApi extends NotebookRuntimeState {
  runCell(cellId: string): Promise<void>;
  runAll(): Promise<void>;
  getResult(cellId: string): SimulationResult | null;
}

export function useNotebookRunner(document: NotebookDocument): NotebookRunnerApi {
  const [client] = useState(() => createWorkerClient());
  const [state, setState] = useState<NotebookRuntimeState>({ outputs: {}, status: {}, errors: {} });
  const stateRef = useRef(state);

  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => {
    const next = { outputs: {}, status: {}, errors: {} };
    stateRef.current = next;
    setState(next);
  }, [document]);

  const runCells = useMemo(
    () => document.cells.filter((cell): cell is RunCell => cell.type === "run"),
    [document.cells]
  );

  function buildRunOptions(cell: RunCell): ReturnType<typeof buildRuntimeConfig>["options"] | null {
    const editor = buildEditorStateForNotebookModel(document, cell);
    if (!editor) {
      return null;
    }

    const runtime = buildRuntimeConfig(editor);
    if (cell.periods == null) {
      return runtime.options;
    }

    return {
      ...runtime.options,
      periods: cell.periods
    };
  }

  function resolveBaselineRunCell(cell: RunCell): RunCell | null {
    if (cell.mode !== "scenario") {
      return null;
    }

    if (cell.baselineRunCellId) {
      return (
        document.cells.find(
          (entry): entry is RunCell =>
            entry.type === "run" && entry.mode === "baseline" && entry.id === cell.baselineRunCellId
        ) ?? null
      );
    }

    const scenarioModelKey = resolveRunCellModelKey(document.cells, cell);
    if (!scenarioModelKey) {
      return null;
    }

    return (
      document.cells.find(
        (entry): entry is RunCell =>
          entry.type === "run" &&
          entry.mode === "baseline" &&
          resolveRunCellModelKey(document.cells, entry) === scenarioModelKey
      ) ?? null
    );
  }

  function createScenarioBaselineSnapshot(
    baseline: SimulationResult,
    baselineStartPeriod?: number
  ): SimulationResult {
    if (baselineStartPeriod == null) {
      return baseline;
    }

    if (!Number.isInteger(baselineStartPeriod) || baselineStartPeriod < 1) {
      throw new Error("baselineStartPeriod must be an integer >= 1.");
    }

    const availablePeriods = baseline.options.periods;
    if (baselineStartPeriod > availablePeriods) {
      throw new Error(
        `baselineStartPeriod ${baselineStartPeriod} exceeds baseline length ${availablePeriods}.`
      );
    }

    return {
      ...baseline,
      options: {
        ...baseline.options,
        periods: baselineStartPeriod
      },
      series: Object.fromEntries(
        Object.entries(baseline.series).map(([name, values]) => [name, values.slice(0, baselineStartPeriod)])
      )
    };
  }

  async function runCell(cellId: string): Promise<void> {
    const cell = document.cells.find((entry) => entry.id === cellId);
    if (!cell || cell.type !== "run") {
      return;
    }

    const editor = buildEditorStateForNotebookModel(document, cell);
    const modelOutputKey = resolveRunCellModelKey(document.cells, cell);
    if (!editor || !modelOutputKey) {
      setState((current) => {
        const next: NotebookRuntimeState = {
          ...current,
          status: { ...current.status, [cellId]: "error" },
          errors: { ...current.errors, [cellId]: "Source model sections not found." }
        };
        stateRef.current = next;
        return next;
      });
      return;
    }

    setState((current) => {
      const next: NotebookRuntimeState = {
        ...current,
        status: { ...current.status, [cellId]: "running" },
        errors: { ...current.errors, [cellId]: undefined }
      };
      stateRef.current = next;
      return next;
    });

    try {
      const runtime = buildRuntimeConfig(editor);
      const runOptions =
        cell.periods == null
          ? runtime.options
          : {
              ...runtime.options,
              periods: cell.periods
            };
      let result: SimulationResult;

      if (cell.mode === "baseline") {
        result = await client.runBaseline(runtime.model, runOptions);
      } else {
        let baseline: SimulationResult | null = null;
        const baselineCell = resolveBaselineRunCell(cell);

        if (baselineCell) {
          let baselineResult = stateRef.current.outputs[baselineCell.id];
          if (baselineResult?.type !== "result") {
            await runCell(baselineCell.id);
            baselineResult = stateRef.current.outputs[baselineCell.id];
          }
          if (baselineResult?.type !== "result") {
            throw new Error(`Baseline run '${baselineCell.id}' did not produce a result.`);
          }
          baseline = createScenarioBaselineSnapshot(baselineResult.result, cell.baselineStartPeriod);
        } else {
          const baselineOptions = buildRunOptions({
            ...cell,
            mode: "baseline"
          });
          if (!baselineOptions) {
            throw new Error("Source model sections not found.");
          }
          baseline = createScenarioBaselineSnapshot(
            await client.runBaseline(runtime.model, baselineOptions),
            cell.baselineStartPeriod
          );
        }

        if (!cell.scenario) {
          throw new Error("Scenario cell is missing its scenario definition.");
        }
        result = await client.runScenario(runtime.model, baseline, cell.scenario, runOptions);
      }

      setState((current) => {
        const next: NotebookRuntimeState = {
          ...current,
          outputs: {
            ...current.outputs,
            [modelOutputKey]: {
              type: "model",
              runtime: {
                ...runtime,
                options: runOptions
              }
            },
            [cellId]: { type: "result", result }
          },
          status: { ...current.status, [cellId]: "success" }
        };
        stateRef.current = next;
        return next;
      });
    } catch (error) {
      setState((current) => {
        const next: NotebookRuntimeState = {
          ...current,
          status: { ...current.status, [cellId]: "error" },
          errors: {
            ...current.errors,
            [cellId]: error instanceof Error ? error.message : "Unknown notebook error"
          }
        };
        stateRef.current = next;
        return next;
      });
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
