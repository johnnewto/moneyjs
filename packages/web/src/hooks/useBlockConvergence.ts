import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BlockConvergenceOptions,
  BlockConvergenceReport,
  InitialValueProbeCandidate,
  InitialValueProbeResult,
  ModelDefinition,
  SimulationOptions
} from "@sfcr/core";

import { createWorkerClient } from "../lib/workerClient";

export interface BlockConvergenceTarget {
  model: ModelDefinition;
  options: SimulationOptions;
  period: number;
  label: string;
  analysisOptions?: BlockConvergenceOptions;
}

export interface InitialValueProbeTarget {
  model: ModelDefinition;
  options: SimulationOptions;
  candidates: InitialValueProbeCandidate[];
  label: string;
  analysisOptions?: BlockConvergenceOptions;
}

export function useBlockConvergence() {
  const workerClientRef = useRef(createWorkerClient());
  const [isComputing, setIsComputing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [report, setReport] = useState<BlockConvergenceReport | null>(null);
  const [probeResults, setProbeResults] = useState<InitialValueProbeResult[] | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  useEffect(() => () => workerClientRef.current.dispose(), []);

  const analyze = useCallback(async (target: BlockConvergenceTarget) => {
    setIsComputing(true);
    setErrorMessage(null);
    setProbeResults(null);
    setActiveLabel(target.label);
    try {
      const nextReport = await workerClientRef.current.analyzeAllBlockConvergence(
        target.model,
        target.options,
        target.period,
        target.analysisOptions
      );
      setReport(nextReport);
    } catch (error) {
      setReport(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Block convergence analysis could not be computed."
      );
    } finally {
      setIsComputing(false);
    }
  }, []);

  const probeInitialValues = useCallback(async (target: InitialValueProbeTarget) => {
    setIsComputing(true);
    setErrorMessage(null);
    setReport(null);
    setActiveLabel(target.label);
    try {
      const results = await workerClientRef.current.probeInitialValuesForPeriod1(
        target.model,
        target.options,
        target.candidates,
        target.analysisOptions
      );
      setProbeResults(results);
      const primary = results.find((entry) => entry.allCyclicConverged) ?? results[0];
      if (primary) {
        setReport(primary.report);
      }
    } catch (error) {
      setProbeResults(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Initial value probe could not be computed."
      );
    } finally {
      setIsComputing(false);
    }
  }, []);

  const clear = useCallback(() => {
    setReport(null);
    setProbeResults(null);
    setErrorMessage(null);
    setActiveLabel(null);
  }, []);

  return {
    activeLabel,
    analyze,
    clear,
    errorMessage,
    isComputing,
    probeInitialValues,
    probeResults,
    report
  };
}
