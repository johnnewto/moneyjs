In stock-flow consistent (SFC) modelling, the balance sheet matrix and transaction matrix are the two core accounting structures. They do different jobs but are tightly linked: one tracks stocks at a point in time, the other tracks flows over a period.

## Balance Sheet Matrix: Stocks

This matrix records who holds what, and who owes what, at a point in time.

Key properties:

- Entries are stocks, with units like $.
- Each sector has assets and liabilities.
- Rows usually sum to zero when assets and liabilities are consolidated across sectors.

| Asset / Liability | Households | Firms | Government | Banks | Sum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Money deposits | +M | | | -M | 0 |
| Loans | | -L | | +L | 0 |
| Government bonds | +B | | -B | | 0 |
| Net worth | +Vh | +Vf | | | |

Interpretation:

- Household deposits are an asset for households (+M) and a liability for banks (-M).
- Loans are a liability of firms (-L) and an asset of banks (+L).
- Government bonds are liabilities of government (-B) and assets of households (+B).

## Link To Transactions

Balance sheet stocks are updated by flows from the transaction matrix through accumulation equations such as:

`Vh = lag(Vh) + (YD - C) * dt`

`YD` and `C` are flows. `Vh` is a stock. This is the core SFC principle: every flow comes from somewhere and goes somewhere, and every stock changes consistently with flows.

Conceptual distinction:

- Transaction matrix: an income statement across sectors.
- Balance sheet matrix: who owns what.
- Transaction matrix: only flows.
- Balance sheet matrix: only stocks.

Practical checks:

- Balance matrices should strictly use stock units.
- Financial assets should have counterpart liabilities somewhere.
- Equations like `X = lag(X) + flow * dt` are strong signals of stock variables.
- Stock-flow linkage consistency can be checked against the related transaction rows.
