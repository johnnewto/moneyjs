import { useEffect, useRef, useState, useTransition } from "react";

import type { StabilityAnalysis, SimulationResult } from "@sfcr/core";

import { createWorkerClient } from "../lib/workerClient";
import {
  stabilityPeriodFromUiIndex,
  type StabilityRunTarget
} from "../lib/stabilityAtPeriod";

export type StabilityDisplayStatus =
  | "no-run"
  | "idle"
  | "initial-period"
  | "computing"
  | "ready"
  | "error";

export interface UseStabilityMetricsOptions {
  enabled?: boolean;
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

    const key = cacheKey(target.runCellId, analysisPeriod, target.result);
    const cachedError = errorCache.get(key);
    if (cachedError) {
      setDisplay({
        status: "error",
        modelLabel: target.modelLabel,
        errorMessage: cachedError
      });
      return;
    }

    const cachedAnalysis = analysisCache.get(key);
    if (cachedAnalysis) {
      setDisplay({
        status: "ready",
        modelLabel: target.modelLabel,
        analysis: cachedAnalysis
      });
      return;
    }

    setDisplay({
      status: "computing",
      modelLabel: target.modelLabel
    });

    let cancelled = false;

    void workerClientRef.current
      .computeStabilityMetrics(target.result, analysisPeriod)
      .then((analysis) => {
        analysisCache.set(key, analysis);
        errorCache.delete(key);
        if (!cancelled && requestIdRef.current === requestId) {
          startTransition(() => {
            setDisplay({
              status: "ready",
              modelLabel: target.modelLabel,
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
              modelLabel: target.modelLabel,
              errorMessage: message
            });
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, selectedPeriodIndex, target]);

  return {
    display,
    isComputing
  };
}
