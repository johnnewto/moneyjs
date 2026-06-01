import { buildAxisMetrics, formatAxisValue, toPolylinePoints, toX, toY } from "./ResultChartScales";

const CHART_WIDTH = 200;
const CHART_HEIGHT = 104;
const PADDING = { left: 4, top: 8, right: 4, bottom: 8 };

export function VariableInspectorSparkline({
  selectedPeriodIndex,
  seriesValues
}: {
  selectedPeriodIndex?: number;
  seriesValues: number[];
}) {
  const finiteValues = seriesValues.filter(Number.isFinite);
  if (seriesValues.length <= 1 || finiteValues.length === 0) {
    return null;
  }

  const metrics = buildAxisMetrics(finiteValues);
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const points = toPolylinePoints(
    seriesValues,
    PADDING.left,
    PADDING.top,
    plotWidth,
    plotHeight,
    metrics.min,
    metrics.range
  );

  const activeIndex =
    selectedPeriodIndex == null
      ? seriesValues.length - 1
      : Math.min(Math.max(0, selectedPeriodIndex), seriesValues.length - 1);
  const activeValue = seriesValues[activeIndex];
  const showMarker = Number.isFinite(activeValue);
  const markerX = toX(activeIndex, PADDING.left, plotWidth, seriesValues.length);
  const markerY = toY(
    activeValue,
    PADDING.top,
    plotHeight,
    metrics.min,
    metrics.range
  );

  return (
    <div
      aria-label={`Time path for selected variable, period ${activeIndex + 1}, min ${formatAxisValue(metrics.min)}, max ${formatAxisValue(metrics.max)}`}
      className="variable-inspector-sparkline-wrap"
      role="img"
    >
      <svg
        aria-hidden="true"
        className="variable-inspector-sparkline"
        preserveAspectRatio="none"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <polyline
          className="variable-inspector-sparkline-line"
          fill="none"
          points={points}
        />
        {showMarker ? (
          <>
            <circle
              className="variable-inspector-sparkline-marker-ring"
              cx={markerX}
              cy={markerY}
              r="4.5"
            />
            <circle
              className="variable-inspector-sparkline-marker"
              cx={markerX}
              cy={markerY}
              r="2.5"
            />
          </>
        ) : null}
      </svg>
      <div className="variable-inspector-sparkline-range">
        {`min = ${formatAxisValue(metrics.min)}, max = ${formatAxisValue(metrics.max)}`}
      </div>
    </div>
  );
}
