Table cells show selected variables from a run result in tabular form. Use them when exact values matter more than visual trends.

## How To Use

1. Run the source run cell.
2. Press **Edit** on the table cell if you need to change its source or variables.
3. Set `sourceRunCellId` to the run you want to inspect.
4. Add variable names to `variables`.
5. Apply the change.

A table cell reads output from a run cell. It does not solve the model by itself.

## Variables

The `variables` list controls which series appear in the table:

```json
{
  "type": "table",
  "sourceRunCellId": "baseline-run",
  "variables": ["Y", "Cd", "Id", "K", "Mh"]
}
```

Choose variables that belong together. For example:

- A flow table: `Y`, `Cd`, `Id`, `YD`.
- A stock table: `Mh`, `Ld`, `K`, `Vh`.
- A scenario table: variables directly affected by the shock plus major transmission variables.

## When To Use Tables

Use tables to:

- Check exact period values.
- Compare starting and ending values.
- Inspect whether a variable has reached a steady state.
- Confirm chart readings numerically.
- Copy or review key results from a scenario.

Charts are better for shape and timing. Tables are better for exact values and summary checks.

## Reading A Table

When reading a table, look for:

- First-period values that reflect initial conditions.
- Final-period values that show the long-run effect.
- Sudden jumps at shock periods.
- Stocks that accumulate gradually from flow differences.
- Signs that match the accounting story.

If a table contains unexpected values, inspect the corresponding equations and the source run's solver status.

## Baseline And Scenario Tables

For baseline runs, table cells are useful for reference values. For scenario runs, they help quantify the effect of a shock.

A practical scenario table includes:

- The shocked variable if it appears in output.
- The main income or output variable.
- One or two sector balance variables.
- Any stock that should accumulate the shock effect.

Keep the table short enough to scan. If you need many variables, split them into themed tables.

## Common Problems

- The source run has not been executed.
- `sourceRunCellId` points to the wrong run.
- A variable name is misspelled.
- A variable was renamed in equations but not updated in the table.
- Too many variables make the table hard to read.

Tables are also a useful debugging surface: if a chart looks odd, add a small table for the same variables and inspect the periods around the change.
