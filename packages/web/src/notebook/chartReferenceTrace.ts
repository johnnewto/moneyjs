import type { SimulationResult } from "@sfcr/core";

import {
  buildOverlaySeriesFromSpecs,
  resolveChartSeriesSpecs,
  type ResolvedChartSeries
} from "./chartSeries";
import type { ChartCell, NotebookCell, RunCell } from "./types";

export type ReferenceTraceKind = "none" | "baseline" | "previous-run" | "observed";
export type ActiveReferenceTraceKind = Exclude<ReferenceTraceKind, "none">;
export type ReferenceTraceOverlaySeries = ResolvedChartSeries & { referenceTraceKind: ActiveReferenceTraceKind };

function formatChartReferenceTrace(trace: ReferenceTraceKind): string {
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
  // Observed is drawn as dots; other traces as dashed lines.
  if (trace === "observed") {
    return `• ${formatChartReferenceTrace(trace)}`;
  }
  return `----: ${formatChartReferenceTrace(trace).toLowerCase()}`;
}

function resolveReferenceTrace(
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

export function resolveReferenceTraces(
  cell: ChartCell,
  sourceRunCell: RunCell | null | undefined,
  hasObserved: boolean
): ActiveReferenceTraceKind[] {
  if (Array.isArray(cell.referenceTraces) && cell.referenceTraces.length > 0) {
    return dedupeReferenceTraces(cell.referenceTraces);
  }

  const referenceTrace = resolveReferenceTrace(cell, sourceRunCell, hasObserved);
  return referenceTrace === "none" ? [] : [referenceTrace];
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

function buildReferenceTraceOverlaySeries(args: {
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
      return buildObservedOverlaySeries(
        args.cell,
        args.result,
        args.resolvedSeries,
        args.sourceRunCell,
        args.baselineStartPeriod,
        args.baselineResult ?? null
      );
  default:
      return [];
  }
}

export function buildReferenceTraceOverlaySeriesList(args: {
  cell: ChartCell;
  referenceTraces: ActiveReferenceTraceKind[];
  result: SimulationResult;
  resolvedSeries: ResolvedChartSeries[];
  sourceRunCell?: RunCell | null;
  baselineStartPeriod?: number;
  baselineResult?: SimulationResult | null;
  previousResult?: SimulationResult | null;
}): ReferenceTraceOverlaySeries[] {
  return args.referenceTraces.flatMap((referenceTrace) =>
    buildReferenceTraceOverlaySeries({
      cell: args.cell,
      referenceTrace,
      result: args.result,
      resolvedSeries: args.resolvedSeries,
      sourceRunCell: args.sourceRunCell,
      baselineStartPeriod: args.baselineStartPeriod,
      baselineResult: args.baselineResult,
      previousResult: args.previousResult
    }).map((entry) => ({ ...entry, referenceTraceKind: referenceTrace }))
  );
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
  resolvedSeries: ResolvedChartSeries[],
  sourceRunCell?: RunCell | null,
  baselineStartPeriod?: number,
  baselineResult?: SimulationResult | null
) {
  const observedSource =
    sourceRunCell?.mode === "scenario" && baselineStartPeriod != null && baselineResult?.observed
      ? baselineResult
      : result;
  const observed = observedSource.observed;
  if (!observed || Object.keys(observed).length === 0) {
    return [];
  }

  const startIndex =
    sourceRunCell?.mode === "scenario" && baselineStartPeriod != null && baselineResult?.observed
      ? Math.max(baselineStartPeriod - 1, 0)
      : 0;
  const slice =
    sourceRunCell?.mode === "scenario"
      ? { startIndex, length: sourceRunCell.periods }
      : undefined;
  const observedResult: SimulationResult = { ...observedSource, series: observed };
  const specs = resolveChartSeriesSpecs(cell);
  const overlayByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, observedResult, slice).map((entry) => [entry.highlightKey, entry])
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

function dedupeReferenceTraces(traces: readonly ActiveReferenceTraceKind[]): ActiveReferenceTraceKind[] {
  const seen = new Set<ActiveReferenceTraceKind>();
  const result: ActiveReferenceTraceKind[] = [];
  for (const trace of traces) {
    if (seen.has(trace)) {
      continue;
    }
    seen.add(trace);
    result.push(trace);
  }
  return result;
}
