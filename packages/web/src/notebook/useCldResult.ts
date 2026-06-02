import { useDeferredValue, useEffect, useState, useTransition, type Dispatch, type SetStateAction } from "react";

import { generateCld, type CldResult } from "@sfcr/core";

import { cancelCldWorkerRequest, generateCldInWorker } from "../lib/cldWorkerClient";
import type { CldWorkerPayload } from "./cldInput";

const EMPTY_CLD: CldResult = {
  links: [],
  mermaid: "flowchart TD\n",
  loops: [],
  loopSummary: "",
  errors: []
};

export interface UseCldResultState {
  cld: CldResult;
  deferredCld: CldResult;
  isComputing: boolean;
  isStale: boolean;
}

export function useCldResult(inputKey: string, payload: CldWorkerPayload | null): UseCldResultState {
  const [cld, setCld] = useState<CldResult>(EMPTY_CLD);
  const [isComputing, setIsComputing] = useState(false);
  const [, startTransition] = useTransition();
  const deferredCld = useDeferredValue(cld);
  const isStale = cld !== deferredCld;

  useEffect(() => {
    if (!inputKey || !payload) {
      setCld(EMPTY_CLD);
      setIsComputing(false);
      return;
    }

    let cancelled = false;
    let activeRequestId: number | null = null;
    setIsComputing(true);

    const scheduleResult: Dispatch<SetStateAction<CldResult>> = (next) => {
      startTransition(() => {
        setCld(next);
        setIsComputing(false);
      });
    };

    const run = () => {
      if (import.meta.env.VITEST) {
        try {
          const result = generateCld(payload.equations, {
            matrixColumnSums: payload.matrixColumnSums,
            nodeKinds: payload.nodeKinds
          });
          if (!cancelled) {
            scheduleResult(result);
          }
        } catch {
          if (!cancelled) {
            scheduleResult({
              ...EMPTY_CLD,
              errors: ["Causal loop diagram could not be computed."]
            });
          }
        }
        return;
      }

      const { id, promise } = generateCldInWorker(payload);
      activeRequestId = id;
      void promise
        .then((result) => {
          if (!cancelled) {
            scheduleResult(result);
          }
        })
        .catch(() => {
          if (!cancelled) {
            scheduleResult({
              ...EMPTY_CLD,
              errors: ["Causal loop diagram could not be computed."]
            });
          }
        });
    };

    if (typeof requestIdleCallback === "function") {
      const idleId = requestIdleCallback(run, { timeout: 120 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
        if (activeRequestId !== null) {
          cancelCldWorkerRequest(activeRequestId);
        }
      };
    }

    const timeoutId = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (activeRequestId !== null) {
        cancelCldWorkerRequest(activeRequestId);
      }
    };
  }, [inputKey, payload]);

  return {
    cld,
    deferredCld,
    isComputing: isComputing || isStale,
    isStale
  };
}
