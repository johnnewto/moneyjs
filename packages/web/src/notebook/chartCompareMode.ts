import type { SimulationResult } from "@sfcr/core";
import type { ChartAxisRange, ChartCell, RunCell } from "@sfcr/notebook-core";

import {
  buildOverlaySeriesFromSpecs,
  resolveChartSeriesSpecs,
  type ResolvedChartSeries
} from "./chartSeries";
import type { ActiveReferenceTraceKind } from "./chartReferenceTrace";

export type ChartCompareMode = NonNullable<ChartCell["compareMode"]>;

export function resolveChartCompareMode(cell: Pick<ChartCell, "compareMode">): ChartCompareMode {
  return cell.compareMode ?? "levels";
}

export function getNextChartCompareMode(current: ChartCompareMode): ChartCompareMode {
  switch (current) {
    case "levels":
      return "relative";
    case "relative":
      return "percent";
    case "percent":
      return "levels";
  }
}

export function formatChartCompareMode(mode: ChartCompareMode): string {
  switch (mode) {
    case "levels":
      return "Levels";
    case "relative":
      return "÷ baseline";
    case "percent":
      return "% vs baseline";
  }
}

/** True when relative/percent can be computed from a scenario + baseline result. */
export function canApplyChartCompareMode(args: {
  sourceRunCell?: RunCell | null;
  baselineStartPeriod?: number;
  baselineResult?: SimulationResult | null;
}): boolean {
  return (
    args.sourceRunCell?.mode === "scenario" &&
    args.baselineStartPeriod != null &&
    args.baselineResult != null
  );
}

/**
 * Transforms primary chart series relative to the linked baseline path.
 * Uses the same period alignment as baseline reference overlays.
 * Returns the input unchanged for `levels` or when baseline data is unavailable.
 */
export function applyChartCompareMode(args: {
  cell: Pick<ChartCell, "series" | "variables" | "compareMode">;
  series: ResolvedChartSeries[];
  sourceRunCell?: RunCell | null;
  baselineStartPeriod?: number;
  baselineResult?: SimulationResult | null;
}): ResolvedChartSeries[] {
  const compareMode = resolveChartCompareMode(args.cell);
  if (compareMode === "levels" || !canApplyChartCompareMode(args)) {
    return args.series;
  }

  const sourceRunCell = args.sourceRunCell!;
  const baselineResult = args.baselineResult!;
  const baselineStartPeriod = args.baselineStartPeriod!;
  const specs = resolveChartSeriesSpecs(args.cell);
  const startIndex = Math.max(baselineStartPeriod - 1, 0);
  const length = sourceRunCell.periods ?? args.series[0]?.values.length ?? 0;
  const baselineByHighlightKey = new Map(
    buildOverlaySeriesFromSpecs(specs, baselineResult, { startIndex, length }).map((entry) => [
      entry.highlightKey,
      entry
    ])
  );

  return args.series.map((entry) => {
    const baseline = baselineByHighlightKey.get(entry.highlightKey);
    if (!baseline) {
      return entry;
    }

    const values = entry.values.map((value, index) => {
      const baselineValue = baseline.values[index];
      if (!Number.isFinite(value) || !Number.isFinite(baselineValue)) {
        return Number.NaN;
      }
      if (baselineValue === 0) {
        return Number.NaN;
      }
      if (compareMode === "relative") {
        return value / baselineValue;
      }
      return ((value - baselineValue) / baselineValue) * 100;
    });

    return {
      ...entry,
      values,
      ...(compareMode === "percent" ? { unit: "%" } : {})
    };
  });
}

/** Baseline overlay is redundant once series are already vs-baseline. */
export function filterReferenceTracesForCompareMode(
  referenceTraces: ActiveReferenceTraceKind[],
  compareMode: ChartCompareMode
): ActiveReferenceTraceKind[] {
  if (compareMode === "levels") {
    return referenceTraces;
  }
  return referenceTraces.filter((trace) => trace !== "baseline");
}

/** Prefer including zero on the axis when plotting percent deviations. */
export function resolveCompareModeSharedRange(
  cell: Pick<ChartCell, "sharedRange" | "compareMode">,
  canApply: boolean
): ChartAxisRange | undefined {
  const compareMode = resolveChartCompareMode(cell);
  if (compareMode !== "percent" || !canApply) {
    return cell.sharedRange;
  }

  return {
    includeZero: true,
    ...cell.sharedRange
  };
}
