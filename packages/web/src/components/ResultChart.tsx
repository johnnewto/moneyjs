import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

interface ChartSeries {
  name: string;
  values: number[];
}

export type ChartAxisMode = "shared" | "separate";

export interface ChartAxisRange {
  includeZero?: boolean;
  max?: number;
  min?: number;
}

interface ResultChartProps {
  axisMode?: ChartAxisMode;
  axisSnapTolarance?: number;
  overlaySeries?: ChartSeries[];
  periodLabelOffset?: number;
  seriesRanges?: Record<string, ChartAxisRange | undefined>;
  selectedIndex?: number;
  series: ChartSeries[];
  sharedRange?: ChartAxisRange;
  timeRangeDefaults?: { endPeriodInclusive: number; startPeriodInclusive: number };
  timeRangeInclusive?: [number, number];
}

const SERIES_COLORS = ["#111827", "#ec4899", "#ea580c", "#6366f1", "#059669", "#0284c7"];
const AXIS_TICK_COUNT = 5;

export function ResultChart({
  axisMode = "shared",
  axisSnapTolarance,
  overlaySeries = [],
  periodLabelOffset = 0,
  seriesRanges,
  series,
  sharedRange,
  timeRangeDefaults,
  timeRangeInclusive,
  selectedIndex = 0
}: ResultChartProps) {
  const [hoveredDatum, setHoveredDatum] = useState<{ index: number; seriesName: string } | null>(null);
  const normalizedSeries = series
    .map((entry, index) => ({
      ...entry,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      finiteValues: entry.values.filter(Number.isFinite)
    }))
    .filter((entry) => entry.values.length > 1 && entry.finiteValues.length > 0);
  const normalizedOverlaySeries = overlaySeries
    .map((entry) => {
      const matchingSeries = normalizedSeries.find((candidate) => candidate.name === entry.name);
      return matchingSeries
        ? {
            ...entry,
            color: matchingSeries.color,
            finiteValues: entry.values.filter(Number.isFinite)
          }
        : null;
    })
    .filter(
      (
        entry
      ): entry is ChartSeries & { color: string; finiteValues: number[] } =>
        entry != null && entry.values.length > 1 && entry.finiteValues.length > 0
    );

  if (normalizedSeries.length === 0) {
    return null;
  }

  const width = 900;
  const height = 360;
  const topPadding = 26;
  const bottomPadding = 42;
  const rightPadding = 20;
  const axisSpacing = 42;
  const primaryAxisWidth = 56;
  const axisCount = axisMode === "separate" ? normalizedSeries.length : 1;
  const leftPadding = primaryAxisWidth + axisSpacing * Math.max(axisCount - 1, 0);
  const plotWidth = width - leftPadding - rightPadding;
  const plotHeight = height - topPadding - bottomPadding;
  const seriesLength = Math.max(...normalizedSeries.map((entry) => entry.values.length));
  const resolvedTimeRange = resolveTimeRange(timeRangeInclusive, timeRangeDefaults, seriesLength);
  const visibleStartIndex = resolvedTimeRange.startPeriodInclusive - 1;
  const visibleEndIndex = resolvedTimeRange.endPeriodInclusive - 1;
  const visibleLength = visibleEndIndex - visibleStartIndex + 1;
  const xTickCount = Math.min(6, visibleLength);
  const xTicks = buildIntegerTicks(visibleLength, xTickCount).map((tick) => visibleStartIndex + tick);
  const activeIndex = Math.min(Math.max(selectedIndex, visibleStartIndex), visibleEndIndex);
  const activeVisibleIndex = activeIndex - visibleStartIndex;

  const baseAxisMetrics = normalizedSeries.map((entry) => {
    const visibleValues = entry.values.slice(visibleStartIndex, visibleEndIndex + 1);

    return {
      ...entry,
      visibleValues,
      axisRangeConfig: seriesRanges?.[entry.name],
      ...buildAxisMetrics(visibleValues.filter(Number.isFinite), seriesRanges?.[entry.name])
    };
  });
  const axisMetrics =
    axisMode === "separate" ? snapAxisMetrics(baseAxisMetrics, axisSnapTolarance) : baseAxisMetrics;
  const sharedFiniteValues = axisMetrics.flatMap((entry) => entry.visibleValues.filter(Number.isFinite));
  const sharedMetrics = buildAxisMetrics(sharedFiniteValues, sharedRange);
  const primaryMetrics = axisMode === "shared" ? sharedMetrics : axisMetrics[0];
  const hoveredMetric = hoveredDatum
    ? axisMetrics.find((entry) => entry.name === hoveredDatum.seriesName) ?? null
    : null;
  const fallbackHoverVisibleIndex = activeVisibleIndex;
  const resolvedHoverVisibleIndex =
    hoveredDatum != null
      ? Math.min(Math.max(hoveredDatum.index, 0), Math.max(visibleLength - 1, 0))
      : fallbackHoverVisibleIndex;
  const ariaLabel =
    axisMode === "shared"
      ? "Simulation result chart with shared left axis"
      : "Simulation result chart with multiple left axes";
  const hoverTooltip =
    hoveredDatum && hoveredMetric
      ? buildHoverTooltip(
          hoveredMetric,
          resolvedHoverVisibleIndex,
          visibleStartIndex,
          periodLabelOffset,
          leftPadding,
          topPadding,
          plotWidth,
          plotHeight,
          axisMode === "shared" ? sharedMetrics.min : hoveredMetric.min,
          axisMode === "shared" ? sharedMetrics.range : hoveredMetric.range,
          visibleLength
        )
      : null;

  return (
    <section className="result-panel">
      <div className="panel-header">
        <h2>Chart</h2>
        <div className="chart-legend">
          {axisMetrics.map((entry) => (
            <span
              key={entry.name}
              className={`legend-item${
                hoveredDatum ? (hoveredDatum.seriesName === entry.name ? " is-active" : " is-dimmed") : ""
              }`}
              onMouseEnter={() =>
                setHoveredDatum({ index: fallbackHoverVisibleIndex, seriesName: entry.name })
              }
              onMouseLeave={() => setHoveredDatum(null)}
            >
              <span className="legend-swatch" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
          ))}
        </div>
      </div>

      <svg
        className="result-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHoveredDatum(null)}
        onMouseMove={(event) => {
          const nextHover = resolveHoveredDatum(
            event,
            axisMetrics,
            visibleStartIndex,
            leftPadding,
            topPadding,
            plotWidth,
            plotHeight,
            axisMode,
            sharedMetrics,
            visibleLength
          );
          if (nextHover) {
            setHoveredDatum(nextHover);
          }
        }}
      >
        <rect
          x={leftPadding}
          y={topPadding}
          width={plotWidth}
          height={plotHeight}
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth="1"
        />

        {primaryMetrics?.ticks.map((tick) => {
          const y = toY(tick, topPadding, plotHeight, primaryMetrics.min, primaryMetrics.range);
          return (
            <g key={`grid-${tick}`}>
              <line
                x1={leftPadding}
                x2={width - rightPadding}
                y1={y}
                y2={y}
                stroke="#cbd5e1"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {xTicks.map((tickIndex) => {
          const x = toX(tickIndex - visibleStartIndex, leftPadding, plotWidth, visibleLength);
          return (
            <g key={`xtick-${tickIndex}`}>
              <line
                x1={x}
                x2={x}
                y1={topPadding}
                y2={topPadding + plotHeight}
                stroke="#d1d5db"
                strokeWidth="1"
              />
              <text x={x} y={height - 12} fill="#111827" fontSize="11" textAnchor="middle">
                {tickIndex + 1 + periodLabelOffset}
              </text>
            </g>
          );
        })}

        <line
          x1={toX(activeVisibleIndex, leftPadding, plotWidth, visibleLength)}
          x2={toX(activeVisibleIndex, leftPadding, plotWidth, visibleLength)}
          y1={topPadding}
          y2={topPadding + plotHeight}
          stroke="#0f172a"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />

        {(axisMode === "shared" ? axisMetrics.slice(0, 1) : axisMetrics).map((entry, index) => {
          const axisX = leftPadding - axisSpacing * index;
          const labelX = axisX - 12;
          const axisHitLeft = labelX - 34;
          const axisHitWidth = 52;
          const hasHoverTarget = hoveredDatum != null;
          const isAxisActive = axisMode === "shared" || !hasHoverTarget || hoveredDatum?.seriesName === entry.name;
          const isAxisDimmed = axisMode === "separate" && hasHoverTarget && hoveredDatum?.seriesName !== entry.name;
          const axisStroke = axisMode === "shared" ? "#0f172a" : entry.color;
          const axisOpacity = isAxisDimmed ? 0.28 : 1;

          return (
            <g
              key={`axis-${entry.name}`}
              className={
                axisMode === "shared"
                  ? undefined
                  : `chart-axis${isAxisActive ? " is-active" : ""}${isAxisDimmed ? " is-dimmed" : ""}`
              }
              onMouseEnter={() =>
                setHoveredDatum({ index: fallbackHoverVisibleIndex, seriesName: entry.name })
              }
              onMouseLeave={() => setHoveredDatum(null)}
            >
              <rect
                x={axisHitLeft}
                y={topPadding - 18}
                width={axisHitWidth}
                height={plotHeight + 28}
                fill="transparent"
              />
              <line
                x1={axisX}
                x2={axisX}
                y1={topPadding}
                y2={topPadding + plotHeight}
                stroke={axisStroke}
                opacity={axisOpacity}
                strokeWidth="1.5"
              />

              <text
                x={axisX}
                y={topPadding - 8}
                fill={axisMode === "shared" ? "#111827" : entry.color}
                opacity={axisOpacity}
                fontSize="12"
                fontWeight="700"
                textAnchor="middle"
              >
                {axisMode === "shared" ? "Value" : entry.name}
              </text>

              {(axisMode === "shared" ? sharedMetrics.ticks : entry.ticks).map((tick) => {
                const y = toY(
                  tick,
                  topPadding,
                  plotHeight,
                  axisMode === "shared" ? sharedMetrics.min : entry.min,
                  axisMode === "shared" ? sharedMetrics.range : entry.range
                );
                return (
                  <g key={`${entry.name}-${tick}`}>
                    <line
                      x1={axisX - 6}
                      x2={axisX}
                      y1={y}
                      y2={y}
                      stroke={axisMode === "shared" ? "#0f172a" : entry.color}
                      opacity={axisOpacity}
                      strokeWidth="1.5"
                    />
                    <text
                      x={labelX}
                      y={y + 3}
                      fill={axisMode === "shared" ? "#111827" : entry.color}
                      opacity={axisOpacity}
                      fontSize="11"
                      textAnchor="end"
                    >
                      {formatAxisValue(tick)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {axisMetrics.map((entry, index) => (
          <g
            key={`series-${entry.name}`}
            className={`chart-series${
              hoveredDatum ? (hoveredDatum.seriesName === entry.name ? " is-active" : " is-dimmed") : ""
            }`}
          >
            {normalizedOverlaySeries
              .filter((overlay) => overlay.name === entry.name)
              .map((overlay) => (
                <polyline
                  key={`overlay-${entry.name}`}
                  fill="none"
                  points={toPolylinePoints(
                    overlay.values.slice(visibleStartIndex, visibleEndIndex + 1),
                    leftPadding,
                    topPadding,
                    plotWidth,
                    plotHeight,
                    axisMode === "shared" ? sharedMetrics.min : entry.min,
                    axisMode === "shared" ? sharedMetrics.range : entry.range
                  )}
                  pointerEvents="none"
                  stroke={entry.color}
                  strokeDasharray="5 5"
                  strokeOpacity={hoveredDatum ? (hoveredDatum.seriesName === entry.name ? 0.28 : 0.12) : 0.18}
                  strokeWidth="2"
                />
              ))}
            <polyline
              fill="none"
              points={toPolylinePoints(
                entry.visibleValues,
                leftPadding,
                topPadding,
                plotWidth,
                plotHeight,
                axisMode === "shared" ? sharedMetrics.min : entry.min,
                axisMode === "shared" ? sharedMetrics.range : entry.range
              )}
              stroke={entry.color}
              strokeOpacity={hoveredDatum ? (hoveredDatum.seriesName === entry.name ? 1 : 0.22) : 1}
              strokeWidth={
                hoveredDatum
                  ? hoveredDatum.seriesName === entry.name
                    ? 3.5
                    : 1.75
                  : index === 0
                    ? 2.75
                    : 2.25
              }
            />
            <circle
              cx={toX(activeVisibleIndex, leftPadding, plotWidth, visibleLength)}
              cy={toY(
                Number.isFinite(entry.visibleValues[activeVisibleIndex])
                  ? entry.visibleValues[activeVisibleIndex]
                  : entry.min,
                topPadding,
                plotHeight,
                axisMode === "shared" ? sharedMetrics.min : entry.min,
                axisMode === "shared" ? sharedMetrics.range : entry.range
              )}
              fill="#ffffff"
              r="4.5"
              opacity={hoveredDatum ? (hoveredDatum.seriesName === entry.name ? 0.5 : 0.18) : 1}
              stroke={entry.color}
              strokeWidth="2"
            />
          </g>
        ))}

        {hoverTooltip ? (
          <g className="chart-hover" pointerEvents="none">
            <line
              x1={hoverTooltip.x}
              x2={hoverTooltip.x}
              y1={topPadding}
              y2={topPadding + plotHeight}
              stroke={hoverTooltip.color}
              strokeDasharray="3 4"
              strokeWidth="1.5"
            />
            <circle
              cx={hoverTooltip.x}
              cy={hoverTooltip.y}
              fill="#ffffff"
              r="6"
              stroke={hoverTooltip.color}
              strokeWidth="3"
            />
            <g transform={`translate(${hoverTooltip.tooltipX}, ${hoverTooltip.tooltipY})`}>
              <rect
                width={hoverTooltip.tooltipWidth}
                height="42"
                rx="10"
                fill="rgba(15, 23, 42, 0.92)"
                stroke={hoverTooltip.color}
              />
              <text x="10" y="16" fill="#f8fafc" fontSize="11" fontWeight="700">
                {hoverTooltip.seriesName} • Period {hoverTooltip.period}
              </text>
              <text x="10" y="31" fill="#e2e8f0" fontSize="11">
                Value: {formatAxisValue(hoverTooltip.value)}
              </text>
            </g>
          </g>
        ) : null}

        <text
          x={leftPadding + plotWidth / 2}
          y={height - 2}
          fill="#111827"
          fontSize="12"
          textAnchor="middle"
        >
          Period
        </text>
      </svg>

      <div className={`chart-scale ${axisMode === "shared" ? "chart-scale-shared" : "chart-scale-multi"}`}>
        <span>
          Time axis: {resolvedTimeRange.startPeriodInclusive + periodLabelOffset} to {resolvedTimeRange.endPeriodInclusive + periodLabelOffset}
        </span>
        {axisMode === "shared" ? (
          <span>Shared axis: {formatAxisValue(sharedMetrics.min)} to {formatAxisValue(sharedMetrics.max)}</span>
        ) : (
          axisMetrics.map((entry) => (
            <span key={`scale-${entry.name}`} style={{ color: entry.color }}>
              {entry.name}: {formatAxisValue(entry.min)} to {formatAxisValue(entry.max)}
            </span>
          ))
        )}
      </div>
    </section>
  );
}

function buildHoverTooltip(
  metric: {
    color: string;
    name: string;
    visibleValues: number[];
    min: number;
    range: number;
  },
  visibleIndex: number,
  visibleStartIndex: number,
  periodLabelOffset: number,
  leftPadding: number,
  topPadding: number,
  plotWidth: number,
  plotHeight: number,
  min: number,
  range: number,
  visibleLength: number
): {
  color: string;
  period: number;
  seriesName: string;
  tooltipWidth: number;
  tooltipX: number;
  tooltipY: number;
  value: number;
  x: number;
  y: number;
} {
  const value = metric.visibleValues[visibleIndex] ?? NaN;
  const x = toX(visibleIndex, leftPadding, plotWidth, visibleLength);
  const y = toY(Number.isFinite(value) ? value : min, topPadding, plotHeight, min, range);
  const tooltipWidth = 140;
  const prefersLeft = x > leftPadding + plotWidth * 0.72;

  return {
    color: metric.color,
    period: visibleStartIndex + visibleIndex + 1 + periodLabelOffset,
    seriesName: metric.name,
    tooltipWidth,
    tooltipX: prefersLeft ? x - tooltipWidth - 12 : x + 12,
    tooltipY: Math.max(topPadding + 8, Math.min(y - 50, topPadding + plotHeight - 50)),
    value,
    x,
    y
  };
}

function resolveHoveredDatum(
  event: ReactMouseEvent<SVGSVGElement>,
  axisMetrics: Array<{
    name: string;
    visibleValues: number[];
    min: number;
    range: number;
  }>,
  visibleStartIndex: number,
  leftPadding: number,
  topPadding: number,
  plotWidth: number,
  plotHeight: number,
  axisMode: ChartAxisMode,
  sharedMetrics: { min: number; range: number },
  visibleLength: number
): { index: number; seriesName: string } | null {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const scaleX = 900 / rect.width;
  const scaleY = 360 / rect.height;
  const svgX = (event.clientX - rect.left) * scaleX;
  const svgY = (event.clientY - rect.top) * scaleY;

  if (
    svgX < leftPadding ||
    svgX > leftPadding + plotWidth ||
    svgY < topPadding ||
    svgY > topPadding + plotHeight
  ) {
    return null;
  }

  const relativeX = svgX - leftPadding;
  const hoveredIndex = Math.min(
    Math.max(Math.round((relativeX / Math.max(plotWidth, 1)) * Math.max(visibleLength - 1, 0)), 0),
    Math.max(visibleLength - 1, 0)
  );
  let closest: { distance: number; seriesName: string } | undefined;

  axisMetrics.forEach((entry) => {
    const value = entry.visibleValues[hoveredIndex];
    if (!Number.isFinite(value)) {
      return;
    }

    const y = toY(
      value,
      topPadding,
      plotHeight,
      axisMode === "shared" ? sharedMetrics.min : entry.min,
      axisMode === "shared" ? sharedMetrics.range : entry.range
    );
    const distance = Math.abs(svgY - y);

    if (!closest || distance < closest.distance) {
      closest = { distance, seriesName: entry.name };
    }
  });

  return closest ? { index: hoveredIndex, seriesName: closest.seriesName } : null;
}

function resolveTimeRange(
  timeRangeInclusive: [number, number] | undefined,
  defaults: { endPeriodInclusive: number; startPeriodInclusive: number } | undefined,
  seriesLength: number
): { endPeriodInclusive: number; startPeriodInclusive: number } {
  const fullRange = {
    startPeriodInclusive: 1,
    endPeriodInclusive: Math.max(seriesLength, 1)
  };
  const autoRange = clampTimeRange(defaults ?? fullRange, fullRange);

  if (!timeRangeInclusive) {
    return autoRange;
  }

  return clampTimeRange(
    {
      startPeriodInclusive: timeRangeInclusive[0],
      endPeriodInclusive: timeRangeInclusive[1]
    },
    fullRange
  );
}

function clampTimeRange(
  range: { endPeriodInclusive: number; startPeriodInclusive: number },
  bounds: { endPeriodInclusive: number; startPeriodInclusive: number }
): { endPeriodInclusive: number; startPeriodInclusive: number } {
  const startPeriodInclusive = Math.min(
    Math.max(Math.round(range.startPeriodInclusive), bounds.startPeriodInclusive),
    bounds.endPeriodInclusive
  );
  const endPeriodInclusive = Math.max(
    startPeriodInclusive,
    Math.min(Math.round(range.endPeriodInclusive), bounds.endPeriodInclusive)
  );

  return { startPeriodInclusive, endPeriodInclusive };
}

function buildAxisMetrics(
  finiteValues: number[],
  axisRange?: ChartAxisRange
): { min: number; max: number; range: number; ticks: number[] } {
  const autoBounds = buildAutoBounds(finiteValues, axisRange?.includeZero === true);
  const manualMin = axisRange?.min;
  const manualMax = axisRange?.max;
  const resolvedMin = manualMin ?? autoBounds.min;
  const resolvedMax = manualMax ?? autoBounds.max;

  if (!(resolvedMin < resolvedMax)) {
    throw new Error("Axis range min must be less than max.");
  }

  return {
    min: resolvedMin,
    max: resolvedMax,
    range: resolvedMax - resolvedMin || 1,
    ticks: buildNumericTicks(resolvedMin, resolvedMax, AXIS_TICK_COUNT)
  };
}

function buildAutoBounds(finiteValues: number[], includeZero: boolean): { min: number; max: number } {
  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const range = maxValue - minValue || Math.max(Math.abs(maxValue), 1);
  let paddedMin = minValue === maxValue ? minValue - range * 0.05 : minValue;
  let paddedMax = minValue === maxValue ? maxValue + range * 0.05 : maxValue;

  if (includeZero) {
    paddedMin = Math.min(paddedMin, 0);
    paddedMax = Math.max(paddedMax, 0);
  }

  if (paddedMin === paddedMax) {
    paddedMax = paddedMin + 1;
  }

  return { min: paddedMin, max: paddedMax };
}

function snapAxisMetrics<
  T extends {
    axisRangeConfig?: ChartAxisRange;
    max: number;
    min: number;
    range: number;
    ticks: number[];
  }
>(metrics: T[], axisSnapTolarance?: number): T[] {
  if (axisSnapTolarance == null || metrics.length < 2) {
    return metrics;
  }

  const tolerance = axisSnapTolarance;
  const nextMetrics = [...metrics];
  const visited = new Set<number>();

  for (let index = 0; index < nextMetrics.length; index += 1) {
    if (visited.has(index)) {
      continue;
    }

    const baseMetric = nextMetrics[index];
    if (baseMetric.axisRangeConfig?.min != null || baseMetric.axisRangeConfig?.max != null) {
      visited.add(index);
      continue;
    }

    const group = [index];
    for (let candidateIndex = index + 1; candidateIndex < nextMetrics.length; candidateIndex += 1) {
      const candidate = nextMetrics[candidateIndex];
      if (candidate.axisRangeConfig?.min != null || candidate.axisRangeConfig?.max != null) {
        continue;
      }

      if (rangesAreSnapCompatible(baseMetric, candidate, tolerance)) {
        group.push(candidateIndex);
      }
    }

    if (group.length === 1) {
      visited.add(index);
      continue;
    }

    const snappedMin = Math.min(...group.map((groupIndex) => nextMetrics[groupIndex].min));
    const snappedMax = Math.max(...group.map((groupIndex) => nextMetrics[groupIndex].max));
    const snappedRange = snappedMax - snappedMin || 1;
    const snappedTicks = buildNumericTicks(snappedMin, snappedMax, AXIS_TICK_COUNT);

    group.forEach((groupIndex) => {
      nextMetrics[groupIndex] = {
        ...nextMetrics[groupIndex],
        min: snappedMin,
        max: snappedMax,
        range: snappedRange,
        ticks: snappedTicks
      };
      visited.add(groupIndex);
    });
  }

  return nextMetrics;
}

function rangesAreSnapCompatible(
  left: { min: number; max: number; range: number },
  right: { min: number; max: number; range: number },
  tolerance: number
): boolean {
  const referenceRange = Math.max(left.range, right.range, 1);
  return (
    Math.abs(left.min - right.min) <= tolerance * referenceRange &&
    Math.abs(left.max - right.max) <= tolerance * referenceRange
  );
}

function toPolylinePoints(
  values: number[],
  leftPadding: number,
  topPadding: number,
  plotWidth: number,
  plotHeight: number,
  min: number,
  range: number
): string {
  return values
    .map((value, index) => {
      const x = toX(index, leftPadding, plotWidth, values.length);
      const safeValue = Number.isFinite(value) ? value : min;
      const y = toY(safeValue, topPadding, plotHeight, min, range);
      return `${x},${y}`;
    })
    .join(" ");
}

function toX(index: number, leftPadding: number, plotWidth: number, length: number): number {
  const xStep = plotWidth / Math.max(length - 1, 1);
  return leftPadding + index * xStep;
}

function toY(
  value: number,
  topPadding: number,
  plotHeight: number,
  min: number,
  range: number
): number {
  const rawY = topPadding + plotHeight - ((value - min) / range) * plotHeight;
  return Math.max(topPadding, Math.min(topPadding + plotHeight, rawY));
}

function buildNumericTicks(min: number, max: number, count: number): number[] {
  if (count <= 1) {
    return [min];
  }

  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function buildIntegerTicks(length: number, count: number): number[] {
  if (length <= 1) {
    return [0];
  }

  const ticks = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    ticks.add(Math.round(((length - 1) * index) / Math.max(count - 1, 1)));
  }
  return Array.from(ticks).sort((left, right) => left - right);
}

function formatAxisValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }

  const abs = Math.abs(value);
  if (abs >= 1e12) {
    return `${(value / 1e12).toFixed(1)}T`;
  }
  if (abs >= 1e9) {
    return `${(value / 1e9).toFixed(1)}G`;
  }
  if (abs >= 1e6) {
    return `${(value / 1e6).toFixed(1)}M`;
  }
  if (abs >= 1e3) {
    return `${(value / 1e3).toFixed(1)}K`;
  }
  if (abs >= 10) {
    return value.toFixed(1);
  }
  if (abs >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}
