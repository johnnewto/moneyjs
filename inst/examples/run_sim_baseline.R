# Run SIM Model Baseline
# This script simulates the baseline SIM model from Godley & Lavoie (2007) Chapter 3

library(sfcr)

# Define equations
sim_eqs <- sfcr_set(
  TXs ~ TXd,
  YD ~ W * Ns - TXs,
  Cd ~ alpha1 * YD + alpha2 * Hh[-1],
  Hh ~ YD - Cd + Hh[-1],
  Ns ~ Nd,
  Nd ~ Y / W,
  Cs ~ Cd,
  Gs ~ Gd,
  Y ~ Cs + Gs,
  TXd ~ theta * W * Ns,
  Hs ~ Gd - TXd + Hs[-1]
)

# Define parameters and exogenous variables
sim_ext <- sfcr_set(
  Gd ~ 20,
  W ~ 1,
  alpha1 ~ 0.6,
  alpha2 ~ 0.4,
  theta ~ 0.2
)

# Simulate baseline model
sim <- sfcr_baseline(
  equations = sim_eqs,
  external = sim_ext,
  periods = 10,
  hidden = c("Hh" = "Hs")
)

# Print the results
print(sim, width = Inf)
View(sim)
# # Print selected periods and columns (matching Godley & Lavoie p.69)
# sim %>%
#   dplyr::filter(period %in% c(1, 2, 3, 50)) %>%
#   dplyr::select(period, Gs, Y, TXd, YD, Hs, Cd, ) %>%
#   t() %>%
#   round(digits = 2) %>%
#   print()
