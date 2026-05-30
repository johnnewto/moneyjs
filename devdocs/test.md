
| Households || Firms || Banks ||
|----------|:---------:|---------:|
| Deposits | Net_Worth | Deposits | HH.Deposits| Firm.Deposits| Firm.Loans|





Discuus the following idea 
"make a third type of matrix that does the job of the transaction flow matrix.  call it Account Transactions

it has expandable and collapsable  Sectors such as Households, Firms, Banks
For BMW it would have 

Households
  Assets
    Households.Deposits (Mh)

  Equity
    Households.Net_Worth (Vh)


Firms
  Assets
    Firms.Deposits (Mf)
    Firms.Capital (K)

  Liabilities
    Firms.Loans (Ld)

  Equity
    Firms.Net_Worth (Vf)


Banks
  Assets
    Bank.Firm.Loans (Ls)

  Liabilities
    Banks.HH.Deposits (MhL)
    Banks.HH.Deposits (MfL)

  Equity
    Banks.Net_Worth (Vb)


| Balance Sheet Item || Firms | Banks |         Sum |
| ------------------ | ---------: | ----: | ----: | ----------: |
| Households.Deposits |        +Mh |       |  -MhL |           0 |
| Firms.Deposits      |            |   +Mf |  -MfL |           0 |
| Firms.Loans              |            |   -Ld |   +Ls |           0 |
| Firms.Capital      |            |    +K |       |          +K |
| *.Net_Worth          |        -Vh |   -Vf |   -Vb | -(Vh+Vf+Vb) |
| Sum                |          0 |     0 |     0 |           0 |

the Name.Account is hiearcial