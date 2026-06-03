import type { StabilityAnalysis, StabilityClassification, SimulationResult } from "@sfcr/core";

import type { NotebookDocument } from "../notebook/types";
import type { VariableInspectRequest } from "./variableInspect";
import { resolvePreferredInspectorRunCell } from "./variableInspect";
import { findPreferredRunForModelKey, listCatalogModelContexts } from "./variableCatalog";
import type { RunCell } from "../notebook/types";

export interface StabilityRunTarget {
  runCellId: string;
  result: SimulationResult;
  modelLabel: string;
}

export function stabilityPeriodFromUiIndex(selectedPeriodIndex: number): number | null {
  if (selectedPeriodIndex <= 0) {
    return null;
  }

  return selectedPeriodIndex;
}

export function resolveNotebookStabilityTarget(args: {
  document: NotebookDocument;
  getResult: (runCellId: string) => SimulationResult | null;
  inspectorContext: VariableInspectRequest | null;
}): StabilityRunTarget | null {
  const { cells } = args.document;

  if (args.inspectorContext?.modelSource) {
    const runCell = resolvePreferredInspectorRunCell(args.document, args.inspectorContext.modelSource);
    if (runCell) {
      const result = args.getResult(runCell.id);
      if (result) {
        return {
          runCellId: runCell.id,
          result,
          modelLabel: runCell.title.trim() || "Model run"
        };
      }
    }
  }

  const contexts = listCatalogModelContexts(args.document);
  if (contexts.length === 1) {
    const context = contexts[0];
    if (!context) {
      return null;
    }

    const runCell = findPreferredRunForModelKey(args.document, context.modelKey);
    if (runCell) {
      const result = args.getResult(runCell.id);
      if (result) {
        return {
          runCellId: runCell.id,
          result,
          modelLabel: runCell.title.trim() || context.modelTitle
        };
      }
    }
  }

  let fallbackRun: RunCell | null = null;

  for (const cell of cells) {
    if (cell.type !== "run") {
      continue;
    }

    const result = args.getResult(cell.id);
    if (!result) {
      continue;
    }

    if (cell.mode === "baseline") {
      return {
        runCellId: cell.id,
        result,
        modelLabel: cell.title.trim() || "Model run"
      };
    }

    fallbackRun ??= cell;
  }

  if (fallbackRun) {
    const result = args.getResult(fallbackRun.id);
    if (result) {
      return {
        runCellId: fallbackRun.id,
        result,
        modelLabel: fallbackRun.title.trim() || "Model run"
      };
    }
  }

  return null;
}

export function formatStabilityClassification(classification: StabilityClassification): string {
  switch (classification) {
    case "stable":
      return "Stable";
    case "marginal":
      return "Marginal";
    case "unstable":
      return "Unstable";
  }
}

export function formatSpectralRadius(value: number): string {
  return value.toFixed(3);
}

export function formatEigenvalue(re: number, im: number): string {
  if (Math.abs(im) < 1e-8) {
    return re.toFixed(3);
  }

  const imText = `${Math.abs(im).toFixed(3)}i`;
  if (Math.abs(re) < 1e-8) {
    return im >= 0 ? imText : `-${imText}`;
  }

  return `${re.toFixed(3)} ${im >= 0 ? "+" : "-"} ${imText}`;
}

export function stabilityResidualWarning(analysis: StabilityAnalysis): string | null {
  if (analysis.residualNorm <= 1e-4) {
    return null;
  }

  return `Operating-point residual norm is ${analysis.residualNorm.toExponential(2)}; local analysis may be approximate.`;
}

export function formatTransitionLoopGain(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(3);
  }

  return value.toFixed(4);
}
