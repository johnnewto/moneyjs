In stock-flow consistent (SFC) modelling, the transaction matrix and balance sheet matrix are the two core accounting structures. They do different jobs but are tightly linked: one tracks flows over a period, the other tracks stocks at a point in time.

## Transaction Matrix: Flows

This matrix records who pays whom, for what, during a period such as a year. Each row is a type of transaction, and each column is a sector.

Key properties:

- Entries are flows, with units like $/year.
- Every row sums to zero: every payment by one sector is received by another.
- Every column sums to zero: each sector's uses of funds equal its sources of funds.

| Transaction | Households | Firms | Government | Sum |
| --- | ---: | ---: | ---: | ---: |
| Consumption (C) | -C | +C | | 0 |
| Wages (W) | +W | -W | | 0 |
| Taxes (T) | -T | | +T | 0 |
| Gov spending (G) | | +G | -G | 0 |
| Column sum | 0 | 0 | 0 | |

Interpretation:

- Households spend consumption (-C), firms receive it (+C).
- Firms pay wages (-W), households receive them (+W).
- Government collects taxes (+T) and spends (-G).

This matrix is a flow-of-funds statement with double-entry bookkeeping across sectors.

## Link To Balance Sheets

The transaction matrix generates flows, and those flows update balance sheet stocks through accumulation equations such as:

`Vh = lag(Vh) + (YD - C) * dt`

`YD` and `C` are flows from the transaction matrix. `Vh` is a stock. That bridge is the core SFC principle: every flow comes from somewhere and goes somewhere, and every stock changes consistently with flows.

Practical checks:

- Transaction matrices should strictly use flow units.
- Row sums should be zero.
- Column sums should be zero.
- Accumulation equations like `X = lag(X) + flow * dt` signal stock-flow links.
