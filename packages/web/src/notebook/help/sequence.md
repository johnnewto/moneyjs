Sequence cells render a step-by-step visual view. They can show transaction flows derived from a matrix or dependency structure derived from model equations.

## How To Use

1. Choose the sequence source.
2. Run any source model or run cell needed by that source.
3. Use the sequence controls to step through flows or inspect the dependency view.
4. Use the selected period control when the sequence depends on simulation results.

A sequence cell is an inspection view. It does not define equations and does not solve a model.

## Source Types

A sequence cell can use different source kinds.

### Matrix Source

A matrix-backed sequence turns matrix rows into ordered flows.

```json
{
  "type": "sequence",
  "source": {
    "kind": "matrix",
    "matrixCellId": "transaction-flow"
  }
}
```

Use this for transaction-flow matrices when you want to reveal who pays whom, in order.

### Dependency Source

A dependency sequence shows equation relationships for a model.

```json
{
  "type": "sequence",
  "source": {
    "kind": "dependency",
    "modelId": "main",
    "showAccountingStrips": true,
    "showExogenous": false
  }
}
```

Use this to inspect how variables feed into each other and how accounting bands relate to model equations.

### PlantUML Source

Some sequence cells can use a PlantUML-style source string.

```json
{
  "type": "sequence",
  "source": {
    "kind": "plantuml",
    "source": "A -> B: payment"
  }
}
```

Use this for hand-authored diagrams when the sequence is explanatory rather than generated from a matrix or model.

## Transaction-Flow Sequences

A transaction-flow sequence is useful when a matrix is correct but hard to read at once. It breaks rows into visual steps.

Matrix-backed sequences default to a **swimlane** view (columns as sectors, each matrix row as a horizontal flow band). Use **Lifelines** in the toolbar to switch to the classic vertical sequence layout. Ambiguous rows with multiple payers and multiple receivers show a warning note instead of inventing extra arrows.

Use it to answer:

- Which sector pays first?
- Which sector receives each flow?
- Are payments and receipts paired correctly?
- Which rows represent financial asset changes rather than current flows?

The Reset and Next step controls are useful for teaching or debugging the accounting story.

## Dependency Sequences

A dependency sequence summarizes equation structure for a model: variables grouped by layer, link counts, and parse errors. The interactive graph view has been removed; use the variable list to open the inspector on a specific name.

Use it to answer:

- Which variables are exogenous inputs?
- Which equations feed into a selected stock or flow?
- Where feedback loops may exist (cyclic nodes are labeled in the list).

For larger models, hide exogenous variables when you want a cleaner endogenous list, and show them when debugging missing inputs.

## Selected Period

When a sequence is derived from run results, the selected period matters. Use the period scrubber to inspect how values change through time.

If a flow looks wrong:

1. Check the selected period.
2. Check the source matrix or dependency source.
3. Check whether the source run has been executed.
4. Inspect the variables in a table or chart around the same period.

## Common Problems

- `matrixCellId` points to a missing matrix cell.
- `modelId` points to the wrong model.
- The source run has not been executed.
- Matrix signs make sender and receiver interpretation ambiguous.
- The diagram is too dense because too many exogenous or accounting-strip details are shown.

A sequence view is best used alongside the original matrix or equation list. The matrix gives the complete accounting table; the sequence gives the story one step at a time.
