# Run BMW Model Baseline
# This script simulates the baseline BMW model from Godley & Lavoie (2007) Chapter 7

library(sfcr)

# Define equations
bmw_eqs <- sfcr_set(
  Cs ~ Cd,
  Is ~ Id,
  Ns ~ Nd,
  Ls ~ Ls[-1] + Ld - Ld[-1],
  Y ~ Cs + Is,
  WBd ~ Y - rl[-1] * Ld[-1] - AF,
  AF ~ delta * K[-1],
  Ld ~ Ld[-1] + Id - AF,
  YD ~ WBs + rm[-1] * Mh[-1],
  Mh ~ Mh[-1] + YD - Cd,
  Ms ~ Ms[-1] + Ls - Ls[-1],
  rm ~ rl,
  WBs ~ W * Ns,
  Nd ~ Y / pr,
  W ~ WBd / Nd,
  Cd ~ alpha0 + alpha1 * YD + alpha2 * Mh[-1],
  K ~ K[-1] + Id - DA,
  DA ~ delta * K[-1],
  KT ~ kappa * Y[-1],
  Id ~ gamma * (KT - K[-1]) + DA
)

# Define parameters and exogenous variables
bmw_ext <- sfcr_set(
  rl ~ 0.025,
  alpha0 ~ 20,
  alpha1 ~ 0.75,
  alpha2 ~ 0.10,
  delta ~ 0.10,
  gamma ~ 0.15,
  kappa ~ 1,
  pr ~ 1
)

# Simulate baseline model
bmw <- sfcr_baseline(
  equations = bmw_eqs,
  external = bmw_ext,
  periods = 1000,
  method = "Newton",
  # hidden = c("Ms" = "Mh")
)

# Print the results
print(bmw, width = Inf)
View(bmw)
