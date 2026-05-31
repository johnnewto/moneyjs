Account-transactions matrices extend the transactions-flow view with one column per balance-sheet account. They are useful when a model has several accounts within each sector and you want flows broken down by asset, liability, and equity columns.

## How It Differs From Other Matrices

- **Balance sheet:** stocks at a point in time; columns are usually one per sector.
- **Transaction flow:** sector-level flows over a period; rows sum to zero across sectors.
- **Account transactions:** account-level flows; columns use hierarchical labels such as `Households.Deposits (Mh)` grouped under `sectors`, with optional `columnBadges` for asset, liability, or equity roles.

Set `accountingKind` to `account-transactions` (YAML alias `accountTransactions`) so the notebook applies flow unit checks, Sum-row behavior, and column layout helpers instead of inferring from the cell id or title.

## Structure

```json
{
  "type": "matrix",
  "accountingKind": "account-transactions",
  "title": "Account transactions",
  "sourceRunCellId": "baseline-run",
  "columns": ["Households.Deposits (Mh)", "Firms.Loans", "Sum"],
  "sectors": ["Households(HH)", "Firms", ""],
  "columnBadges": ["asset", "liability", ""],
  "rows": [
    {
      "band": "Wages",
      "label": "Wages",
      "values": ["+WBd", "-WBd", "0"]
    },
    {
      "band": "Sum",
      "label": "Sum",
      "values": ["Mh", "Ls", "0"]
    }
  ]
}
```

- `columns` and `sectors` must have the same length.
- `columnBadges` is optional but recommended for account layouts; use `asset`, `liability`, or `equity` (aliases such as `netWorth` normalize to equity).
- The final column is usually `Sum`. The Sum row can hold stock expressions that other rows reference.

## Row Totals And Signs

For account-transaction matrices, the Sum column applies asset (+), liability (−), and equity (−) weighting when `columnBadges` are set. Flow rows keep signed debits and credits in cells; do not treat them like balance-sheet stock rows.

## UI

When `columnBadges` are present, the grid shows a two-row sector header, sector collapse toggles, and intra-sector dividers. Use **Expand all** / **Collapse all** or click sector headers to show or hide account columns.

## Common Problems

- `columnBadges` length does not match `columns`.
- A sector label is missing where multiple accounts share a sector.
- Sum-row sources are empty when the matrix should bind stocks from the linked run.
- `accountingKind` is unset and the cell is treated as a generic matrix.

For a full example, open the BMW template account-transactions matrix.
