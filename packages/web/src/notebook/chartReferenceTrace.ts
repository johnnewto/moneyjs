import type { SimulationResult } from "@sfcr/core";

import {
  buildOverlaySeriesFromSpecs,
  resolveChartSeriesSpecs,
  type ResolvedChartSeries
} from "./chartSeries";
import type { ChartCell, NotebookCell, RunCell } from "./types";

export type ReferenceTraceKind = "none" | "baseline" | "previous-run" | "observed";

export function formatChartReferenceTrace(trace: ReferenceTraceKind): string {
  switch (trace) {
    case "none":
      return "None";
    case "baseline":
      return "Baseline";
    case "previous-run":
      return "Previous";
    case "observed":
      return "Observed";
  }
}

export function formatChartReferenceTraceLegend(trace: ReferenceTraceKind): string {
  return `----: ${formatChartReferenceTrace(trace).toLowerCase()}`;
}

export function resolveReferenceTrace(
  cell: ChartCell,
  sourceRunCell: RunCell | null | undefined,
  hasObserved: boolean
): ReferenceTraceKind {
  if (cell.referenceTrace) {
    return cell.referenceTrace;
  }

  if (hasObserved && sourceRunCell?.simType === "STATIC") {
    return "observed";
  }

  return "previous-run";
}

export function resolveEffectiveScenarioStartPeriod(
  cells: NotebookCell[],
  cell: RunCell
): number | undefined {
  if (cell.mode !== "scenario") {
    return undefined;
  }

  if (cell.baselineStartPeriod != null) {
    return cell.baselineStartPeriod;
  }

  const baselineRunCell = cell.baselineRunCellId
    ? cells.find(
        (candidate): candidate is RunCell =>
          candidate.type === "run" && candidate.id === cell.baselineRunCellId
      ) ?? null
    : null;

  if (!baselineRunCell) {
    return undefined;
  }

  return baselineRunCell.periods;
}

export function buildReferenceTraceOverlaySeries(args: {
  cell: ChartCell;
  referenceTrace: ReferenceTraceKind;
  result: SimulationResult;
  resolvedSeries: ResolvedChartSeries[];
  sourceRunCell?: RunCell | null;
  baselineStartPeriod?: number;
  baselineResult?: SimulationResult | null;
  previousResult?: SimulationResult | null;
}): ResolvedChartSeries[] {
  switch (args.referenceTrace) {
    case "previous-run":
      return buildPreviousRunOverlaySeries(args.cell, args.previousResult ?? null, args.resolvedSeries);
    case "baseline":
      return buildBaselineOverlaySeries(
        args.cell,
        args.sourceRunCell,
        args.baselineStartPeriod,
        args.baselineResult ?? null,
        args.resolvedSeries
      );
    case "observed":
      return buildObservedOverlaySeries(args.cell, args.result, args.resolvedSeries);
    default:
      return [];
  }
}

function buildBaselineOverlaySeries(
  cell: ChartCell,
  sourceRunCell: RunCell | null | undefined,
  baselineStartPeriod: number | undefined,
  baselineResult: SimulationResult | null,
  resolvedSeries: ResolvedChartSeries[]
) {
  if (
    sourceRunCell?.mode !== "scenario" ||
    baselineStartPeriod == null ||
    !baselineResult
  ) {
    return [];
  }

  const specs = resolveChartSeriesSpecs(cell);
  const startIndex = Math.max(baselineStartPeriod - 1, 0);
  const length = sourceRunCell.periods ?? resolvedSeries[0]?.values.length ?? 0;
  const overlayByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, baselineResult, { startIndex, length }).map((entry) => [
      entry.highlightKey,
      entry
    ])
  );

  return alignOverlayNames(resolvedSeries, overlayByHighlightKey);
}

function buildPreviousRunOverlaySeries(
  cell: ChartCell,
  previousResult: SimulationResult | null,
  resolvedSeries: ResolvedChartSeries[]
) {
  if (!previousResult) {
    return [];
  }

  const specs = resolveChartSeriesSpecs(cell);
  const overlayByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, previousResult).map((entry) => [entry.highlightKey, entry])
  );

  return alignOverlayNames(resolvedSeries, overlayByHighlightKey);
}

function buildObservedOverlaySeries(
  cell: ChartCell,
  result: SimulationResult,
  resolvedSeries: ResolvedChartSeries[]
) {
  const observed = result.observed;
  if (!observed || Object.keys(observed).length === 0) {
    return [];
  }

  const observedResult: SimulationResult = { ...result, series: observed };
  const specs = resolveChartSeriesSpecs(cell);
  const overlayByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, observedResult).map((entry) => [entry.highlightKey, entry])
  );

  return alignOverlayNames(resolvedSeries, overlayByHighlightKey);
}

function alignOverlayNames(
  resolvedSeries: ResolvedChartSeries[],
  overlayByHighlightKey: Map<string, ResolvedChartSeries>
) {
  return resolvedSeries.flatMap((entry) => {
    const overlay = overlayByHighlightKey.get(entry.highlightKey);
    return overlay ? [{ ...overlay, name: entry.name }] : [];
  });
}
