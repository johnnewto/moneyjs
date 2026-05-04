# AI Guide: Creating SFC Model JSON Notebooks

## Overview

This guide provides comprehensive instructions for creating Stock-Flow Consistent (SFC) model notebooks in JSON format for the SFCR browser application.

For public AI clients, the recommended bootstrap order is:

1. Fetch the discovery JSON in `.well-known/`.
2. Fetch the manifest or this guide.
3. Start from `notebook-examples/starter.notebook.json` for the minimum valid notebook shape.
4. Use the schema to validate the final notebook JSON.
5. Use the larger examples for sector, band, and scenario patterns instead of copying them wholesale.

## Notebook Structure

### Top-Level Schema

```json
{
  "id": "unique-notebook-id",
  "title": "Human Readable Notebook Title",
  "metadata": {
    "version": 1,
    "template": "template-name"
  },
  "cells": [...]
}
```

**Required fields:**
- `id`: unique kebab-case identifier (e.g., "bmw-notebook", "gl6-dis-rentier-v2")
- `title`: descriptive title shown in UI
- `metadata.version`: must be `1`
- `metadata.template`: optional template identifier
- `cells`: array of cell objects (described below)

## Starter Template

Use `notebook-examples/starter.notebook.json` when generating a new notebook from scratch. It provides the minimum valid scaffold with an intro cell, balance-sheet and transactions-flow matrices, a transaction-flow sequence, a dependency graph, an equation cell, a solver cell, externals, initial values, and a baseline run cell.

Use the starter template first for structure, then borrow targeted patterns from the larger public examples:

- Use the BMW notebook for sector and band matrices, plus baseline and scenario run layout.
- Use the GL6-DIS rentier notebook when the model splits households or needs distributional structure.
- Treat those examples as pattern references, not as whole-notebook defaults.

---

## Cell Types

All cells share a base structure:

```json
{
  "id": "unique-cell-id",
  "type": "cell-type",
  "title": "Cell Title",
  "collapsed": false  // optional
}
```

### 1. Markdown Cell

Provides documentation, explanations, and narrative structure.

```json
{
  "id": "intro",
  "type": "markdown",
  "title": "Overview",
  "source": "Markdown-formatted text content goes here. Can include **bold**, *italic*, lists, etc."
}
```

**Usage:** Section introductions, scenario descriptions, methodology notes.

---

### 2. Equations Cell

Defines the core model equations.

```json
{
  "id": "equations",
  "type": "equations",
  "title": "Model equations",
  "modelId": "main-model",
  "equations": [
    {
      "id": "eq-0-Y",
      "name": "Y",
      "desc": "Income = GDP",
      "expression": "Cs + Is",
      "role": "identity",
      "unitMeta": {
        "stockFlow": "flow",
        "signature": { "money": 1, "time": -1 }
      }
    }
  ],
  "collapsed": true
}
```

**Equation object fields:**
- `id`: unique equation identifier (format: `eq-{index}-{name}`)
- `name`: variable name (left-hand side)
- `desc`: human-readable description
- `expression`: right-hand side expression
- `role`: optional - `"identity"`, `"definition"`, `"behavioral"`, `"target"`, `"accumulation"`
- `unitMeta`: optional unit metadata
  - `stockFlow`: `"stock"`, `"flow"`, or `"aux"`
  - `signature`: dimensional analysis (e.g., `{"money": 1, "time": -1}` for flow)

**Expression syntax:**
- `lag(varName)`: previous period value
- `d(varName)`: change in variable (current - lag)
- `dt`: time step (usually equals 1)
- Standard operators: `+`, `-`, `*`, `/`
- Exponentiation: `pow(base, exponent)`. The `^` character is reserved for paper-style variable notation such as `H^P`.
- Functions: `max()`, `min()`, `pow()`, `sqrt()`, `exp()`, `log()`, `abs()`

**Equation ordering:**
- Order does NOT matter - the solver determines execution order
- Use sequential numbering for readability: `eq-0-`, `eq-1-`, etc.

---

### 3. Solver Cell

Configures solver behavior and simulation length.

```json
{
  "id": "solver",
  "type": "solver",
  "title": "Solver options",
  "modelId": "main-model",
  "options": {
    "periods": 100,
    "solverMethod": "NEWTON",
    "toleranceText": "1e-10",
    "maxIterations": 200,
    "defaultInitialValueText": "1e-15",
    "hiddenLeftVariable": "Ms",
    "hiddenRightVariable": "Mh",
    "hiddenToleranceText": "0.00001",
    "relativeHiddenTolerance": false
  },
  "collapsed": true
}
```

**Solver methods:**
- `"NEWTON"`: Newton-Raphson (best for well-behaved systems)
- `"GAUSS_SEIDEL"`: Gauss-Seidel iteration (robust, slower)
- `"BROYDEN"`: Broyden's method (quasi-Newton)

**Hidden equation (optional):**
- Use when one equation is redundant (e.g., Walras' law: `Ms = Mh`)
- Solver enforces `hiddenLeftVariable = hiddenRightVariable` within `hiddenToleranceText`
- Set `relativeHiddenTolerance: true` for relative tolerance instead of absolute

---

### 4. Externals Cell

Defines exogenous variables and parameters.

```json
{
  "id": "externals",
  "type": "externals",
  "title": "Externals",
  "modelId": "main-model",
  "externals": [
    {
      "id": "ext-0-rl",
      "name": "rl",
      "desc": "Interest rate on loans",
      "kind": "constant",
      "valueText": "0.025",
      "unitMeta": {
        "stockFlow": "aux",
        "signature": { "time": -1 }
      }
    },
    {
      "id": "ext-1-shock",
      "name": "shock",
      "desc": "Time-varying shock series",
      "kind": "series",
      "valueText": "0, 0, 1.5, 1.5, 1.0, 0.5, 0"
    }
  ],
  "collapsed": true
}
```

**External kinds:**
- `"constant"`: single value applied to all periods
- `"series"`: comma-separated values for each period

**ID format:** `ext-{index}-{name}`

---

### 5. Initial Values Cell

Sets period-0 values for stock variables and expectations.

```json
{
  "id": "initial-values",
  "type": "initial-values",
  "title": "Initial values",
  "modelId": "main-model",
  "initialValues": [
    {
      "id": "init-0-Mh",
      "name": "Mh",
      "valueText": "100"
    },
    {
      "id": "init-1-K",
      "name": "K",
      "valueText": "150"
    }
  ],
  "collapsed": true
}
```

**When to use:**
- Stock variables with accumulation equations (e.g., `Mh = lag(Mh) + ...`)
- Lagged values that don't have a natural default
- Adaptive expectations (e.g., `s_E`, `ydhsw_E`)

**Default behavior:**
- If omitted, uses `defaultInitialValueText` from solver options (typically `1e-15`)

---

### 6. Run Cell

Executes the simulation.

```json
{
  "id": "baseline-run",
  "type": "run",
  "title": "Baseline run",
  "mode": "baseline",
  "resultKey": "baseline_result",
  "description": "Baseline simulation description",
  "sourceModelId": "main-model"
}
```

**Baseline run:**
- `mode`: `"baseline"`
- `sourceModelId`: references the `modelId` from equations/solver/externals cells
- `resultKey`: unique key for storing results

**Scenario run:**

```json
{
  "id": "scenario-1-run",
  "type": "run",
  "title": "Scenario 1: consumption shock",
  "mode": "scenario",
  "scenario": {
    "shocks": [
      {
        "rangeInclusive": [5, 40],
        "variables": {
          "alpha0": { "kind": "constant", "value": 30 },
          "gamma": { "kind": "constant", "value": 0.2 }
        }
      },
      {
        "rangeInclusive": [60, 80],
        "variables": {
          "alpha1": { "kind": "constant", "value": 0.8 }
        }
      }
    ]
  },
  "baselineRunCellId": "baseline-run",
  "baselineStartPeriod": 0,
  "periods": 100,
  "resultKey": "scenario_1_result",
  "sourceModelId": "main-model"
}
```

**Scenario fields:**
- `baselineRunCellId`: references baseline run cell
- `baselineStartPeriod`: optional, defaults to 0
- `periods`: can override baseline length
- `shocks`: array of shock definitions
  - `rangeInclusive`: `[startPeriod, endPeriod]` (inclusive on both ends)
  - `variables`: map of variable names to new values
    - `kind`: `"constant"` or `"series"`
    - `value`: number (for constant) or array (for series)

---

### 7. Chart Cell

Visualizes simulation results.

```json
{
  "id": "baseline-chart",
  "type": "chart",
  "title": "Baseline headline variables",
  "sourceRunCellId": "baseline-run",
  "variables": ["Y", "Cd", "Mh", "W"],
  "axisMode": "separate",
  "axisSnapTolarance": 0.1,
  "niceScale": true,
  "yAxisTickCount": 5,
  "sharedRange": { "includeZero": true },
  "seriesRanges": {
    "Mh": { "includeZero": true, "min": 0, "max": 200 }
  },
  "timeRangeInclusive": [0, 50]
}
```

**Chart options:**
- `sourceRunCellId`: run cell to visualize
- `variables`: array of variable names to plot
- `axisMode`: `"shared"` (one y-axis) or `"separate"` (multiple y-axes)
- `axisSnapTolarance`: optional snapping for axis alignment
- `niceScale`: optional, rounds axis bounds to nice numbers
- `yAxisTickCount`: optional, number of y-axis ticks
- `sharedRange`: optional, applies to all series when `axisMode` is `"shared"`
  - `includeZero`: boolean
  - `min`, `max`: explicit bounds
- `seriesRanges`: optional, per-variable ranges (overrides `sharedRange`)
- `timeRangeInclusive`: optional `[start, end]` period filter

---

### 8. Table Cell

Displays simulation results in tabular format.

```json
{
  "id": "baseline-table",
  "type": "table",
  "title": "Baseline variable summary",
  "sourceRunCellId": "baseline-run",
  "variables": ["Y", "Cd", "Id", "K", "Mh", "W"]
}
```

---

### 9. Matrix Cell

Shows balance-sheet or transactions-flow matrices with **sectors** and **bands**.

```json
{
  "id": "balance-sheet",
  "type": "matrix",
  "title": "BMW balance sheet",
  "sourceRunCellId": "baseline-run",
  "columns": ["Households", "Production firms", "Banks", "Sum"],
  "sectors": ["Households", "Firms", "Banks", ""],
  "rows": [
    {
      "band": "Deposits",
      "label": "Money deposits",
      "values": ["+Mh", "", "-Ms", "0"]
    },
    {
      "band": "Loans",
      "label": "Loans",
      "values": ["", "-Ld", "+Ls", "0"]
    },
    {
      "band": "Balance",
      "label": "Balance (net worth)",
      "values": ["-Vh", "-V", "0", "0"]
    }
  ],
  "description": "Balance-sheet matrix for the BMW model.",
  "note": "Optional additional notes about the matrix."
}
```

**Matrix with sector columns:**

For transactions-flow matrices with current/capital sub-columns:

```json
{
  "id": "transaction-flow",
  "type": "matrix",
  "title": "BMW transactions-flow matrix",
  "sourceRunCellId": "baseline-run",
  "columns": ["Households", "Firms_current", "Firms_capital", "Banks_current", "Banks_capital"],
  "sectors": ["Households", "Firms", "Firms", "Banks", "Banks"],
  "rows": [
    {
      "band": "Consumption",
      "label": "Consumption",
      "values": ["-Cs", "+Cd", "", "", ""]
    },
    {
      "band": "Investment",
      "label": "Investment",
      "values": ["", "+Is", "-Id", "", ""]
    },
    {
      "band": "Wages",
      "label": "Wages",
      "values": ["+WBs", "-WBd", "", "", ""]
    }
  ],
  "description": "Transactions-flow matrix description.",
  "note": "Signs follow SFC accounting conventions."
}
```

**Key concepts:**
- `columns`: column headers displayed in UI
  - Use `_current` and `_capital` suffixes for current/capital account splits
  - Last column often "Sum" for row totals
- `sectors`: sector grouping for column headers
  - Must have same length as `columns`
  - Repeat sector names for sub-columns (e.g., `["Firms", "Firms"]`)
  - Use empty string `""` for sum columns
- `rows`: array of row objects
  - `band`: groups related rows (e.g., "Deposits", "Loans", "Consumption", "Investment")
    - **Can also use `Band` (capitalized)** - both are supported
  - `label`: row description
  - `values`: array of expressions or constants
    - Use `"+VarName"` or `"-VarName"` for signs
    - Use `""` for empty cells
    - Can use expressions like `"rl[-1] * Ld[-1]"` or `"d(Mh)"`
- `sourceRunCellId`: optional, enables live value evaluation
- `description`: optional summary text
- `note`: optional additional context

**Band grouping:**
- Bands create visual separation in the matrix display
- Common bands for balance sheets: "Money", "Loans", "Equities", "Inventories", "Balance"
- Common bands for transactions-flow: "Consumption", "Investment", "Wages", "Profits", "Interest", "Taxes", "Deposits", "Loans"

---

### 10. Sequence Cell

Generates sequence diagrams from matrices or dependency graphs.

**From transaction-flow matrix:**

```json
{
  "id": "transaction-flow-sequence",
  "type": "sequence",
  "title": "BMW transaction flow sequence",
  "source": {
    "kind": "matrix",
    "matrixCellId": "transaction-flow",
    "sourceRunCellId": "baseline-run",
    "includeZeroFlows": false,
    "aliases": {
      "Households": "HH",
      "Production firms": "Firms"
    }
  },
  "description": "Sequence view of transactions-flow matrix.",
  "note": "Use Reset and Next step to manually reveal flows."
}
```

**From dependency graph:**

```json
{
  "id": "equation-dependency-graph",
  "type": "sequence",
  "title": "Equation dependency graph",
  "source": {
    "kind": "dependency",
    "modelId": "main-model",
    "stripSectorSource": "columns",
    "showAccountingStrips": true,
    "showExogenous": false,
    "showDebugOverlay": false,
    "stripMapping": {
      "transactionMatrixCellId": "transaction-flow",
      "balanceMatrixCellId": "balance-sheet"
    }
  },
  "description": "Dependency view organized by sector and accounting bands.",
  "note": "Compare this with the transaction-flow sequence."
}
```

**Dependency source options:**
- `modelId`: which equations cell to visualize
- `stripSectorSource`: `"columns"` or `"sectors"` - which matrix field to use for sector grouping
- `showAccountingStrips`: whether to group by accounting bands
- `showExogenous`: whether to show external variables
- `showDebugOverlay`: debugging information
- `stripMapping`: links to matrix cells for sector/band inference

---

## Complete Workflow Example

### Minimal Working Notebook

```json
{
  "id": "simple-model",
  "title": "Simple Model",
  "metadata": { "version": 1 },
  "cells": [
    {
      "id": "intro",
      "type": "markdown",
      "title": "Overview",
      "source": "A minimal SFC model with consumption and wealth accumulation."
    },
    {
      "id": "equations",
      "type": "equations",
      "title": "Model",
      "modelId": "simple",
      "equations": [
        {
          "id": "eq-0-Y",
          "name": "Y",
          "expression": "100"
        },
        {
          "id": "eq-1-C",
          "name": "C",
          "expression": "alpha0 + alpha1 * Y + alpha2 * lag(M)"
        },
        {
          "id": "eq-2-M",
          "name": "M",
          "expression": "lag(M) + Y - C"
        }
      ]
    },
    {
      "id": "solver",
      "type": "solver",
      "title": "Solver",
      "modelId": "simple",
      "options": {
        "periods": 50,
        "solverMethod": "GAUSS_SEIDEL",
        "toleranceText": "1e-10",
        "maxIterations": 100,
        "defaultInitialValueText": "0"
      }
    },
    {
      "id": "externals",
      "type": "externals",
      "title": "Parameters",
      "modelId": "simple",
      "externals": [
        { "id": "ext-0-alpha0", "name": "alpha0", "kind": "constant", "valueText": "20" },
        { "id": "ext-1-alpha1", "name": "alpha1", "kind": "constant", "valueText": "0.6" },
        { "id": "ext-2-alpha2", "name": "alpha2", "kind": "constant", "valueText": "0.1" }
      ]
    },
    {
      "id": "initial-values",
      "type": "initial-values",
      "title": "Initial values",
      "modelId": "simple",
      "initialValues": [
        { "id": "init-0-M", "name": "M", "valueText": "50" }
      ]
    },
    {
      "id": "baseline",
      "type": "run",
      "title": "Baseline",
      "mode": "baseline",
      "resultKey": "simple_baseline",
      "sourceModelId": "simple"
    },
    {
      "id": "chart",
      "type": "chart",
      "title": "Results",
      "sourceRunCellId": "baseline",
      "variables": ["Y", "C", "M"]
    }
  ]
}
```

---

## Best Practices

### Cell Ordering
Recommended sequence:
1. Introduction (markdown)
2. Matrices (balance-sheet, transactions-flow) - if applicable
3. Sequence diagrams from matrices
4. Dependency graphs
5. Equations
6. Solver
7. Externals
8. Initial values
9. Baseline run
10. Baseline charts/tables
11. Scenario notes (markdown)
12. Scenario runs
13. Scenario charts/tables

### ID Conventions
- **Notebook IDs:** `{model-name}-notebook` or `{model-name}-{variant}-notebook`
- **Cell IDs:** descriptive kebab-case (e.g., `baseline-run`, `scenario-1-chart`)
- **Model IDs:** simple names (e.g., `equations`, `main-model`, `equations-newton`)
- **Result keys:** `{model}_{run-type}` (e.g., `bmw_baseline`, `bmw_s1`)

### Equation Naming
- Use clear, standard variable names from the literature
- Stock variables: uppercase (e.g., `K`, `Mh`, `Ld`)
- Flow variables: uppercase or lowercase depending on convention
- Rates/ratios: lowercase (e.g., `rl`, `rm`, `pr`)
- Expectations: suffix with `_E` (e.g., `s_E`, `ydhsw_E`)
- Real vs nominal: lowercase for real, uppercase for nominal (e.g., `c` vs `C`)

### Documentation
- Every cell should have a meaningful `title`
- Add `description` to run cells explaining purpose
- Use markdown cells before each scenario
- Add `note` fields to matrices explaining accounting conventions
- Include `desc` for all equations and externals

### Matrix Design
- **Balance sheets:** show stocks at a point in time
  - Bands: group by asset type (Money, Loans, Equities, Capital, Balance)
  - Sectors: institutional units (Households, Firms, Banks, Government)
  - Sum column should show `0` for financial assets and total for real assets
- **Transactions-flow:** show period flows
  - Bands: group by transaction type (Consumption, Investment, Wages, Profits, Interest)
  - Split sectors into current and capital accounts when relevant
  - Include change-in-stock rows (e.g., `d(Mh)`, `d(Ld)`)
  - Use `lag()` for interest payments (e.g., `rl[-1] * Ld[-1]`)

### Common Patterns

**Accumulation equation:**
```json
{
  "name": "K",
  "expression": "lag(K) + (I - delta * lag(K)) * dt",
  "role": "accumulation"
}
```

**Adaptive expectations:**
```json
{
  "name": "Y_E",
  "expression": "theta * lag(Y) + (1 - theta) * lag(Y_E)"
}
```

**Target-based adjustment:**
```json
{
  "name": "I",
  "expression": "gamma * (K_T - lag(K)) + delta * lag(K)"
}
```

**Consumption function:**
```json
{
  "name": "C",
  "expression": "alpha0 + alpha1 * YD + alpha2 * lag(Mh)"
}
```

---

## Validation Checklist

Before finalizing a notebook JSON:

- [ ] Top-level `id`, `title`, and `metadata.version: 1` present
- [ ] All cells have unique `id` and `title`
- [ ] `modelId` is consistent across equations, solver, externals, initial-values
- [ ] All `sourceModelId` references point to valid model IDs
- [ ] All `sourceRunCellId` references point to valid run cell IDs
- [ ] All `baselineRunCellId` references point to valid baseline run cells
- [ ] Matrix `columns` and `sectors` arrays have same length
- [ ] Matrix row `values` arrays match column count
- [ ] Scenario `rangeInclusive` bounds are `[start, end]` not `[start, end)`
- [ ] No undefined variables in expressions
- [ ] Stock variables have initial values or acceptable defaults
- [ ] Equation roles match actual usage (`accumulation` for stocks, etc.)
- [ ] `collapsed: true` on large equation/solver/external cells for cleaner display

---

## Advanced Features

### Unit Metadata
Add dimensional analysis to catch errors:

```json
{
  "name": "K",
  "expression": "lag(K) + (Id - DA) * dt",
  "unitMeta": {
    "stockFlow": "stock",
    "signature": { "money": 1 }
  }
}
```

Common signatures:
- Stock (money): `{"money": 1}`
- Flow (money/time): `{"money": 1, "time": -1}`
- Rate (1/time): `{"time": -1}`
- Ratio (dimensionless): `{}`
- Employment (items/time): `{"items": 1, "time": -1}`

### Hidden Equations
For redundant equations (e.g., Walras' Law):

```json
{
  "id": "solver",
  "type": "solver",
  "modelId": "main",
  "options": {
    "hiddenLeftVariable": "Ms",
    "hiddenRightVariable": "Mh",
    "hiddenToleranceText": "0.00001",
    "relativeHiddenTolerance": false,
    ...
  }
}
```

This removes the `Ms = Mh` equation and instead enforces it as a closure condition.

### Time Series Externals
For non-constant exogenous paths:

```json
{
  "name": "G",
  "desc": "Government spending",
  "kind": "series",
  "valueText": "20, 20, 20, 25, 25, 25, 20, 20"
}
```

Values apply to periods 0, 1, 2, ... If series is shorter than simulation, last value repeats.

---

## Common Errors and Solutions

### Error: "Notebook JSON must contain string id and title fields"
**Solution:** Add `"id"` and `"title"` at top level of JSON.

### Error: "Notebook JSON metadata.version must be 1"
**Solution:** Add `"metadata": {"version": 1}` at top level.

### Error: "Cell source must include id"
**Solution:** Every cell in the `cells` array must have an `"id"` field.

### Error: "Matrix cells require columns to be an array"
**Solution:** Matrix cells must have `"columns": [...]` as an array.

### Error: "Unknown variable in expression"
**Solution:** Ensure all variables in expressions are defined as equations, externals, or are valid lag references.

### Error: "Circular dependency"
**Solution:** Check for missing `lag()` operators. Stock-flow cycles require lagged feedback.

### Error: "Hidden equation variables not found"
**Solution:** `hiddenLeftVariable` and `hiddenRightVariable` must match actual variable names.

### Error: "Source cell not found"
**Solution:** Check that `sourceRunCellId`, `matrixCellId`, etc. reference valid cell IDs.

---

## Summary

Creating an SFC notebook JSON requires:

1. **Structure:** Top-level document with metadata and cells array
2. **Model definition:** Equations, externals, solver, initial values (all with matching `modelId`)
3. **Execution:** Run cells (baseline + scenarios)
4. **Visualization:** Charts, tables, matrices, sequences
5. **Documentation:** Markdown cells explaining the model and scenarios
6. **Accounting:** Balance-sheet and transactions-flow matrices with sectors and bands
7. **Consistency:** Proper cell ID references throughout

Start from the starter template, then follow the patterns in existing examples (BMW, GL6-DIS, predator-prey) when you need richer sector, band, or scenario structures.
