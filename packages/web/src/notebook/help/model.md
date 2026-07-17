A model cell is a combined model editor. It keeps equations, externals, initial values, and solver settings together in one cell instead of splitting them into separate linked cells.

## How To Use

1. Press **Edit** on the model cell.
2. Edit equations, external parameters, initial values, and solver settings in the combined editor.
3. Press **Apply** to save the model.
4. Add or run a run cell that points to this model cell.
5. Use charts, tables, matrices, and sequences to inspect the output.

A combined model cell is convenient for compact notebooks and experiments. Separate equations, externals, initial-values, and solver cells are often clearer for larger models.

## What It Contains

A model cell contains the same model pieces as the linked model sections:

| Section | Purpose |
| --- | --- |
| Equations | Endogenous variables and model logic |
| Externals | Parameters and exogenous series |
| Initial values | Starting values for lagged variables and stocks |
| Solver | Numerical method and convergence settings |

The model cell owns all of these pieces together. A run cell can reference it with `sourceModelCellId`.

## When To Use A Combined Model Cell

Use a combined model cell when:

- The model is small.
- You want one compact editing surface.
- You are prototyping.
- The notebook is intended as a minimal example.

Use separate linked cells when:

- The model has many equations or parameters.
- Readers need to inspect each section independently.
- You want initial values and solver settings collapsed by default.
- The notebook follows a textbook or article structure with separate equation and parameter blocks.

## Inspecting Dependencies

In the read-only view, hover an equation to preview inputs and outputs. Click a row to pin that link highlight; click again to return to hover mode. Shift-click pins outputs, and Ctrl/Cmd-click pins inputs.

Use this to answer questions such as:

- Which variables feed into `Y`?
- What changes when `alpha1` is shocked?
- Which equations depend on a stock such as `Mh` or `K`?

## Source References

Run cells can reference a combined model cell with `sourceModelCellId`:

```json
{
  "id": "baseline-run",
  "type": "run",
  "mode": "baseline",
  "periods": 60,
  "resultKey": "baseline",
  "sourceModelCellId": "model-cell-id"
}
```

Use `sourceModelId` when the model is defined by separate linked cells. Use `sourceModelCellId` when the model is defined by a combined model cell.

## Validation

The combined model cell is validated as one model. Diagnostics may point to equations, externals, initial values, or solver settings.

If a combined model fails:

1. Check equation names and expressions.
2. Check missing external parameters.
3. Add initial values for lagged stocks.
4. Check solver tolerance and method.
5. Run a baseline before adding scenario shocks.

For a large model, consider splitting the combined model into separate linked sections so each part is easier to inspect.
