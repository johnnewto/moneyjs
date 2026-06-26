import { useEffect, useRef, useState, useTransition } from "react";

import type { StabilityAnalysis, SimulationResult } from "@sfcr/core";

import { createWorkerClient } from "../lib/workerClient";
import {
  stabilityPeriodFromUiIndex,
  type StabilityRunTarget
} from "../lib/stabilityAtPeriod";

type StabilityDisplayStatus =
  | "no-run"
  | "idle"
  | "initial-period"
  | "computing"
  | "ready"
  | "error";

export interface UseStabilityMetricsOptions {
  enabled?: boolean;
  /** Debounce worker requests when the scrubber period changes (cache hits stay immediate). */
  debounceMs?: number;
}

export interface StabilityDisplayState {
  status: StabilityDisplayStatus;
  modelLabel?: string;
  analysis?: StabilityAnalysis;
  errorMessage?: string;
}

const EMPTY_STATE: StabilityDisplayState = { status: "no-run" };

const analysisCache = new Map<string, StabilityAnalysis>();
const errorCache = new Map<string, string>();

function resultFingerprint(result: SimulationResult): string {
  const sample = result.model.equations
    .slice(0, 3)
    .map((equation) => {
      const series = result.series[equation.name];
      const last = series?.[series.length - 1] ?? NaN;
      return `${equation.name}=${last}`;
    })
    .join(",");

  return `${result.options.periods}:${sample}`;
}

function cacheKey(runCellId: string, period: number, result: SimulationResult): string {
  return `${runCellId}:${period}:${resultFingerprint(result)}`;
}

export function stabilityTargetCacheKey(target: StabilityRunTarget): string {
  return `${target.runCellId}:${resultFingerprint(target.result)}`;
}

export function useStabilityMetrics(
  target: StabilityRunTarget | null,
  selectedPeriodIndex: number,
  options?: UseStabilityMetricsOptions
): {
  display: StabilityDisplayState;
  isComputing: boolean;
} {
  const enabled = options?.enabled ?? false;
  const debounceMs = options?.debounceMs ?? 0;
  const [display, setDisplay] = useState<StabilityDisplayState>(EMPTY_STATE);
  const [, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const workerClientRef = useRef(createWorkerClient());
  const isComputing = enabled && display.status === "computing";

  useEffect(() => () => workerClientRef.current.dispose(), []);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!target) {
      setDisplay(EMPTY_STATE);
      return;
    }

    if (!enabled) {
      setDisplay({
        status: "idle",
        modelLabel: target.modelLabel
      });
      return;
    }

    const analysisPeriod = stabilityPeriodFromUiIndex(selectedPeriodIndex);
    if (analysisPeriod == null) {
      setDisplay({
        status: "initial-period",
        modelLabel: target.modelLabel
      });
      return;
    }

    const runTarget = target;
    const period = analysisPeriod;
    const key = cacheKey(runTarget.runCellId, period, runTarget.result);
    const cachedError = errorCache.get(key);
    if (cachedError) {
      setDisplay({
        status: "error",
        modelLabel: runTarget.modelLabel,
        errorMessage: cachedError
      });
      return;
    }

    const cachedAnalysis = analysisCache.get(key);
    if (cachedAnalysis) {
      setDisplay({
        status: "ready",
        modelLabel: runTarget.modelLabel,
        analysis: cachedAnalysis
      });
      return;
    }

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function startWorker(): void {
      setDisplay({
        status: "computing",
        modelLabel: runTarget.modelLabel
      });

      void workerClientRef.current
        .computeStabilityMetrics(runTarget.result, period)
        .then((analysis) => {
          analysisCache.set(key, analysis);
          errorCache.delete(key);
          if (!cancelled && requestIdRef.current === requestId) {
            startTransition(() => {
              setDisplay({
                status: "ready",
                modelLabel: runTarget.modelLabel,
                analysis
              });
            });
          }
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Stability analysis could not be computed.";
          errorCache.set(key, message);
          if (!cancelled && requestIdRef.current === requestId) {
            startTransition(() => {
              setDisplay({
                status: "error",
                modelLabel: runTarget.modelLabel,
                errorMessage: message
              });
            });
          }
        });
    }

    if (debounceMs > 0) {
      debounceTimer = window.setTimeout(startWorker, debounceMs);
    } else {
      startWorker();
    }

    return () => {
      cancelled = true;
      if (debounceTimer != null) {
        window.clearTimeout(debounceTimer);
      }
    };
  }, [debounceMs, enabled, selectedPeriodIndex, target]);

  return {
    display,
    isComputing
  };
}
