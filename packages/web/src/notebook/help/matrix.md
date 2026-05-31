Matrix cells display structured accounting relationships. They are commonly used for balance sheets, transaction-flow matrices, account-transactions matrices, and other SFC accounting views.

Set `accountingKind` to `balance-sheet`, `transaction-flow`, or `account-transactions` when the matrix follows one of those SFC layouts. The notebook uses it for badges, unit checks, and Sum-row behavior instead of guessing from the cell id or title.

## How To Use

1. Press **Edit** on the matrix cell.
2. Use Grid mode to edit columns, sector labels, row labels, and values.
3. Use JSON mode for bulk edits or copy-paste from another notebook.
4. Set `sourceRunCellId` when matrix entries should evaluate against a run result.
5. Press **Apply**.

Matrix cells can show formulas as text and evaluate them at the selected simulation period when linked to a run.

## Structure

A matrix has columns and rows. Rows contain labels and values.

```json
{
  "type": "matrix",
  "title": "Accounting matrix",
  "sourceRunCellId": "baseline-run",
  "columns": ["Households", "Firms", "Sum"],
  "rows": [
    {
      "label": "Consumption",
      "values": ["-Cd", "+Cs", "0"]
    }
  ]
}
```

Each row's `values` array should match the column count.

## Bands And Sectors

Many matrix cells include row bands and sector labels. These make larger accounting matrices easier to read.

Use bands for groups such as:

- Consumption.
- Investment.
- Wages.
- Taxes.
- Loans.
- Deposits.
- Balance.

Use sector labels when columns are grouped by sector but have multiple accounts, such as current and capital accounts.

## Formulas

Matrix entries can reference variables from the source run:

- `+Mh` means positive household money deposits.
- `-Ld` means a liability or payment by the sector.
- `rl[-1] * Ld[-1]` means lagged interest on lagged loans.
- `d(Mh)` means a change in the stock.

Use signs consistently. In SFC matrices, the sign tells the accounting story.

## Accounting Checks

For transaction-flow matrices, rows and columns usually sum to zero. For balance sheets, financial asset rows usually net to zero across sectors because one sector's asset is another sector's liability.

Use matrix cells to check:

- Does every payment have a recipient?
- Does every asset have a liability counterpart?
- Do stock changes correspond to transaction flows?
- Do sector columns balance?

## Grid Mode Versus JSON Mode

Grid mode is best for normal editing:

- Add or edit rows.
- Change labels.
- Fill entries cell by cell.
- Keep row and column alignment visible.

JSON mode is best for advanced work:

- Copying a full matrix from another file.
- Reordering many rows.
- Editing optional fields.
- Reviewing exact serialized structure.

## Common Problems

- A row has fewer or more values than columns.
- A formula references a variable that is not in the source run.
- Signs are inconsistent across sectors.
- A transaction-flow row does not sum to zero.
- A balance-sheet asset has no liability counterpart.
- The selected period is not the period you intended to inspect.

For SFC notebooks, matrices are not decorative. They are accounting tests that make model logic visible.
