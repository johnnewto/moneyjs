Chart cells plot variables from a run result. They are the fastest way to see model dynamics, compare scenario paths, and spot unexpected behavior.

## How To Use

1. Make sure the source run cell has been run successfully.
2. Press **Edit** on the chart cell if you need to change its source or variables.
3. Choose the run cell with `sourceRunCellId`.
4. Add variables to the `variables` list.
5. Apply the change and run the source run if needed.

A chart cell reads output from a run cell. It does not run the model by itself.

## Variables

The `variables` list controls which series appear in the chart:

```json
{
  "type": "chart",
  "sourceRunCellId": "baseline-run",
  "variables": ["Y", "Cd", "Mh"]
}
```

Choose variables that answer one question at a time. For example:

- Income and demand: `Y`, `Cd`, `Id`.
- Stocks: `Mh`, `Ld`, `K`, `Vh`.
- Prices or rates: `W`, `rl`, `rm`.
- Scenario comparison: a small group of variables most affected by the shock.

## Expression Series

Use `series` when you need derived quantities such as portfolio shares or percentage transforms. Each entry evaluates an expression against the source run result using the same syntax as model and matrix cells (`+`, `-`, `*`, `/`, `lag(...)`, `d(...)`, and so on).

When `series` is non-empty, it takes precedence over `variables`.

```json
{
  "type": "chart",
  "sourceRunCellId": "scenario-1-run",
  "timeRangeInclusive": [2, 25],
  "axisMode": "separate",
  "series": [
    {
      "expression": "100 * h_h / v",
      "label": "Share of money balances"
    },
    {
      "expression": "100 * b_h / v",
      "label": "Share of bills"
    }
  ]
}
```

Optional per-series fields:

- `label` for legend text (defaults to the expression).
- `range` for y-axis bounds on that series (merged with top-level `seriesRanges` keyed by the resolved label).

The `variables` list remains valid shorthand for plotting raw run series by name.

## Axis Modes

Charts can use shared or separate axes.

Use a shared axis when variables have comparable units and scale. This makes direct visual comparison easier.

Use separate axes when variables have different magnitudes or units. This keeps small series visible when plotted with large stocks or flows.

```json
{
  "axisMode": "separate"
}
```

## Ranges And Scaling

Useful options include:

- `sharedRange` to control the shared axis.
- `seriesRanges` to control individual variable ranges.
- `niceScale` to expand automatic bounds to readable tick values.
- `timeRangeInclusive` to focus on a period window.
- `yAxisTickCount` to guide tick density.
- `xAxis.title` for the horizontal axis label (defaults to `yr`).
- `yAxis.title` and `yAxis.unit` for the shared vertical axis (unit appears below the lowest tick label).
- `series[].unit` for per-series units in separate-axis mode (overrides model unit inference; shown below each axis’s lowest tick).

Example:

```json
{
  "timeRangeInclusive": [5, 30],
  "axisMode": "separate",
  "niceScale": true,
  "xAxis": { "title": "yr" },
  "yAxis": { "title": "Value", "unit": "$" },
  "sharedRange": {
    "includeZero": true
  }
}
```

Expression series with explicit units:

```json
{
  "series": [
    {
      "expression": "100 * h_h / v",
      "label": "Share of money balances",
      "unit": "%"
    }
  ]
}
```

Include zero when the sign or distance from zero matters. Avoid forcing zero when it compresses important movement in a series that varies within a narrow positive range.

## Baseline And Scenario Charts

For scenario analysis, chart the variables directly affected by the shock and the main stocks or flows that transmit the effect.

A good scenario chart often includes:

- The shocked external or a close consequence.
- A flow response such as output, consumption, investment, or income.
- A stock response such as money, loans, capital, debt, or wealth.

Keep charts focused. Several small charts are usually easier to read than one crowded chart.

## Reading A Chart

When inspecting a chart, ask:

- Does the first period make sense given the initial values?
- Does the shock begin in the expected period?
- Is the response direction plausible?
- Do stocks move gradually while flows can jump?
- Does the result settle, cycle, explode, or drift?

If the chart looks wrong, inspect the source run, solver status, and the equations feeding the plotted variables.

## Common Problems

- `sourceRunCellId` points to a run that has not been executed.
- A variable name is misspelled or no longer exists.
- Too many variables are plotted at once.
- Shared axis hides smaller series.
- A scenario chart is interpreted before the baseline is understood.
- A time range excludes the shock period or the adjustment period.
