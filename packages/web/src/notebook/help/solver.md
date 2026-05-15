The solver cell controls how the notebook computes the model for each period. It chooses the numerical method, convergence tolerance, iteration limit, default starting values, and optional hidden-equation check.

## How To Use

1. Press **Edit** on the solver cell.
2. Choose a solver method.
3. Set tolerance and max iterations.
4. Choose a default initial value for variables without explicit initial values.
5. Configure the hidden equation if the model has an accounting identity you want to check after solving.
6. Press **Apply**.
7. Run the baseline or scenario cells that use this model.

Most notebooks can start with the existing solver options. Tighten or loosen them only when the model fails to converge, converges slowly, or needs stricter accounting checks.

## Solver Method

The solver method is the numerical algorithm used to find values that satisfy all equations for a period.

| Method | Good For | Notes |
| --- | --- | --- |
| Newton | Smooth, tightly coupled systems | Fast when the model is well-behaved and differentiable enough. |
| Broyden | Larger nonlinear systems | Often robust when Newton is too strict or expensive. |
| Gauss-Seidel | Simpler recursive or weakly coupled systems | Easy to reason about, but can be slower or fail on strongly simultaneous models. |

If a model fails with one method, try another method before rewriting equations. BMW-style models often work well with Newton or Broyden. Small textbook examples may work with Gauss-Seidel.

## Tolerance

Tolerance controls how close the solver must get before a period counts as solved. Smaller values are stricter.

Common values:

- `1e-8` is a practical starting point.
- `1e-10` is stricter and useful for accounting-heavy models.
- `1e-12` or smaller can be useful but may expose floating-point noise.

If the solver does not converge, loosening tolerance slightly can show whether the model is nearly solved or fundamentally unstable.

## Max Iterations

Max iterations caps how long the solver tries in each period.

Use a higher value when:

- The residuals are shrinking but the solver stops early.
- The model has slow feedback loops.
- A scenario shock makes convergence harder for a few periods.

Do not use a very high limit to hide a bad model. If residuals are not improving, inspect equations, starting values, units, and shock size.

## Default Initial Value

The default initial value is the starting guess for variables that do not have explicit initial values.

Typical choices:

- `1e-15` for near-zero starts without exact zero divisions.
- `0` when zero is economically meaningful and safe.
- A rough steady-state value when the model is sensitive to starting guesses.

Important stock variables should usually be set in the initial-values cell instead of relying on the default.

## Hidden Equation

A hidden equation checks an identity after solving without making it part of the visible equation list. It is useful for SFC accounting closures such as `Ms = Mh`, loan supply equals loan demand, or a sectoral-balance identity.

Configure:

- **Hidden left variable**: the left side of the check, such as `Ms`.
- **Hidden right variable**: the right side of the check, such as `Mh`.
- **Hidden tolerance**: how much mismatch is allowed.
- **Relative hidden tolerance**: compare relative rather than absolute error when scale matters.

Use a hidden equation when one equation is intentionally omitted to avoid over-determining the simultaneous system but you still want to verify the accounting identity.

## Choosing Settings

A conservative workflow:

1. Start with the template settings.
2. Run the baseline.
3. If it fails, inspect the first failing period.
4. Try Broyden or Newton for nonlinear simultaneous systems.
5. Increase max iterations if residuals are improving.
6. Adjust initial values for stocks and sensitive variables.
7. Only then loosen tolerance.

## Common Problems

Solver failures usually come from one of these sources:

- Missing or misspelled variables.
- Stock equations without sensible initial values.
- Division by a value that starts at or near zero.
- A shock that is too abrupt or too large.
- Equations that mix stocks and flows without `dt`.
- A model that is over-determined because an accounting closure is included both visibly and as a hidden check.

## Reading Results

A successful run means the solver found values within tolerance for each period. It does not guarantee the model is economically meaningful. After a run passes, inspect charts, tables, matrix row/column sums, and hidden-equation status to confirm the behavior is plausible.
