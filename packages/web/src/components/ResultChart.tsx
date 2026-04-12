interface ChartSeries {
  name: string;
  values: number[];
}

interface ResultChartProps {
  selectedIndex?: number;
  series: ChartSeries[];
}

const SERIES_COLORS = ["#111827", "#ec4899", "#ea580c", "#6366f1", "#059669", "#0284c7"];
const AXIS_TICK_COUNT = 5;

export function ResultChart({ series, selectedIndex = 0 }: ResultChartProps) {
  const normalizedSeries = series
    .map((entry, index) => ({
      ...entry,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      finiteValues: entry.values.filter(Number.isFinite)
    }))
    .filter((entry) => entry.values.length > 1 && entry.finiteValues.length > 0);

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
  const leftPadding = primaryAxisWidth + axisSpacing * Math.max(normalizedSeries.length - 1, 0);
  const plotWidth = width - leftPadding - rightPadding;
  const plotHeight = height - topPadding - bottomPadding;
  const xTickCount = Math.min(6, normalizedSeries[0]?.values.length ?? 6);
  const xTicks = buildIntegerTicks(normalizedSeries[0]?.values.length ?? 0, xTickCount);
  const activeIndex = Math.min(
    Math.max(selectedIndex, 0),
    Math.max((normalizedSeries[0]?.values.length ?? 1) - 1, 0)
  );

  const axisMetrics = normalizedSeries.map((entry) => {
    const minValue = Math.min(...entry.finiteValues);
    const maxValue = Math.max(...entry.finiteValues);
    const range = maxValue - minValue || Math.max(Math.abs(maxValue), 1);
    const paddedMin = minValue === maxValue ? minValue - range * 0.05 : minValue;
    const paddedMax = minValue === maxValue ? maxValue + range * 0.05 : maxValue;

    return {
      ...entry,
      min: paddedMin,
      max: paddedMax,
      range: paddedMax - paddedMin || 1,
      ticks: buildNumericTicks(paddedMin, paddedMax, AXIS_TICK_COUNT)
    };
  });

  return (
    <section className="result-panel">
      <div className="panel-header">
        <h2>Chart</h2>
        <div className="chart-legend">
          {axisMetrics.map((entry) => (
            <span key={entry.name} className="legend-item">
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
        aria-label="Simulation result chart with multiple left axes"
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

        {axisMetrics[0]?.ticks.map((tick) => {
          const y = toY(tick, topPadding, plotHeight, axisMetrics[0].min, axisMetrics[0].range);
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
          const x = toX(tickIndex, leftPadding, plotWidth, normalizedSeries[0].values.length);
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
                {tickIndex + 1}
              </text>
            </g>
          );
        })}

        <line
          x1={toX(activeIndex, leftPadding, plotWidth, normalizedSeries[0].values.length)}
          x2={toX(activeIndex, leftPadding, plotWidth, normalizedSeries[0].values.length)}
          y1={topPadding}
          y2={topPadding + plotHeight}
          stroke="#0f172a"
          strokeDasharray="4 4"
          strokeWidth="1.5"
        />

        {axisMetrics.map((entry, index) => {
          const axisX = leftPadding - axisSpacing * index;
          const labelX = axisX - 12;

          return (
            <g key={`axis-${entry.name}`}>
              <line
                x1={axisX}
                x2={axisX}
                y1={topPadding}
                y2={topPadding + plotHeight}
                stroke="#0f172a"
                strokeWidth="1.5"
              />

              <text
                x={axisX}
                y={topPadding - 8}
                fill={entry.color}
                fontSize="12"
                fontWeight="700"
                textAnchor="middle"
              >
                {entry.name}
              </text>

              {entry.ticks.map((tick) => {
                const y = toY(tick, topPadding, plotHeight, entry.min, entry.range);
                return (
                  <g key={`${entry.name}-${tick}`}>
                    <line
                      x1={axisX - 6}
                      x2={axisX}
                      y1={y}
                      y2={y}
                      stroke={entry.color}
                      strokeWidth="1.5"
                    />
                    <text
                      x={labelX}
                      y={y + 3}
                      fill={entry.color}
                      fontSize="11"
                      textAnchor="end"
                    >
                      {formatAxisValue(tick)}
                    </text>
                  </g>
                );
              })}

              <polyline
                fill="none"
                points={toPolylinePoints(entry.values, leftPadding, topPadding, plotWidth, plotHeight, entry.min, entry.range)}
                stroke={entry.color}
                strokeWidth={index === 0 ? 2.75 : 2.25}
              />
              <circle
                cx={toX(activeIndex, leftPadding, plotWidth, entry.values.length)}
                cy={toY(
                  Number.isFinite(entry.values[activeIndex]) ? entry.values[activeIndex] : entry.min,
                  topPadding,
                  plotHeight,
                  entry.min,
                  entry.range
                )}
                fill="#ffffff"
                r="4.5"
                stroke={entry.color}
                strokeWidth="2"
              />
            </g>
          );
        })}

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

      <div className="chart-scale chart-scale-multi">
        {axisMetrics.map((entry) => (
          <span key={`scale-${entry.name}`} style={{ color: entry.color }}>
            {entry.name}: {formatAxisValue(entry.min)} to {formatAxisValue(entry.max)}
          </span>
        ))}
      </div>
    </section>
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
  return topPadding + plotHeight - ((value - min) / range) * plotHeight;
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
