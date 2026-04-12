# Run OPEN Model Baseline
# This script simulates the baseline OPEN model from Godley & Lavoie (2007) Chapter 6

library(sfcr)

# Define equations
open_eqs <- sfcr_set(
  Y_N ~ C_N + G_N + X_N - IM_N,
  Y_S ~ C_S + G_S + X_S - IM_S,
  IM_N ~ mu_N * Y_N,
  IM_S ~ mu_S * Y_S,
  X_N ~ IM_S / xr,
  X_S ~ IM_N * xr,
  YD_N ~ Y_N - TX_N + r_N[-1] * Bh_N[-1],
  YD_S ~ Y_S - TX_S + r_S[-1] * Bh_S[-1],
  TX_N ~ theta_N * (Y_N + r_N[-1] * Bh_N[-1]),
  TX_S ~ theta_S * (Y_S + r_S[-1] * Bh_S[-1]),
  V_N ~ V_N[-1] + (YD_N - C_N),
  V_S ~ V_S[-1] + (YD_S - C_S),
  C_N ~ alpha1_N * YD_N + alpha2_N * V_N[-1],
  C_S ~ alpha1_S * YD_S + alpha2_S * V_S[-1],
  Hh_N ~ V_N - Bh_N,
  Hh_S ~ V_S - Bh_S,
  Bh_N ~ V_N * (lambda0_N + lambda1_N * r_N - lambda2_N * (YD_N / V_N)),
  Bh_S ~ V_S * (lambda0_S + lambda1_S * r_S - lambda2_S * (YD_S / V_S)),
  Bs_N ~ Bs_N[-1] + (G_N + r_N[-1] * Bs_N[-1]) - (TX_N + r_N[-1] * Bcb_N[-1]),
  Bs_S ~ Bs_S[-1] + (G_S + r_S[-1] * Bs_S[-1]) - (TX_S + r_S[-1] * Bcb_S[-1]),
  Bcb_N ~ Bs_N - Bh_N,
  Bcb_S ~ Bs_S - Bh_S,
  or_N ~ or_N[-1] + ((Hs_N - Hs_N[-1] - (Bcb_N - Bcb_N[-1])) / pg_N),
  or_S ~ or_S[-1] + ((Hs_S - Hs_S[-1] - (Bcb_S - Bcb_S[-1])) / pg_S),
  Hs_N ~ Hh_N,
  Hs_S ~ Hh_S,
  pg_S ~ pg_N * xr,
  deltaor_S ~ or_S - or_S[-1],
  deltaor_N ~ -(or_N - or_N[-1])
)

# Define parameters and exogenous variables
open_ext <- sfcr_set(
  xr ~ 1,
  pg_N ~ 1,
  r_N ~ 0.025,
  r_S ~ 0.025,
  G_S ~ 20,
  G_N ~ 20,
  mu_N ~ 0.15,
  mu_S ~ 0.15,
  alpha1_N ~ 0.7,
  alpha1_S ~ 0.8,
  alpha2_N ~ 0.3,
  alpha2_S ~ 0.2,
  lambda0_N ~ 0.67,
  lambda0_S ~ 0.67,
  lambda1_N ~ 0.05,
  lambda1_S ~ 0.05,
  lambda2_N ~ 0.01,
  lambda2_S ~ 0.01,
  theta_N ~ 0.2,
  theta_S ~ 0.2
)


# Define balance-sheet matrix
bs_open <- sfcr_matrix(
  columns = c("North_HH", "North_Govt", "North_CB", "South_HH", "South_Govt", "South_CB", "Sum"),
  codes = c("nh", "ng", "ncb", "sh", "sg", "scb", "s"),
  c("Money", nh = "+Hh_N", ncb = "-Hs_N", sh = "+Hh_S", scb = "-Hs_S"),
  c("Bills", nh = "+Bh_N", ng = "-Bs_N", ncb = "+Bcb_N", sh = "+Bh_S", sg = "-Bs_S", scb = "+Bcb_S"),
  c("Gold", ncb = "+or_N * pg_N * xr", scb = "or_S * pg_S", s = "or_N * pg_N * xr + (or_S * pg_S)"),
  c("Wealth", nh = "-V_N", ng = "Bs_N", sh = "-V_S", sg = "Bs_S", s = "-(or_N * pg_N * xr + (or_S * pg_S))")
)

# Define transactions-flow matrix
tfm_open <- sfcr_matrix(
  columns = c("N_Households", "N_Firms", "N_Govt", "N_CentralBank", "S_Households", "S_Firms", "S_Govt", "S_CentralBank"),
  codes = c("nh", "nf", "ng", "ncb", "sh", "sf", "sg", "scb"),
  c("Consumption", nh = "-C_N", nf = "+C_N", sh = "-C_S", sf = "+C_S"),
  c("Govt. Exp", nf = "+G_N", ng = "-G_N", sf = "+G_S", sg = "-G_S"),
  c("North X to South", nf = "+X_N * xr", sf = "-IM_S"),
  c("South X to North", nf = "-IM_N * xr", sf = "+X_S"),
  c("GDP", nh = "+Y_N", nf = "-Y_N", sh = "+Y_S", sf = "-Y_S"),
  c("Interest payments", nh = "+r_N[-1] * Bh_N[-1]", ng = "-r_N[-1] * Bs_N[-1]", ncb = "+r_N[-1] * Bcb_N[-1]", sh = "+r_S[-1] * Bh_S[-1]", sg = "-r_S[-1] * Bs_S[-1]", scb = "+r_S[-1] * Bcb_S[-1]"),
  c("CB Profits", ng = "+r_N[-1] * Bcb_N[-1]", ncb = "-r_N[-1] * Bcb_N[-1]", sg = "+r_S[-1] * Bcb_S[-1]", scb = "-r_S[-1] * Bcb_S[-1]"),
  c("Taxes", nh = "-TX_N", ng = "+TX_N", sh = "-TX_S", sg = "+TX_S"),
  c("Ch. cash", nh = "-d(Hh_N)", ncb = "+d(Hs_N)", sh = "-d(Hh_S)", scb = "+d(Hs_S)"),
  c("Ch. bills", nh = "-d(Bh_N)", ng = "+d(Bs_N)", ncb = "-d(Bcb_N)", sh = "-d(Bh_S)", sg = "+d(Bs_S)", scb = "-d(Bcb_S)"),
  c("Ch. Gold", ncb = "-d(or_N) * pg_N * xr", scb = "-d(or_S) * pg_S")
)


# Simulate baseline model
open <- sfcr_baseline(
  equations = open_eqs,
  external = open_ext,
  periods = 50,
  hidden = c("deltaor_S" = "deltaor_N"),
  .hidden_tol = 0.01
)

# Validate matrices
sfcr_validate(bs_open, open, "bs")
sfcr_validate(tfm_open, open, "tfm")

# Print the results
print(open, width = Inf)
View(open)


