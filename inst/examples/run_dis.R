# Run DIS Model Baseline
# This script simulates the baseline DIS model from Godley & Lavoie (2007) Chapter 9

library(sfcr)

# Define equations
dis_eqs <- sfcr_set(
  y ~ s_E + inv_E - inv[-1],
  inv_T ~ sigma_T * s_E,
  inv_E ~ inv[-1] + gamma * (inv_T - inv[-1]),
  inv ~ inv[-1] + (y - s),
  s_E ~ beta * s[-1] + (1 - beta) * s_E[-1],
  s ~ c,
  N ~ y / pr,
  WB ~ N * W,
  UC ~ WB / y,
  INV ~ inv * UC,
  S ~ p * s,
  p ~ (1 + phi) * NHUC,
  NHUC ~ (1 - sigma_T) * UC + sigma_T * (1 + rl[-1]) * UC[-1],
  EF ~ S - WB + (INV - INV[-1]) - rl[-1] * INV[-1],
  Ld ~ INV,
  Ls ~ Ld,
  Ms ~ Ls,
  rm ~ rl - add,
  EFb ~ rl[-1] * Ls[-1] - rm[-1] * Mh[-1],
  YD ~ WB + EF + EFb + rm[-1] * Mh[-1],
  Mh ~ Mh[-1] + YD - C,
  ydhs ~ c + (mh - mh[-1]),
  C ~ c * p,
  mh ~ Mh / p,
  c ~ alpha0 + alpha1 * ydhs_E + alpha2 * mh[-1],
  ydhs_E ~ epsilon * ydhs[-1] + (1 - epsilon) * ydhs_E[-1]
)

# Define parameters and exogenous variables
dis_ext <- sfcr_set(
  rl ~ 0.025,
  pr ~ 1,
  W ~ 0.75,
  add ~ 0.02,
  alpha0 ~ 15,
  alpha1 ~ 0.8,
  alpha2 ~ 0.1,
  beta ~ 0.75,
  epsilon ~ 0.75,
  gamma ~ 0.25,
  phi ~ 0.25,
  sigma_T ~ 0.15
)

# Define balance-sheet matrix
bs_dis <- sfcr_matrix(
  columns = c("Households", "Production firms", "Banks", "Sum"),
  codes = c("h", "p", "b", "s"),
  c("Money", h = "+Mh", b = "-Ms"),
  c("Loans", p = "-Ld", b = "+Ls"),
  c("Inventories", p = "+INV", s = "+INV"),
  c("Balance", h = "-Mh", s = "-Mh")
)

# Define transactions-flow matrix
tfm_dis <- sfcr_matrix(
  columns = c("Households", "Firms_current", "Firms_capital", "Banks_current", "Banks_capital"),
  codes = c("h", "fc", "fk", "bc", "bk"),
  c("Consumption", h = "-C", fc = "+C"),
  c("Ch. Inventories", fc = "+d(INV)", fk = "-d(INV)"),
  c("Wages", h = "+WB", fc = "-WB"),
  c("Interest on loans", fc = "-rl[-1] * Ld[-1]", bc = "rl[-1] * Ls[-1]"),
  c("Entrepreneurial Profits", h = "+EF", fc = "-EF"),
  c("Banks profits", h = "+EFb", bc = "-EFb"),
  c("Interest on deposits", h = "+rm[-1] * Mh[-1]", bc = "-rm[-1] * Mh[-1]"),
  c("Change loans", fk = "+d(Ld)", bk = "-d(Ls)"),
  c("Change deposits", h = "-d(Mh)", bk = "+d(Ms)")
)

# Simulate baseline model
dis <- sfcr_baseline(
  equations = dis_eqs,
  external = dis_ext,
  periods = 100,
  hidden = c("Mh" = "Ms")
)

# Validate matrices
sfcr_validate(bs_dis, dis, "bs")
sfcr_validate(tfm_dis, dis, "tfm")

# Print the results
print(dis, width = Inf)
View(dis)
