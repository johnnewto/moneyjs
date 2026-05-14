import { useEffect, useId, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { formatVariableTooltip, type VariableUnitMetadata } from "../lib/unitMeta";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { getVariableUnitLabel } from "../lib/units";
import { InstantTooltip } from "./InstantTooltip";
import {
  DEFAULT_AXIS_TICK_COUNT,
  buildAxisMetrics,
  buildIntegerTicks,
  formatAxisValue,
  resolveTimeRange,
  snapAxisMetrics,
  toPolylinePoints,
  toX,
  toY,
  type ChartAxisRange
} from "./ResultChartScales";
import { VariableMathLabel, renderVariableMathSvgLabel } from "./VariableMathLabel";

interface ChartSeries {
  name: string;
  values: number[];
}

export type ChartAxisMode = "shared" | "separate";
export type { ChartAxisRange } from "./ResultChartScales";

interface ResultChartProps {
  addVariableOptions?: string[];
  axisMode?: ChartAxisMode;
  axisSnapTolarance?: number;
  niceScale?: boolean;
  onAddVariable?(variableName: string): void;
  onMoveVariable?(variableName: string, direction: "left" | "right"): void;
  onRemoveVariable?(variableName: string): void;
  overlaySeries?: ChartSeries[];
  periodLabelOffset?: number;
  seriesRanges?: Record<string, ChartAxisRange | undefined>;
  selectedIndex?: number;
  series: ChartSeries[];
  sharedRange?: ChartAxisRange;
  timeRangeDefaults?: { endPeriodInclusive: number; startPeriodInclusive: number };
  timeRangeInclusive?: [number, number];
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
  yAxisTickCount?: number;
}

const SERIES_COLORS = ["#111827", "#ec4899", "#ea580c", "#6366f1", "#059669", "#0284c7"];
const X_TICK_LABEL_OFFSET = 16;

export function ResultChart({
  addVariableOptions,
  axisMode = "shared",
  axisSnapTolarance,
  niceScale = false,
  onAddVariable,
  onMoveVariable,
  onRemoveVariable,
  overlaySeries = [],
  periodLabelOffset = 0,
  seriesRanges,
  series,
  sharedRange,
  timeRangeDefaults,
  timeRangeInclusive,
  variableDescriptions,
  variableUnitMetadata,
  yAxisTickCount = DEFAULT_AXIS_TICK_COUNT,
  selectedIndex = 0
}: ResultChartProps) {
  const [hoveredDatum, setHoveredDatum] = useState<{ index: number; seriesName: string } | null>(null);
  const [hiddenSeriesNames, setHiddenSeriesNames] = useState<Set<string>>(() => new Set());
  const [isAddVariableMenuOpen, setIsAddVariableMenuOpen] = useState(false);
  const [openLegendMenuSeriesName, setOpenLegendMenuSeriesName] = useState<string | null>(null);
  const addVariableMenuRef = useRef<HTMLDivElement | null>(null);
  const addVariableMenuId = useId();
  const normalizedSeries = series
    .map((entry, index) => ({
      ...entry,
      colorIndex: index % SERIES_COLORS.length,
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

  const visibleSeries = normalizedSeries.filter((entry) => !hiddenSeriesNames.has(entry.name));
  const visibleSeriesNames = new Set(visibleSeries.map((entry) => entry.name));
  const visibleOverlaySeries = normalizedOverlaySeries.filter((entry) => visibleSeriesNames.has(entry.name));

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
  const seriesLength = Math.max(...visibleSeries.map((entry) => entry.values.length));
  const resolvedTimeRange = resolveTimeRange(timeRangeInclusive, timeRangeDefaults, seriesLength);
  const visibleStartIndex = resolvedTimeRange.startPeriodInclusive - 1;
  const visibleEndIndex = resolvedTimeRange.endPeriodInclusive - 1;
  const visibleLength = visibleEndIndex - visibleStartIndex + 1;
  const xTickCount = Math.min(6, visibleLength);
  const xTicks = buildIntegerTicks(visibleLength, xTickCount).map((tick) => visibleStartIndex + tick);
  const activeIndex = Math.min(Math.max(selectedIndex, visibleStartIndex), visibleEndIndex);
  const activeVisibleIndex = activeIndex - visibleStartIndex;

  const baseAxisMetrics = visibleSeries.map((entry) => {
    const visibleValues = entry.values.slice(visibleStartIndex, visibleEndIndex + 1);
    const visibleReferenceValues = visibleOverlaySeries
      .filter((overlay) => overlay.name === entry.name)
      .flatMap((overlay) => overlay.values.slice(visibleStartIndex, visibleEndIndex + 1));

    return {
      ...entry,
      visibleValues,
      visibleScaleValues: [...visibleValues, ...visibleReferenceValues],
      axisRangeConfig: seriesRanges?.[entry.name],
      ...buildAxisMetrics(
        [...visibleValues, ...visibleReferenceValues].filter(Number.isFinite),
        seriesRanges?.[entry.name],
        yAxisTickCount,
        { exactTickCount: axisMode === "separate", niceScale }
      )
    };
  });
  const axisMetrics =
    axisMode === "separate"
      ? snapAxisMetrics(baseAxisMetrics, axisSnapTolarance, { exactTickCount: true, niceScale })
      : baseAxisMetrics;
  const sharedFiniteValues = axisMetrics.flatMap((entry) => entry.visibleScaleValues.filter(Number.isFinite));
  const sharedMetrics = buildAxisMetrics(sharedFiniteValues, sharedRange, yAxisTickCount, {
    niceScale
  });
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
          visibleLength,
          variableDescriptions,
          variableUnitMetadata
        )
      : null;
  const selectableVariableNames = (addVariableOptions ?? []).filter(
    (name) => !normalizedSeries.some((entry) => entry.name === name)
  );
  const canAddVariable = onAddVariable != null && selectableVariableNames.length > 0;
  const hasLegendContextMenu = onMoveVariable != null || onRemoveVariable != null;

  useEffect(() => {
    if (!canAddVariable && isAddVariableMenuOpen) {
      setIsAddVariableMenuOpen(false);
    }
  }, [canAddVariable, isAddVariableMenuOpen]);

  useEffect(() => {
    if (!isAddVariableMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && addVariableMenuRef.current?.contains(target)) {
        return;
      }

      setIsAddVariableMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsAddVariableMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAddVariableMenuOpen]);

  useEffect(() => {
    if (!openLegendMenuSeriesName) {
      return undefined;
    }

    function handleClick(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Element && target.closest(".chart-legend-context-menu")) {
        return;
      }

      setOpenLegendMenuSeriesName(null);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpenLegendMenuSeriesName(null);
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openLegendMenuSeriesName]);

  function toggleSeriesVisibility(seriesName: string): void {
    setHiddenSeriesNames((current) => {
      const next = new Set(current);
      if (next.has(seriesName)) {
        next.delete(seriesName);
        return next;
      }

      if (normalizedSeries.length - next.size <= 1) {
        return current;
      }

      next.add(seriesName);
      return next;
    });

    setHoveredDatum((current) => (current?.seriesName === seriesName ? null : current));
  }

  return (
    <section className="result-panel">
      <div className="panel-header">
        <h2>Chart</h2>
        <div className="chart-legend">
          {onAddVariable ? (
            <div className="legend-item legend-item-add chart-legend-add" ref={addVariableMenuRef}>
              <button
                type="button"
                className="chart-legend-add-button"
                aria-controls={addVariableMenuId}
                aria-expanded={isAddVariableMenuOpen ? "true" : "false"}
                aria-label={
                  canAddVariable ? "Add chart variable" : "No more variables available to add"
                }
                disabled={!canAddVariable}
                onClick={() => {
                  if (!canAddVariable) {
                    return;
                  }

                  setIsAddVariableMenuOpen((current) => !current);
                }}
              >
                <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.25" />
                  <path d="M8 3.25v9.5M3.25 8h9.5" />
                </svg>
              </button>
              {isAddVariableMenuOpen ? (
                <div
                  id={addVariableMenuId}
                  className="chart-legend-add-menu"
                  role="listbox"
                  aria-label="Available chart variables"
                >
                  {selectableVariableNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="chart-legend-add-option"
                      role="option"
                      onClick={() => {
                        onAddVariable(name);
                        setIsAddVariableMenuOpen(false);
                      }}
                    >
                      <span className="chart-legend-add-option-name">
                        <VariableMathLabel name={name} />
                      </span>
                      {variableDescriptions?.get(name) ? (
                        <span className="chart-legend-add-option-description">
                          {variableDescriptions.get(name)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {normalizedSeries.map((entry, entryIndex) => {
            const isHidden = hiddenSeriesNames.has(entry.name);
            const isHovered = hoveredDatum?.seriesName === entry.name;
            const isLegendMenuOpen = openLegendMenuSeriesName === entry.name;
            const className = `legend-item${
              isHidden
                ? " is-hidden"
                : hoveredDatum
                  ? isHovered
                    ? " is-active"
                    : " is-dimmed"
                  : ""
            }`;

            return (
              <InstantTooltip
                key={entry.name}
                className={className}
                onMouseEnter={() => {
                  if (!isHidden) {
                    setHoveredDatum({ index: fallbackHoverVisibleIndex, seriesName: entry.name });
                  }
                }}
                onMouseLeave={() => setHoveredDatum(null)}
                onContextMenu={(event: ReactMouseEvent<HTMLElement>) => {
                  if (!hasLegendContextMenu) {
                    return;
                  }

                  event.preventDefault();
                  setIsAddVariableMenuOpen(false);
                  setOpenLegendMenuSeriesName((current) =>
                    current === entry.name ? null : entry.name
                  );
                }}
                tooltip={formatVariableTooltip(
                  variableDescriptions?.get(entry.name),
                  variableUnitMetadata?.get(entry.name)
                )}
              >
                {isHidden ? (
                  <button
                    type="button"
                    className="legend-toggle"
                    aria-label={`Show ${entry.name} trace`}
                    aria-pressed="false"
                    onClick={() => toggleSeriesVisibility(entry.name)}
                    onBlur={() => setHoveredDatum(null)}
                  >
                    <span className={`legend-swatch legend-swatch-${entry.colorIndex}`} aria-hidden="true">
                      <svg viewBox="0 0 16 16" focusable="false">
                        <circle cx="8" cy="8" r="6.25" />
                        <path d="M5 5l6 6M11 5l-6 6" />
                      </svg>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="legend-toggle"
                    aria-label={`Hide ${entry.name} trace`}
                    aria-pressed="true"
                    onClick={() => toggleSeriesVisibility(entry.name)}
                    onFocus={() => setHoveredDatum({ index: fallbackHoverVisibleIndex, seriesName: entry.name })}
                    onBlur={() => setHoveredDatum(null)}
                  >
                    <span className={`legend-swatch legend-swatch-${entry.colorIndex}`} aria-hidden="true">
                      <svg viewBox="0 0 16 16" focusable="false">
                        <circle cx="8" cy="8" r="6.25" />
                        <path d="M4.75 8.4l2.1 2.15 4.35-4.65" />
                      </svg>
                    </span>
                  </button>
                )}
                <span className="legend-label">
                  <VariableMathLabel name={entry.name} />
                </span>
                {getVariableUnitLabel(variableUnitMetadata ?? new Map(), entry.name) ? (
                  <span className="unit-badge">
                    {getVariableUnitLabel(variableUnitMetadata ?? new Map(), entry.name)}
                  </span>
                ) : null}
                {isLegendMenuOpen ? (
                  <div
                    className="chart-legend-context-menu"
                    role="menu"
                    aria-label={`${entry.name} chart variable actions`}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    {onRemoveVariable ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={normalizedSeries.length <= 1}
                        onClick={() => {
                          onRemoveVariable(entry.name);
                          setOpenLegendMenuSeriesName(null);
                        }}
                      >
                        Remove from chart
                      </button>
                    ) : null}
                    {onMoveVariable ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={entryIndex === 0}
                          onClick={() => {
                            onMoveVariable(entry.name, "left");
                            setOpenLegendMenuSeriesName(null);
                          }}
                        >
                          Move left
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={entryIndex === normalizedSeries.length - 1}
                          onClick={() => {
                            onMoveVariable(entry.name, "right");
                            setOpenLegendMenuSeriesName(null);
                          }}
                        >
                          Move right
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </InstantTooltip>
            );
          })}
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

        {/* Horizontal grid lines and Y-axis tick labels share the same tick list. */}
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
              <text
                x={x}
                y={topPadding + plotHeight + X_TICK_LABEL_OFFSET}
                fill="#111827"
                fontSize="11"
                textAnchor="middle"
              >
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
              {axisMode === "shared" ? null : (
                <title>
                  {formatVariableTooltip(
                    variableDescriptions?.get(entry.name),
                    variableUnitMetadata?.get(entry.name)
                  )}
                </title>
              )}
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
                {axisMode === "shared" ? "Value" : renderVariableMathSvgLabel(entry.name)}
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
            {visibleOverlaySeries
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
                  strokeWidth={
                    hoveredDatum
                      ? hoveredDatum.seriesName === entry.name
                        ? 3
                        : 1.5
                      : 2
                  }
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
                height={hoverTooltip.unitLabel ? "56" : "42"}
                rx="10"
                fill="rgba(15, 23, 42, 0.92)"
                stroke={hoverTooltip.color}
              />
              <text x="10" y="16" fill="#f8fafc" fontSize="11" fontWeight="700">
                {renderVariableMathSvgLabel(hoverTooltip.seriesName)} •{" "}
                {hoverTooltip.description ? hoverTooltip.description : `Period ${hoverTooltip.period}`}
              </text>
              <text x="10" y="31" fill="#e2e8f0" fontSize="11">
                <tspan>Value: </tspan>
                <tspan fill={hoverTooltip.value < 0 ? "#b42318" : "#e2e8f0"}>
                  {formatAxisValue(hoverTooltip.value)}
                </tspan>
              </text>
              {hoverTooltip.unitLabel ? (
                <text x="10" y="46" fill="#cbd5e1" fontSize="11">
                  Units: {hoverTooltip.unitLabel}
                </text>
              ) : null}
              {hoverTooltip.description ? (
                <title>{`${hoverTooltip.seriesName}: ${hoverTooltip.description}`}</title>
              ) : null}
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
          <span>
            Shared axis: <span className={sharedMetrics.min < 0 ? "numeric-value-negative" : undefined}>{formatAxisValue(sharedMetrics.min)}</span> to <span className={sharedMetrics.max < 0 ? "numeric-value-negative" : undefined}>{formatAxisValue(sharedMetrics.max)}</span>
          </span>
        ) : (
          axisMetrics.map((entry) => (
            <InstantTooltip
              as="span"
              key={`scale-${entry.name}`}
              style={{ color: entry.color }}
              tooltip={formatVariableTooltip(
                variableDescriptions?.get(entry.name),
                variableUnitMetadata?.get(entry.name)
              )}
            >
              <VariableMathLabel name={entry.name} />: <span className={entry.min < 0 ? "numeric-value-negative" : undefined}>{formatAxisValue(entry.min)}</span> to <span className={entry.max < 0 ? "numeric-value-negative" : undefined}>{formatAxisValue(entry.max)}</span>
            </InstantTooltip>
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
  visibleLength: number,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: VariableUnitMetadata
): {
  color: string;
  description?: string;
  period: number;
  seriesName: string;
  unitLabel?: string | null;
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
    description: variableDescriptions?.get(metric.name),
    unitLabel: getVariableUnitLabel(variableUnitMetadata ?? new Map(), metric.name),
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

