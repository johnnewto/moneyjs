# AI Guide: Creating SFC Model Notebooks

## Overview

This guide explains how to create Stock-Flow Consistent (SFC) model notebooks for the SFCR browser application. Compact `sfcr-notebook-yaml` is the recommended authoring format for humans and AI assistants because it keeps the model close to the way economists describe it: sectors, matrices, equations, parameters, runs, charts, and tables. Expanded JSON remains the runtime interchange and schema-validation format.

For public AI clients, the recommended bootstrap order is:

1. Fetch `.well-known/sfcr.json`.
2. Fetch `.well-known/sfcr-notebook-guide.json` or this guide.
3. Start from `notebook-examples/starter.example.notebook.yaml`.
4. Use richer YAML examples only for targeted patterns such as sector matrices or scenarios.
5. Convert to runtime JSON when direct schema validation is needed.

Use JSON examples and the JSON generation prompt only when a client explicitly needs expanded runtime JSON.

## Public Resources

- Preferred authoring prompt: `ai-prompts/create-sfcr-notebook-yaml.md`
- Preferred examples: `notebook-examples/*.example.notebook.yaml`
- JSON compatibility prompt: `ai-prompts/create-sfcr-notebook.md`
- JSON compatibility examples: `notebook-examples/*.example.notebook.json`
- Machine schema: `sfcr-notebook.schema.json`

## Compact YAML Shape

A compact notebook starts with a small document header and then uses domain-first sections. The serializer may omit empty sections, but generated notebooks should keep the main sections in a predictable order.

```yaml
format: sfcr-notebook-yaml
formatVersion: 1
id: simple-model-notebook
title: Simple Model
metadata:
  version: 1
  template: simple
modelId: simple
introCell:
  id: intro
  title: Overview
```

Required top-level fields:

- `format`: must be `sfcr-notebook-yaml`
- `formatVersion`: must be `1`
- `id`: unique kebab-case notebook identifier
- `title`: descriptive notebook title shown in the UI
- `metadata.version`: must be `1`
- `modelId`: default model id used by equation, solver, parameter, initial-value, and run sections

Common authoring sections:

- `introCell`: overview markdown cell metadata
- `sectors`: optional default sector list used by matrices and dependency strips
- `variables`: variable descriptions and optional unit metadata
- `balance`: balance-sheet matrix
- `transactions`: transactions-flow matrix
- `equations`: equation system as a literal block scalar
- `parameters`: exogenous constants or series
- `initial-values`: period-0 stock or expectation values
- `solver`: solver options
- `baselineRun`: default baseline simulation
- `charts` and `tables`: result views
- `cells`: extra explicit cells such as scenario notes, scenario runs, sequence views, or dependency graphs
- `cellOrder`: optional display order when explicit ordering is needed

## Starter Template

Use `notebook-examples/starter.example.notebook.yaml` when generating a new notebook from scratch. It provides the minimum valid scaffold with matrices, equations, parameters, initial values, a solver, a baseline run, and sequence views.

Use the larger examples selectively:

- Use the BMW notebook for sector and band matrices, baseline runs, and scenario layout.
- Use the GL6-DIS rentier notebook when the model splits households or needs distributional structure.
- Treat examples as pattern references, not as whole-notebook defaults.

## Minimal Working Notebook

```yaml
format: sfcr-notebook-yaml
formatVersion: 1
id: simple-model-notebook
title: Simple Model
metadata:
  version: 1
  template: simple
modelId: simple
introCell:
  id: intro
  title: Overview

equations: |
  # Income
  Y ~ 100

  # Consumption
  C ~ alpha0 + alpha1 * Y + alpha2 * lag(M)

  # Money stock
  M ~ lag(M) + Y - C
parameters:
  alpha0: 20
  alpha1: 0.6
  alpha2: 0.1
initial-values:
  M: 50
solver:
  method: gauss-seidel
  tolerance: 1e-10
  maxIterations: 100
  defaultInitialValue: 0
baselineRun:
  id: baseline-run
  title: Baseline run
  resultKey: simple_baseline
  periods: 50
charts:
  - id: baseline-chart
    title: Results
    variables: [Y, C, M]
```

## Equations

Use a literal YAML block for equation systems. Put one equation per line and use comments for descriptions.

```yaml
equations: |
  # Consumption goods supply
  Cs ~ Cd

  # Disposable income
  YD ~ WBs + lag(rm) * lag(Mh)

  # Household money deposits
  Mh ~ lag(Mh) + (YD - Cd) * dt
```

Expression syntax:

- `lag(varName)`: previous period value
- `d(varName)`: change in variable, current minus lagged value
- `I(flowExpr)`: stock accumulation shorthand
- `dt`: time step, usually `1`
- Standard operators: `+`, `-`, `*`, `/`
- Exponentiation: `pow(base, exponent)`; the `^` character is reserved for paper-style notation such as `H^P`
- Functions: `max()`, `min()`, `pow()`, `sqrt()`, `exp()`, `log()`, `abs()`

Equation ordering does not determine execution order. The solver builds the dependency order from the expressions.

## Variables And Units

Use `variables` to document model variables and, when useful, add unit metadata.

```yaml
variables:
  Y:
    description: Income = GDP
    unit: $/year
    type: flow
    role: identity
  Mh:
    description: Household money deposits
    unit: "$"
    type: stock
    role: accumulation
  rm:
    description: Deposit interest rate
    unit: 1/year
    type: aux
    role: definition
```

Common types are `stock`, `flow`, and `aux`. Common roles are `identity`, `definition`, `behavioral`, `target`, and `accumulation`.

## Parameters And Initial Values

Use `parameters` for exogenous variables. A scalar means a constant path; an array means a time series.

```yaml
parameters:
  G: 20
  theta: 0.2
  shock: [0, 0, 1.5, 1.5, 1.0, 0.5, 0]
```

Use `initial-values` for stock variables, lagged expectations, and any variable whose period-0 value should not come from the solver default.

```yaml
initial-values:
  Mh: 100
  K: 150
  s_E: 100
```

## Solver

```yaml
solver:
  method: newton
  tolerance: 1e-10
  maxIterations: 200
  defaultInitialValue: 1e-15
  hiddenLeftVariable: Ms
  hiddenRightVariable: Mh
  hiddenTolerance: 0.00001
  relativeHiddenTolerance: false
```

Solver methods:

- `newton`: Newton-Raphson, best for well-behaved systems
- `gauss-seidel`: robust fixed-point iteration, usually slower
- `broyden`: quasi-Newton method

Use the hidden-equation fields when one equation is redundant, such as a Walras-law closure `Ms = Mh`. The solver removes that equation from the simultaneous system and enforces the two variables within `hiddenTolerance`.

## Matrices

Use compact row arrays for top-level `balance` and `transactions` sections. Each row is `[band, label, ...values]`, and the number of values must match `columns`.

```yaml
balance:
  id: balance-sheet
  title: Balance sheet
  columns: [Households, Government, Sum]
  sectors: [Households, Government, ""]
  rows:
    - [Money, Money stock, +Hh, -Hs, "0"]
    - [Balance, Net worth, -Hh, +Hs, "0"]
    - [Sum, Sum, "0", "0", "0"]
```

Transactions-flow matrices use the same structure.

```yaml
transactions:
  id: transaction-flow
  title: Transactions-flow matrix
  columns: [Households, Production, Government, Sum]
  sectors: [Households, Firms, Government, ""]
  rows:
    - [Consumption, Consumption, -Cd, +Cs, "", "0"]
    - [Government, Government expenditure, "", +Gs, -Gd, "0"]
    - [Taxes, Taxes, -TXs, "", +TXd, "0"]
    - [Money, Change in money stock, +d(Hh), "", -d(Hs), "0"]
    - [Sum, Sum, "0", "0", "0", "0"]
```

Matrix rules:

- `columns` are the displayed column headers.
- `sectors` must have the same length as `columns`.
- Use `_current` and `_capital` suffixes for sector account splits when helpful.
- Use empty string `""` for sum-sector labels and blank matrix cells.
- Use signs directly in values, such as `+Mh` and `-Ms`.
- Use `lag()` in equations and `[-1]` notation in matrix display formulas when matching paper-style tables.
- Common balance-sheet bands: `Money`, `Loans`, `Equities`, `Inventories`, `Balance`.
- Common transactions-flow bands: `Consumption`, `Investment`, `Wages`, `Profits`, `Interest`, `Taxes`, `Deposits`, `Loans`.

## Runs, Charts, And Tables

Use `baselineRun` for the main simulation.

```yaml
baselineRun:
  id: baseline-run
  title: Baseline run
  description: Baseline simulation with government expenditure fixed at 20.
  resultKey: sim_baseline
  periods: 60
```

Use `charts` and `tables` for common result views.

```yaml
charts:
  - id: baseline-chart
    title: Baseline income and money
    variables: [Y, YD, Cd, Hh]
    axisMode: separate
    timeRangeInclusive: [1, 60]
tables:
  - id: baseline-table
    title: Baseline summary
    variables: [Y, YD, Cd, Hh, TXd, Gd]
```

For scenarios, use explicit `cells` entries because they need to reference a baseline run and often have a note before the run.

```yaml
cells:
  - id: scenario-note
    type: markdown
    title: Scenario 1
    source: Scenario 1 raises government expenditure from period 5 through 60.
  - id: scenario-run
    type: run
    title: "Scenario 1: government spending shock"
    mode: scenario
    scenario:
      shocks:
        - rangeInclusive: [5, 60]
          variables:
            Gd:
              kind: constant
              value: 30
    baselineRunCellId: baseline-run
    periods: 60
    resultKey: sim_scenario_gd_30
    sourceModelId: sim
  - id: scenario-chart
    type: chart
    title: Scenario 1 output and fiscal variables
    sourceRunCellId: scenario-run
    variables: [Y, YD, Cd, Hh, Gd]
    axisMode: separate
    referenceTrace: baseline
```

Scenario rules:

- `rangeInclusive` is `[startPeriod, endPeriod]`, with both endpoints included.
- Scenario `variables` can use `kind: constant` or `kind: series`.
- `baselineRunCellId` should point to the baseline run cell.
- `sourceModelId` should match the model id used by the equation system.

## Sequence Views

Sequence cells can visualize transaction flows or equation dependencies.

```yaml
cells:
  - id: transaction-flow-sequence
    type: sequence
    title: Transaction flow sequence
    source:
      kind: matrix
      matrixCellId: transaction-flow
      includeZeroFlows: false
    description: Sequence view generated from the transactions-flow matrix.
  - id: equation-dependency-graph
    type: sequence
    title: Equation dependency graph
    source:
      kind: dependency
      modelId: sim
      showAccountingStrips: true
      showExogenous: false
      stripMapping:
        transactionMatrixCellId: transaction-flow
        balanceMatrixCellId: balance-sheet
```

Dependency source options:

- `modelId`: equation system to visualize
- `stripSectorSource`: `columns` or `sectors`
- `showAccountingStrips`: group by accounting bands
- `showExogenous`: include exogenous variables
- `showDebugOverlay`: include debugging details
- `stripMapping`: matrix cells used for sector and band inference

## Recommended Notebook Order

1. Overview / intro cell
2. Balance sheet, if applicable
3. Transactions-flow matrix, if applicable
4. Sequence cells derived from matrices or dependency graphs
5. Equations
6. Solver
7. Parameters / externals
8. Initial values
9. Baseline run
10. Baseline charts and tables
11. Scenario notes
12. Scenario runs
13. Scenario charts and tables

Use `cellOrder` only when the natural generated order is not enough.

```yaml
cellOrder:
  - intro
  - balance-sheet
  - transaction-flow
  - transaction-flow-sequence
  - equations
  - solver
  - externals-equations
  - initial-values-equations
  - baseline-run
  - baseline-chart
  - baseline-table
```

## Naming And Documentation

- Notebook ids: `{model-name}-notebook` or `{model-name}-{variant}-notebook`
- Cell ids: descriptive kebab-case, such as `baseline-run` or `scenario-1-chart`
- Model ids: short stable names, such as `sim`, `equations`, or `main-model`
- Result keys: `{model}_{run-type}`, such as `bmw_baseline` or `bmw_s1`
- Every cell should have a meaningful `title`.
- Add `description` to runs and result views when it helps users understand the output.
- Use markdown cells before scenarios.
- Add `note` fields to matrices when accounting signs or source conventions need explanation.

Equation naming conventions:

- Use clear variable names from the model literature.
- Stock variables often use uppercase names such as `K`, `Mh`, and `Ld`.
- Rates and ratios often use lowercase names such as `rl`, `rm`, and `pr`.
- Expectations commonly use `_E`, such as `s_E` or `ydhsw_E`.
- Keep real and nominal conventions consistent, such as `c` for real consumption and `C` for nominal consumption.

## Common Equation Patterns

```yaml
equations: |
  # Accumulation
  K ~ lag(K) + (I - delta * lag(K)) * dt

  # Adaptive expectations
  Y_E ~ theta * lag(Y) + (1 - theta) * lag(Y_E)

  # Target-based adjustment
  I ~ gamma * (K_T - lag(K)) + delta * lag(K)

  # Consumption function
  C ~ alpha0 + alpha1 * YD + alpha2 * lag(Mh)
```

## Validation Checklist

Before finalizing a notebook:

- [ ] Top-level `format`, `formatVersion`, `id`, `title`, and `metadata.version: 1` are present.
- [ ] `modelId` is consistent across equations, solver, parameters, initial values, and runs.
- [ ] All explicit cells have unique `id` and `title` fields.
- [ ] `sourceModelId` references point to valid model ids.
- [ ] `sourceRunCellId`, `baselineRunCellId`, and `matrixCellId` references point to valid cells.
- [ ] Matrix `columns` and `sectors` arrays have the same length.
- [ ] Matrix row values match the column count.
- [ ] Scenario `rangeInclusive` bounds are `[start, end]` with both endpoints included.
- [ ] No undefined variables appear in expressions.
- [ ] Stock variables have initial values or acceptable defaults.
- [ ] Equation roles match actual usage when roles are supplied.
- [ ] Large generated cells are collapsed when the notebook would otherwise be noisy.

## Expanded JSON Compatibility

Expanded JSON is still useful for runtime interchange, direct schema validation, and clients that cannot emit YAML reliably. It is not the preferred authoring surface.

The compact YAML sections compile into expanded notebook cells shaped like this:

```json
{
  "id": "simple-model-notebook",
  "title": "Simple Model",
  "metadata": { "version": 1 },
  "cells": [
    {
      "id": "equations",
      "type": "equations",
      "title": "Model equations",
      "modelId": "simple",
      "equations": [
        { "id": "eq-0-Y", "name": "Y", "expression": "100" }
      ]
    }
  ]
}
```

Expanded YAML that mirrors the JSON cell array may still be imported for backwards compatibility, but new generated YAML should use the compact domain-first sections shown above.

## Common Errors And Solutions

### Error: "Notebook JSON must contain string id and title fields"

Add `id` and `title` at the top level of the notebook source.

### Error: "Notebook JSON metadata.version must be 1"

Add `metadata.version: 1` at the top level.

### Error: "Cell source must include id"

Every explicit cell in the `cells` array must have an `id` field. Compact generated sections such as `equations`, `solver`, and `baselineRun` create their own cells.

### Error: "Matrix cells require columns to be an array"

Matrix sections must have `columns: [...]` as an array.

### Error: "Unknown variable in expression"

Ensure all variables are defined as equations, parameters, initial values, or valid lag references.

### Error: "Circular dependency"

Check for missing `lag()` operators. Stock-flow feedback loops usually need lagged stock terms.

### Error: "Hidden equation variables not found"

`hiddenLeftVariable` and `hiddenRightVariable` must match actual variable names.

### Error: "Source cell not found"

Check that source references, such as `sourceRunCellId` and `matrixCellId`, point to valid cells.

## Summary

Create new notebooks in compact `sfcr-notebook-yaml`. Start from the YAML starter template, borrow targeted patterns from the BMW and GL6-DIS examples, and keep expanded JSON for schema validation or clients that explicitly require runtime interchange. The compact YAML authoring path should be the default for both human readers and AI assistants.
