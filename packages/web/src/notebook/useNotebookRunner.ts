import { useEffect, useMemo, useRef, useState } from "react";

import type { SimulationOptions, SimulationResult } from "@sfcr/core";

import { buildRuntimeConfig } from "../lib/editorModel";
import { createWorkerClient } from "../lib/workerClient";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "./modelSections";
import type { NotebookCellOutput, NotebookDocument, NotebookRuntimeState, RunCell } from "./types";

export interface NotebookRunnerApi extends NotebookRuntimeState {
  getPreviousResult(cellId: string): SimulationResult | null;
  getResult(cellId: string): SimulationResult | null;
  runCell(cellId: string): Promise<void>;
  runAll(): Promise<void>;
}

export function buildNotebookRunnerResetKey(document: NotebookDocument): string {
  const resetState = [];

  for (const cell of document.cells) {
    switch (cell.type) {
      case "model":
        resetState.push({ id: cell.id, type: cell.type, editor: cell.editor });
        break;
      case "equations":
        resetState.push({
          id: cell.id,
          type: cell.type,
          modelId: cell.modelId,
          equations: cell.equations
        });
        break;
      case "solver":
        resetState.push({ id: cell.id, type: cell.type, modelId: cell.modelId, options: cell.options });
        break;
      case "externals":
        resetState.push({
          id: cell.id,
          type: cell.type,
          modelId: cell.modelId,
          externals: cell.externals
        });
        break;
      case "initial-values":
        resetState.push({
          id: cell.id,
          type: cell.type,
          modelId: cell.modelId,
          initialValues: cell.initialValues
        });
        break;
      case "run":
        resetState.push({
          baselineRunCellId: cell.baselineRunCellId,
          baselineStartPeriod: cell.baselineStartPeriod,
          id: cell.id,
          mode: cell.mode,
          periods: cell.periods,
          resultKey: cell.resultKey,
          scenario: cell.scenario ?? null,
          sourceModelCellId: cell.sourceModelCellId,
          sourceModelId: cell.sourceModelId,
          type: cell.type
        });
        break;
      default:
        break;
    }
  }

  return JSON.stringify(resetState);
}

export function resolvePreviousRunResult(
  currentOutput: NotebookCellOutput | undefined,
  lastSuccessfulResult: SimulationResult | undefined,
  shouldCapturePrevious: boolean
): SimulationResult | undefined {
  if (currentOutput?.type === "result") {
    return currentOutput.previousResult;
  }

  return shouldCapturePrevious ? lastSuccessfulResult : undefined;
}

export function resolveRunCellOptions(options: SimulationOptions, cell: RunCell): SimulationOptions {
  return {
    ...options,
    periods: cell.periods
  };
}

export function buildRunHistorySignatures(document: NotebookDocument): Record<string, string> {
  return Object.fromEntries(
    document.cells
      .filter((cell): cell is RunCell => cell.type === "run")
      .map((cell) => {
        const editor = buildEditorStateForNotebookModel(document, cell);
        return [
          cell.id,
          JSON.stringify({
            equations: editor?.equations ?? [],
            externals: editor?.externals ?? [],
            initialValues: editor?.initialValues ?? [],
            mode: cell.mode,
            scenario: cell.scenario ?? null
          })
        ];
      })
  );
}

export function useNotebookRunner(document: NotebookDocument): NotebookRunnerApi {
  const [client] = useState(() => createWorkerClient());
  const [state, setState] = useState<NotebookRuntimeState>({ outputs: {}, status: {}, errors: {} });
  const stateRef = useRef(state);
  const lastSuccessfulResultsRef = useRef<Record<string, SimulationResult | undefined>>({});
  const historyCapturePendingRef = useRef<Record<string, boolean | undefined>>({});
  const historyUpdateSequenceRef = useRef(0);
  const resetKey = useMemo(() => buildNotebookRunnerResetKey(document), [document]);
  const runHistorySignatures = useMemo(() => buildRunHistorySignatures(document), [document]);
  const previousRunHistorySignaturesRef = useRef<Record<string, string> | null>(null);

  useEffect(() => () => client.dispose(), [client]);
  useEffect(() => {
    const previousSignatures = previousRunHistorySignaturesRef.current;
    if (previousSignatures) {
      for (const [cellId, signature] of Object.entries(runHistorySignatures)) {
        if (
          previousSignatures[cellId] != null &&
          previousSignatures[cellId] !== signature &&
          lastSuccessfulResultsRef.current[cellId]
        ) {
          historyCapturePendingRef.current[cellId] = true;
        }
      }
    }
    previousRunHistorySignaturesRef.current = runHistorySignatures;

    const next = { outputs: {}, status: {}, errors: {} };
    stateRef.current = next;
    setState(next);
  }, [resetKey]);

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
    return resolveRunCellOptions(runtime.options, cell);
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
      const runOptions = resolveRunCellOptions(runtime.options, cell);
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
        const shouldCapturePrevious = historyCapturePendingRef.current[cellId] === true;
        const previousResult = resolvePreviousRunResult(
          current.outputs[cellId],
          lastSuccessfulResultsRef.current[cellId],
          shouldCapturePrevious
        );
        const didCapturePrevious = current.outputs[cellId]?.type !== "result" && previousResult != null;
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
            [cellId]: {
              type: "result",
              previousResult,
              result
            }
          },
          historyUpdates: didCapturePrevious
            ? {
                ...current.historyUpdates,
                [cellId]: (historyUpdateSequenceRef.current += 1)
              }
            : current.historyUpdates,
          status: { ...current.status, [cellId]: "success" }
        };
        historyCapturePendingRef.current[cellId] = false;
        lastSuccessfulResultsRef.current[cellId] = result;
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

  function getPreviousResult(cellId: string): SimulationResult | null {
    const output = state.outputs[cellId];
    return output?.type === "result" ? output.previousResult ?? null : null;
  }

  return {
    ...state,
    getPreviousResult,
    runCell,
    runAll,
    getResult
  };
}
