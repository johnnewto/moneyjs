The initial-values cell sets starting values for model variables before the first simulated period. It is most important for stocks and for equations that use lagged values.

## How To Use

1. Press **Edit** on the initial-values cell.
2. Add variables that need explicit starting values.
3. Enter each value as text, such as `0`, `100`, `1e-15`, or a simple numeric expression if supported by the editor.
4. Press **Apply**.
5. Run the baseline and inspect the first few periods.

The solver has a default initial value, but explicit initial values make the model clearer and more stable.

## When Initial Values Matter

Initial values matter when equations reference previous-period values:

`Mh = Mh' + (YD - Cd) * dt`

The first period needs a value for `Mh'`. If `Mh` is not listed in initial values, the solver falls back to the default initial value from the solver cell.

Set explicit initial values for:

- Money deposits, loans, bonds, wealth, capital, inventories, reserves, or other stocks.
- Variables appearing inside `X'`, `lag(...)`, or `X[-1]`.
- Variables used in denominators.
- Variables with known steady-state starting levels.
- Models where the early path should match a reference implementation.

## Stocks Versus Flows

Initial values are usually stock levels at the start of the simulation. For example:

| Variable | Typical Meaning | Initial Value Represents |
| --- | --- | --- |
| `Mh` | Household money deposits | Opening deposit stock |
| `Ld` | Firm loans demanded | Opening loan stock |
| `K` | Capital stock | Opening capital stock |
| `Vh` | Household wealth | Opening net worth |
| `Y` | Income/output | Previous-period flow used by targets or expectations |

Flows can also need initial values when they are lagged by another equation. For example, `KT = kappa * Y'` needs a starting value for `Y`.

## Steady-State Starts

For many SFC models, the cleanest baseline begins near a steady state. A steady-state start reduces artificial transition dynamics and makes scenario comparisons easier to read.

A practical workflow:

1. Use the reference article, R model, or Java model for starting stock values if available.
2. Run the baseline for enough periods to settle.
3. Use late baseline values as a candidate starting state for scenario experiments.
4. Keep scenario shocks separate from initial-value changes so the cause of movement is clear.

## Default Initial Value

The solver cell has a default initial value for anything not listed here. This is useful while sketching, but it is less transparent than explicit entries.

Use explicit initial values when:

- A stock is economically meaningful.
- A lagged variable affects period 1 behavior.
- A model fails because starting guesses are too close to zero.
- You need reproducibility against a reference path.

Use the default when:

- A variable is purely algebraic and not lagged.
- You are prototyping and have not chosen a starting state yet.

## Troubleshooting

If period 1 looks strange:

- Check which equations use `X'`, `lag(...)`, or `[-1]`.
- Add initial values for those variables.
- Check denominators for zero or near-zero starts.
- Check whether the starting stock levels are consistent with the balance sheet matrix.
- Check whether opening assets and liabilities have matching counterpart values.

If a scenario comparison looks misleading, confirm that the scenario run uses the intended baseline state and that the difference comes from shocks, not accidental initial-value changes.
