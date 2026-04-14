# Solver overview

This document explains how the TypeScript solver in `packages/core` evaluates a model, with a focus on **acyclic** and **cyclic** components.

## High-level flow

For a baseline run, the solver does the following:

1. Parse each equation into an expression tree.
2. Build a dependency graph using only **current-period endogenous references**.
3. Split that graph into ordered equation blocks.
4. Solve the blocks **period by period**.
5. Within each period:
   - solve **acyclic** blocks directly
   - solve **cyclic** blocks iteratively using the selected method

In code, that flow starts in `runBaseline()`.

## What counts as a dependency

The block builder only uses **current-period endogenous dependencies**.

- `x` means “current value of `x`”, so it contributes to the dependency graph.
- `x[-1]` means “lagged value of `x`”, so it does **not** create a simultaneous dependency in the current period.
- `d(x)` uses current and lagged values during evaluation, but the current-period dependency handling is still based on the parsed dependency collection rules.
- Exogenous variables are ignored for block ordering.

That means the graph is specifically about **which equations must be solved together at the same time step**.

## Acyclic vs cyclic components

After building the dependency graph, the solver finds **strongly connected components**.

### Acyclic component

An acyclic component is a block with no multi-equation feedback loop.

Typical examples:

- `a = 1`
- `b = a + 1`

These can be solved in order with a single pass because each equation only depends on values that are already known.

### Cyclic component

A cyclic component is a block where equations depend on each other in the same period.

Typical example:

- `c = d + 1`
- `d = c + 1`

Here, neither equation can be finalized in one pass because each needs the other variable’s current-period value.
So the solver groups them into one block and runs an iterative algorithm.

## Concrete example

Consider this model:

```text
a = 1
b = a + 1
c = d + 1
d = c + 1
e = b + c
```

The dependency structure is:

- `a` depends on nothing
- `b` depends on `a`
- `c` depends on `d`
- `d` depends on `c`
- `e` depends on `b` and `c`

So the ordered blocks are conceptually:

1. `[a]` — acyclic
2. `[b]` — acyclic
3. `[c, d]` — cyclic
4. `[e]` — acyclic

### How one period is solved

Suppose the solver is solving period `t`.

1. Solve `[a]`
   - `a_t = 1`
2. Solve `[b]`
   - `b_t = a_t + 1 = 2`
3. Solve `[c, d]`
   - this block is simultaneous, so the solver must iterate
4. Solve `[e]`
   - once `c_t` is available, compute `e_t = b_t + c_t`

The key idea is that **only the cyclic block needs iteration**.
Everything before and after it can be evaluated directly once its prerequisites are available.

## Why the solver runs period by period

The runtime stores a full time series for each variable, but solves one period at a time.

At period `t`:

- `currentValue(x)` means $x_t$
- `lagValue(x)` means $x_{t-1}$
- `diffValue(x)` means $x_t - x_{t-1}$

This matters because a model can be dynamic without being simultaneous.

For example:

```text
y = 0.8 * y[-1] + g
```

This equation depends on last period’s `y`, not the current one, so it is not part of a current-period feedback loop. It can still be solved directly once `g_t` and `y_{t-1}` are known.

## Stock integration and the system dynamics analogy

Many SFC models contain stock-accumulation equations of the form:

```text
V = lag(V) + flow
```

Conceptually, this is very close to the system dynamics and ODE view of a stock.

In SFC terms, the equation says:

- `V` is a stock
- `flow` is the net inflow over the current simulation period
- the stock this period equals last period's stock plus that net flow

This is the discrete-time stock accumulation law.

The continuous-time analogue is:

```text
dV/dt = flow
```

and in integral form:

```text
V(t) = V(t0) + ∫ flow(s) ds
```

System dynamics often writes the same idea as:

```text
V = INTEG(flow, V0)
```

So these are closely related views of the same basic principle:

- SFC discrete update: `V_t = V_{t-1} + flow_t`
- system dynamics: `V = INTEG(flow, V0)`
- ODE form: `dV/dt = flow`
- integral form: `V(t) = V(0) + ∫ flow dt`

If the time step is written explicitly, the connection to Euler integration is even clearer:

```text
V_t = V_{t-1} + dt * flow_t
```

With `dt = 1`, this is the standard SFC stock equation.

### Worked example

Take a standard household-wealth equation:

```text
Hh = lag(Hh) + YD - C
```

Here:

- `Hh` is a stock of wealth or deposits
- `YD` is disposable income
- `C` is consumption
- `YD - C` is saving, the net flow into wealth

So in SFC notation:

```text
Hh = lag(Hh) + YD - C
```

or equivalently:

```text
ΔHh = YD - C
```

System dynamics would express the same idea as:

```text
Hh = INTEG(YD - C, Hh0)
```

The continuous-time version is:

```text
dHh/dt = YD - C
```

and the integral form is:

```text
Hh(t) = Hh(0) + ∫[0 to t] (YD(s) - C(s)) ds
```

An explicit Euler discretization gives:

```text
Hh_t = Hh_{t-1} + dt * (YD_t - C_t)
```

and with `dt = 1` this becomes the familiar SFC form:

```text
Hh_t = Hh_{t-1} + YD_t - C_t
```

So the stock-integration steps that appear all over SFC models are conceptually very similar to system dynamics stock accumulation and to ODEs written in integral form.

### Important nuance

The analogy is strongest for stock-accumulation equations.

Not every SFC equation should be read as an ODE discretization. Many equations in an SFC model are instead:

- accounting identities
- behavioral equations
- portfolio-allocation rules
- current-period algebraic closure equations

What is special about SFC models is that stock accumulation is usually embedded in a wider accounting structure, so the mathematics looks like discrete integration while the interpretation is also balance-sheet consistent.

## How acyclic blocks are solved

For an acyclic block, the solver evaluates the equation once and writes the result into the current period.

So if a block contains only `b`, the solver simply computes:

$$
b_t = f(a_t, x_t, z_{t-1}, \dots)
$$

and stores it.

No iteration is needed.

## How cyclic blocks are solved

For a cyclic block, the solver starts from an initial guess and improves that guess until the block converges.

If the block variables are collected into a vector $x$, the solver is trying to find a fixed point or root for the simultaneous system.

### What the iteration interval actually is

There is no separate time-based "iteration interval" inside a cyclic solve.

- The model still advances in whole simulation periods: $t = 1, 2, 3, \dots$
- Inside one period, a cyclic block is re-solved immediately in a tight loop.
- That loop stops when the block meets the configured `tolerance` or when it reaches `maxIterations`.

So the practical answer is:

- **time interval:** one simulation period at a time
- **cyclic solver iteration interval:** no extra interval; iterations happen back-to-back within the same period and block
- **iteration limit:** controlled by `maxIterations`

This repository supports three methods:

### 1. Gauss-Seidel

Gauss-Seidel updates one variable at a time using the newest available values inside the same iteration.

For a cyclic block like `[c, d]`, a sweep looks like:

1. compute a new `c`
2. immediately use that new `c` when computing `d`
3. compare old and new values
4. repeat until changes are below tolerance

This is simple and often effective for smaller or well-behaved systems.

### 2. Newton

Newton treats the cyclic block as a nonlinear system and solves for a correction step.

At each iteration it:

1. evaluates the residual vector
2. approximates the Jacobian with finite differences
3. solves a linear system for the update
4. applies the update
5. checks convergence

This is usually faster near the solution, but it needs Jacobian calculations and a linear solve.

### 3. Broyden

Broyden starts similarly to Newton but avoids rebuilding the full Jacobian every iteration.

It:

1. builds an initial finite-difference Jacobian
2. inverts it
3. updates that inverse approximation across iterations
4. computes new steps from the updated approximation

This can reduce cost for larger cyclic systems.

## Important semantic detail: self-reference

Current project semantics treat a self-referential equation like

```text
x = x + a
```

as a **single non-cyclic block** for ordering purposes.

So the `cyclic` flag is currently based on whether a block has more than one variable, not whether an equation refers to itself.

## How this differs from system dynamics model solving

This solver is primarily an **equation-block solver** for simultaneous relationships within each period.
Classic system dynamics solvers are usually organized around **stocks**, **flows**, and **numerical integration over time**.

### In this solver

- the model is decomposed into dependency blocks
- blocks are classified as acyclic or cyclic
- acyclic blocks are evaluated directly
- cyclic blocks are iterated until convergence within the same period

The main numerical problem is often:

> how do we solve a same-period simultaneous system?

### In system dynamics

- the model is usually centered on stocks and flows
- flows are computed from the current state
- stocks are advanced using a time step $\Delta t$
- the main numerical method is integration, such as Euler-style or Runge-Kutta-style stepping

The main numerical problem is usually:

> how do we integrate accumulation processes forward through time?

### Practical difference

Both approaches can represent feedback, but they handle it differently.

- In this solver, same-period feedback becomes a **cyclic block** that must be solved iteratively.
- In system dynamics, feedback often runs through **stock accumulation**, so the loop is resolved by advancing the simulation through time steps.

### Simple contrast

An equation like

```text
c = d + 1
d = c + 1
```

creates a same-period algebraic loop here, so the solver treats `[c, d]` as a cyclic block.

By contrast, a typical system dynamics structure would look more like:

```text
Stock(t + Δt) = Stock(t) + Inflow(t) * Δt - Outflow(t) * Δt
```

where the central operation is not block decomposition, but repeated integration of state over time.

### Bottom line

- this project's solver is mainly about **ordering equations and solving simultaneous blocks**
- system dynamics solvers are mainly about **integrating stocks and flows across time**

## Summary

- The solver is **period-based**.
- Within each period, it is **block-based**.
- Blocks come from the current-period dependency graph.
- **Acyclic blocks** are solved once.
- **Cyclic blocks** are solved iteratively.
- Lagged dependencies make a model dynamic, but they do not by themselves create a same-period cyclic block.

That is the core reason the solver can be efficient: it only uses expensive iterative methods where simultaneous feedback actually exists.

## Runnable example

There is also a browser notebook template for this overview example at
`packages/web/src/notebook/templates/solver-overview.notebook.json`.

That notebook keeps the same teaching goal as the concrete example above, but uses a convergent cyclic pair plus a small lagged feedback term so it can run in the app, expose the intended ordered blocks `[a]`, `[b]`, `[c, d]`, `[e]`, and still show a visible transition path across periods.
