# Transition Matrix Analysis Design

## Goal

Add local dynamic stability analysis for solved SFC models.

The core object is the transition matrix:

```text
T = -A0^-1 A1
```

where:

```text
A0 = dF / dx_t
A1 = dF / dx_{t-1}
```

and the solved model is viewed locally as a residual system:

```text
F(x_t, x_{t-1}, p) = 0
```

This turns a solved SFC model from a set of nonlinear accounting and behavioral
equations into a local discrete dynamic system:

```text
delta x_t = T delta x_{t-1}
```

The analysis should support:

- stability diagnostics
- oscillation detection
- dominant dynamic modes
- solved-effect dependency graphs
- parameter sensitivity of stability
- later loop-gain analysis

## Current Solver Context

The implementation should live first in `packages/core`.

The existing solver already has the key pieces:

- parsed equation expressions from `parseEquation`
- period-local value access through `SolverContext`
- full simulation output in `SimulationResult.series`
- finite-difference Jacobian logic in the Newton and Broyden solvers
- dense linear solving through `solveLinearSystem`

The current solver residual convention for an equation named `x` is:

```text
F_x = RHS_x(context) - x_t
```

That convention is different from writing `lhs - rhs`, but it is valid as long
as it is used consistently for both `A0` and `A1`.

## Recommended MVP

Build a core-only transition matrix API before adding UI or eigenvalue
diagnostics.

Suggested public entry point:

```ts
computeTransitionMatrix(result: SimulationResult, period: number): TransitionMatrixAnalysis
```

Suggested return shape:

```ts
interface TransitionMatrixAnalysis {
  period: number;
  variables: string[];
  residual: number[];
  residualNorm: number;
  A0: number[][];
  A1: number[][];
  T: number[][];
  condition?: {
    singular: boolean;
    message?: string;
  };
}
```

Initial scope:

1. Use endogenous variables from `result.model.equations`.
2. Re-parse equations with `parseEquation`, including `matrixColumnSums`.
3. Build a period context backed by `result.series`.
4. Evaluate the residual vector at the solved period.
5. Finite-difference current-period endogenous variables to form `A0`.
6. Finite-difference lagged endogenous variables to form `A1`.
7. Solve `A0 * T_col = -A1_col` for each transition-matrix column.

The implementation should not explicitly invert `A0`. Solving one linear
system per column is cleaner and uses the repository's existing solver utility.

## Period And Variable Semantics

The selected period must be greater than zero because `x_{t-1}` is required.

For a selected zero-based period index `period`:

```text
x_t       = series[name][period]
x_{t-1}   = series[name][period - 1]
parameter = external value at period, if referenced
```

The first pass should analyze endogenous variables only. Exogenous variables
and constants should remain fixed at the operating point while differentiating
with respect to `x_t` and `x_{t-1}`.

## Residual Evaluation

Define a reusable residual evaluator over all selected endogenous variables:

```text
residual_i = evaluateExpression(parsedEquation_i.expression, context)
             - context.currentValue(variable_i)
```

This matches the Newton and Broyden solver convention.

The residual vector should be close to zero for a converged period. Returning
`residualNorm` helps callers detect when the local analysis is being requested
from a poorly solved or invalid state.

## Numerical Jacobians

Use finite differences for both Jacobians.

For each current-period variable:

```text
shift x_j,t by h
evaluate residual vector
A0[i, j] = (F_i(shifted) - F_i(base)) / h
restore x_j,t
```

For each lagged variable:

```text
shift x_j,t-1 by h
evaluate residual vector
A1[i, j] = (F_i(shifted) - F_i(base)) / h
restore x_j,t-1
```

Use the same scale-aware step as the solvers initially:

```text
h = 1e-7 * max(1, abs(value))
```

A later improvement can add central differences:

```text
dF/dx ~= (F(x + h) - F(x - h)) / (2h)
```

but forward differences are enough for the first implementation and match the
existing solver style.

## Transition Matrix Construction

Given:

```text
A0 dx_t + A1 dx_{t-1} = 0
```

the local transition relation is:

```text
dx_t = -A0^-1 A1 dx_{t-1}
```

So:

```text
T = -A0^-1 A1
```

Implementation detail:

```text
for each column j:
  rhs = -A1[:, j]
  T[:, j] = solveLinearSystem(A0, rhs)
```

If `A0` is singular or numerically ill-conditioned, return a clear condition
result or throw a domain-specific error. The first pass can rely on
`solveLinearSystem` errors and wrap them with period and variable context.

## Option A: Matrix Only

This is the recommended first delivery.

Add:

```ts
computeResidualVector(...)
computeLocalJacobians(...)
computeTransitionMatrix(...)
```

Benefits:

- smallest useful change
- no new numeric dependency
- easy to test with simple linear models
- creates a stable primitive for future UI, graph, and stability features

Limits:

- no eigenvalues yet
- no stability classification yet
- no dominant eigenvector or mode interpretation yet

## Option B: Stability Metrics

After `T` is available and tested, add:

```ts
computeStabilityMetrics(result: SimulationResult, period: number): StabilityAnalysis
```

Suggested return extension:

```ts
interface StabilityAnalysis extends TransitionMatrixAnalysis {
  eigenvalues: Array<{ re: number; im: number; abs: number }>;
  spectralRadius: number;
  classification: "stable" | "marginal" | "unstable";
}
```

Classification should use a tolerance band:

```text
spectralRadius < 1 - eps  stable
spectralRadius <= 1 + eps marginal
otherwise                 unstable
```

Complex eigenvalues indicate oscillatory local dynamics.

The main design decision is eigenvalue computation. Prefer one of:

- use a tested browser-compatible numerical library
- implement a deliberately limited routine for small real matrices
- defer eigenvalues and expose `T` first

Do not hand-roll a broad complex eigenvalue implementation unless the
limitations are explicit and well tested.

## Option C: Notebook Or App UI

Once the core API exists, add a UI path in `packages/web`.

Possible interactions:

- select solved model or run cell
- select analysis period
- show residual norm
- show transition matrix table or heatmap
- show spectral radius and stability classification, when available
- show dominant variables in the dominant mode, when available
- show a dynamic dependency graph derived from `T`

This should be a consumer of `@sfcr/core`, not a second implementation of the
analysis logic.

## Dynamic Dependency Graph

The transition matrix can be converted into a solved-effect graph:

```text
edge variable_j -> variable_i
weight = T[i, j]
```

This graph is different from the equation dependency graph. The equation graph
shows direct structural references. The `T` graph shows local solved effects,
including indirect effects through the simultaneous system.

Suggested API:

```ts
interface TransitionEdge {
  from: string;
  to: string;
  weight: number;
}

buildTransitionGraph(
  analysis: TransitionMatrixAnalysis,
  options?: { minAbsWeight?: number }
): TransitionEdge[]
```

Thresholding should be available so small numerical noise does not clutter the
graph.

## Parameter Sensitivity

Parameter sensitivity should come after stability metrics.

For a parameter or exogenous constant `p`, estimate:

```text
d spectralRadius / dp ~= (spectralRadius(p + h) - spectralRadius(p)) / h
```

There are two useful variants.

### Fixed-State Sensitivity

Change the parameter while keeping `x_t` and `x_{t-1}` fixed.

Benefits:

- fast
- isolates local equation sensitivity
- does not require re-running the model

Limit:

- does not capture the way the operating point itself changes after the
  parameter changes

### Re-Solved Sensitivity

Change the parameter, re-run the model, and recompute stability at the new
operating point.

Benefits:

- closer to user-facing simulation behavior
- includes operating-point movement

Limits:

- slower
- can mix local stability change with global path effects
- may fail if the perturbed model does not converge

Start with fixed-state sensitivity, then add re-solved sensitivity if the UI or
analysis workflows need it.

## Deferred Loop-Gain Analysis

Loop-gain analysis should be deferred until the transition matrix path is
stable.

There are two plausible interpretations:

- equation graph plus local Jacobian gains
- transition matrix graph gains

The transition matrix graph is easier to implement and reflects solved local
effects. The equation graph is more explanatory but requires stronger loop
identification semantics and careful treatment of simultaneous equations.

Do not combine the two in the first implementation.

## Proposed Delivery Phases

### Phase 1: Core Matrix API

Add a new core module, likely under `packages/core/src/analysis`.

Implement:

- residual evaluation at a solved period
- `A0` and `A1` finite-difference Jacobians
- transition matrix construction
- public exports from `packages/core/src/index.ts`

Test with small linear models where `T` can be calculated by hand.

### Phase 2: Stability Metrics

Add eigenvalue support and classification.

Test:

- stable one-variable model
- unstable one-variable model
- two-variable oscillatory model, if complex eigenvalue support is added

### Phase 3: Transition Graph

Add graph construction from `T`.

Test:

- edge direction `j -> i`
- weight mapping from `T[i, j]`
- threshold filtering

### Phase 4: UI Exposure

Expose the analysis in the notebook or app.

The first UI can be simple:

- period selector
- matrix table
- residual norm
- stability badge, if metrics exist

Graph visualization can follow after the core values are useful.

### Phase 5: Sensitivity And Loops

Add parameter sensitivity and loop analysis after the matrix, metrics, and graph
paths are stable.

## Testing Strategy

Use the smallest test that proves each layer.

For `@sfcr/core`:

```bash
pnpm --filter @sfcr/core test
```

Recommended unit fixtures:

### One-Variable Stable Model

```text
y = a * y[-1] + g
```

Expected:

```text
T = [a]
```

### One-Variable Stock Model

```text
h = h[-1] + s
```

Expected:

```text
T = [1]
```

### Two-Variable Linear Model

```text
x = a * x[-1] + b * y[-1]
y = c * x[-1] + d * y[-1]
```

Expected:

```text
T = [[a, b], [c, d]]
```

### Simultaneous Current-Period Model

Use a small model with current-period cross-dependencies to prove that `A0`
matters and that the transition matrix captures solved effects rather than only
direct lag references.

## Main Risks

- `A0` can be singular for underdetermined or badly specified local systems.
- Finite differences can be noisy around discontinuities such as `if`
  expressions and comparison operators.
- The residual sign convention must stay consistent with the solver.
- Eigenvalue support can become a dependency or correctness risk if rushed.
- Users may overinterpret local stability as global simulation stability.

Mitigations:

- return residual norm and period metadata
- document local-linear interpretation clearly
- start with matrix output before classification
- use tested numerical routines for eigenvalues if complex modes are needed
- keep analysis in `@sfcr/core` and UI as a consumer

## Recommendation

Implement Option A first: a core transition matrix API that returns `A0`, `A1`,
`T`, variables, and residual diagnostics for one solved period.

Then add stability metrics and graph output as separate, testable layers.
Parameter sensitivity and loop-gain analysis should wait until the transition
matrix and stability APIs are proven on simple fixtures and at least one real
notebook model such as SIM or BMW.
