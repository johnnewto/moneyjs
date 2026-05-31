The externals cell defines parameters and exogenous series used by a model. Externals are inputs to equations, not variables solved by the model.

## How To Use

1. Press **Edit** on the externals cell.
2. Add one row per parameter or exogenous series.
3. Fill in the name, description, kind, value, and units.
4. Press **Apply**.
5. Run a baseline or scenario cell that uses the linked model.

External names are referenced directly in equations. For example, if an equation uses `alpha1`, the externals cell should usually contain an external named `alpha1`.

## Constants

A constant external has the same value in every period.

Use constants for:

- Behavioral parameters such as `alpha1`, `alpha2`, or `gamma`.
- Rates such as `delta`, `rl`, or `rm`.
- Policy settings that do not change in the baseline.
- Calibration values.

Example meaning:

| Name | Kind | Value | Meaning |
| --- | --- | --- | --- |
| `alpha1` | constant | `0.75` | Propensity to consume out of income |
| `delta` | constant | `0.1` | Depreciation rate |
| `rl` | constant | `0.025` | Loan interest rate |

## Series

A series external can vary by period. Use it when the exogenous path is known in advance.

Use series for:

- Time-varying policy paths.
- Historical data.
- Deterministic shock sequences.
- Random or pseudo-random paths that should be reproducible.

If a scenario only changes a constant for a period range, a run-cell shock may be simpler than a full series.

## Scenarios And Shocks

Scenario run cells usually shock external variables. A shock target should normally be an external, not an equation.

For example, this changes an external parameter from period 5 through period 50:

```json
{
  "rangeInclusive": [5, 50],
  "variables": {
    "alpha1": {
      "kind": "constant",
      "value": 0.7
    }
  }
}
```

Keep shockable policy and behavioral assumptions in externals so scenarios can change them without rewriting equations.

## Units

Use units to catch stock-flow mistakes. Examples:

- A pure ratio has empty units.
- A rate such as depreciation often has units `1/yr`.
- A money flow has units like `$/yr`.
- A stock has units like `$`.

External unit metadata should match how the parameter is used in equations. For example, if `delta * K'` produces a flow, `delta` should behave like a per-year rate.

## Naming

Good external names are:

- Short.
- Stable.
- Consistent with the source model.
- Distinct from equation variable names.

Avoid renaming externals after charts, scenarios, or equations refer to them.

## Common Problems

- An equation references a parameter that is missing from externals.
- A scenario shocks a misspelled external name.
- A parameter is declared as a constant when it should be a series.
- Units describe the parameter incorrectly.
- A variable is placed in externals even though it should be solved by an equation.

A simple rule: if the model should compute it, make it an equation. If the model should take it as given, make it an external.
