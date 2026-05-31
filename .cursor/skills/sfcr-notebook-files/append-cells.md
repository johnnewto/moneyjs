# Appending cells in `sfcr-notebook-yaml`

Add a new item to the ordered `cells:` list. **Position matters** — insert after the anchor cell in document order, not at the end unless that is correct for the narrative.

## Wrapper pattern

Each entry is one key (cell type) mapping to cell fields:

```yaml
cells:
  # ... existing cells ...
  - markdown:
      id: scenario-note
      title: Scenario 1 — description
      source: |
        Explain the shock and what to compare in charts below.
```

## By cell type

### Markdown (notes, scenario intros)

```yaml
  - markdown:
      id: implementation-note
      title: Implementation note
      source: Short plain or markdown text. Use `|` for multiline.
```

Optional: place after intro with stable anchor — keep `id` unique kebab-case.

### Matrix

Requires `columns`, `sectors` (same length), `rows` with value count matching columns, and usually `sourceRunCellId` pointing at an existing baseline run.

```yaml
  - matrix:
      id: transaction-flow
      accountingKind: transaction-flow
      title: Transactions flow
      description: Row signs follow model conventions.
      sourceRunCellId: baseline-run
      columns: [Households, Firms, Sum]
      sectors: [Households, Firms, ""]
      rows:
        - [Income, Income, +Y, -Y, "0"]
        - [Sum, Sum, "0", "0", "0"]
```

See `notebook-guide.md` for band labels and sign conventions.

### Equations

```yaml
  - equations:
      id: equations-main
      title: Model equations
      modelId: main-model
      rows:
        - [Y, Cs + Gs, "Income = GDP", $/year, flow, identity]
```

Compact row: `[name, expression]` or full `[name, expression, "description", unit, type, role]`. Quote descriptions.

### Solver

One per model block is typical; `modelId` must match equations.

```yaml
  - solver:
      id: solver-main
      title: Solver options
      modelId: main-model
      method: gauss-seidel
      tolerance: "1e-10"
      maxIterations: 100
      defaultInitialValue: "0"
```

### Externals

```yaml
  - externals:
      id: externals-main
      title: Externals
      modelId: main-model
      rows:
        - [G, 100, "Government spending", $/year, aux]
        - [theta, 0.5, "Tax rate", "", aux]
```

Series: use object rows with `kind: series` and `valueText` per `notebook-guide.md`.

### Initial values

```yaml
  - initial-values:
      id: initial-values-main
      title: Initial values
      modelId: main-model
      rows:
        - [Mh, 80]
```

Add rows for stocks that use lags (`varName'`, `lag(...)`) unless defaults are acceptable.

### Run

Baseline:

```yaml
  - run:
      id: baseline-run
      title: Baseline run
      mode: baseline
      periods: 100
      resultKey: mymodel_baseline
      sourceModelId: main-model
```

Scenario (after baseline exists):

```yaml
  - run:
      id: scenario-1-run
      title: Scenario 1 — higher G
      mode: scenario
      baselineRunCellId: baseline-run
      periods: 100
      resultKey: mymodel_s1
      sourceModelId: main-model
      scenario:
        # structure per notebook-guide.md / starter example
```

### Chart / table

Need a valid `sourceRunCellId` (or scenario run) and variable names that exist in the model.

```yaml
  - chart:
      id: baseline-chart
      title: Baseline results
      sourceRunCellId: baseline-run
      variables: [Y, C, M]
```

```yaml
  - table:
      id: baseline-table
      title: Key levels
      sourceRunCellId: baseline-run
      variables: [Y, C, G, M]
```

### Sequence

Usually after the matrix or equations they depend on:

```yaml
  - sequence:
      id: tf-sequence
      title: Transaction flow sequence
      source:
        kind: matrix
        matrixCellId: transaction-flow
      description: Generated from the transactions-flow matrix.
```

## Placement checklist

- [ ] New `id` is unique kebab-case across the notebook
- [ ] `title` is meaningful in the UI
- [ ] `modelId` / `sourceModelId` / `sourceRunCellId` / `baselineRunCellId` reference existing ids
- [ ] Matrix geometry is consistent (`columns`, `sectors`, row values)
- [ ] Scenario cells appear after baseline run and optional scenario markdown
- [ ] Re-run compile/tests for pilot templates (see SKILL.md)

## Pilot vs public example

| Location | After append |
|----------|----------------|
| `packages/web/src/notebook/templates/*.notebook.yaml` | `pnpm --filter @sfcr/web compile:notebook-yaml -- --write` |
| `packages/web/public/notebook-examples/*.example.notebook.yaml` | `pnpm --filter @sfcr/web exec vitest run test/publicAiResources.test.ts` (and fix parse errors) |
