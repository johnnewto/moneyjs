# Run REG Model Baseline
# This script simulates the baseline REG model from Godley & Lavoie (2007) Chapter 6

library(sfcr)

# Define equations
reg_eqs <- sfcr_set(
  Y_N ~ C_N + G_N + X_N - IM_N,
  Y_S ~ C_S + G_S + X_S - IM_S,
  IM_N ~ mu_N * Y_N,
  IM_S ~ mu_S * Y_S,
  X_N ~ IM_S,
  X_S ~ IM_N,
  YD_N ~ Y_N - TX_N + r[-1] * Bh_N[-1],
  YD_S ~ Y_S - TX_S + r[-1] * Bh_S[-1],
  TX_N ~ theta * (Y_N + r[-1] * Bh_N[-1]),
  TX_S ~ theta * (Y_S + r[-1] * Bh_S[-1]),
  V_N ~ V_N[-1] + (YD_N - C_N),
  V_S ~ V_S[-1] + (YD_S - C_S),
  C_N ~ alpha1_N * YD_N + alpha2_N * V_N[-1],
  C_S ~ alpha1_S * YD_S + alpha2_S * V_S[-1],
  Hh_N ~ V_N - Bh_N,
  Hh_S ~ V_S - Bh_S,
  Bh_N ~ V_N * (lambda0_N + lambda1_N * r - lambda2_N * (YD_N / V_N)),
  Bh_S ~ V_S * (lambda0_S + lambda1_S * r - lambda2_S * (YD_S / V_S)),
  TX ~ TX_N + TX_S,
  G ~ G_N + G_S,
  Bh ~ Bh_N + Bh_S,
  Hh ~ Hh_N + Hh_S,
  Bs ~ Bs[-1] + (G + r[-1] * Bs[-1]) - (TX + r[-1] * Bcb[-1]),
  Hs ~ Hs[-1] + Bcb - Bcb[-1],
  Bcb ~ Bs - Bh
)

# Define parameters and exogenous variables
reg_ext <- sfcr_set(
  r ~ 0.025,
  G_S ~ 20,
  G_N ~ 20,
  mu_N ~ 0.15,
  mu_S ~ 0.15,
  alpha1_N ~ 0.7,
  alpha1_S ~ 0.7,
  alpha2_N ~ 0.3,
  alpha2_S ~ 0.3,
  lambda0_N ~ 0.67,
  lambda0_S ~ 0.67,
  lambda1_N ~ 0.05,
  lambda1_S ~ 0.05,
  lambda2_N ~ 0.01,
  lambda2_S ~ 0.01,
  theta ~ 0.2
)

# Simulate baseline model
reg <- sfcr_baseline(
  equations = reg_eqs,
  external = reg_ext,
  periods = 10,
  hidden = c("Hh" = "Hs")
)

# Print the results
print(reg, width = Inf)
View(reg)
