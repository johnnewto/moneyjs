# Run LP Model Baseline
# This script simulates the baseline LP model from Godley & Lavoie (2007) Chapter 5

library(sfcr)

# Define equations
lp_eqs <- sfcr_set(
  eq1 = Y ~ C + G,
  eq2 = YDr ~ Y - TX + rb[-1] * Bh[-1] + BLh[-1],
  eq3 = TX ~ theta * (Y + rb[-1] * Bh[-1] + BLh[-1]),
  eq4 = V ~ V[-1] + (YDr - C) + CG,
  eq5 = CG ~ (pbl - pbl[-1]) * BLh[-1],
  eq6 = C ~ alpha1 * YDEr + alpha2 * V[-1],
  eq7 = VE ~ V[-1] + (YDEr - C) + CG,
  eq8 = Hh ~ V - Bh - pbl * BLh,
  eq9 = Hd ~ VE - Bd - pbl * BLd,
  eq10 = Bd ~ (VE * lambda20) + VE * (lambda22 * rb + lambda23 * ERrbl) + lambda24 * (YDEr),
  eq11 = BLd ~ VE * (lambda30 + lambda32 * rb + lambda33 * ERrbl + lambda34 * (YDEr/VE))/pbl,
  eq12 = Bh ~ Bd,
  eq13 = BLh ~ BLd,
  eq14 = Bs ~ Bs[-1] + (G + rb[-1] * Bs[-1] + BLs[-1]) - (TX + rb[-1] * Bcb[-1]) - (d(BLs) * pbl),
  eq15 = Hs ~ Hs[-1] + d(Bcb),
  eq16 = Bcb ~ Bs - Bh,
  eq17 = BLs ~ BLh,
  eq18 = ERrbl ~ rbl + chi * ((pebl - pbl)/pbl),
  eq19 = rbl ~ 1/pbl,
  eq20 = pebl ~ pbl,
  eq21 = CGE ~ chi * (pebl - pbl) * BLh,
  eq22 = YDEr ~ YDr[-1]
)

# Define parameters and exogenous variables
lp_external <- sfcr_set(
  G ~ 20,
  rb ~ 0.03,
  pbl ~ 20,
  theta ~ 0.1938,
  alpha1 ~ 0.8,
  alpha2 ~ 0.2,
  lambda20 ~ 0.44196,
  lambda22 ~ 1.1,
  lambda23 ~ -1,
  lambda24 ~ -0.03,
  lambda30 ~ 0.3997,
  lambda32 ~ -1,
  lambda33 ~ 1.1,
  lambda34 ~ -0.03,
  chi ~ 0.1
)

# Simulate baseline model
lp <- sfcr_baseline(
  equations = lp_eqs,
  external = lp_external,
  periods = 10,
  hidden = c("Hs" = "Hh")
)

# Print the results (all columns, 3 digits, no scientific notation, excluding external vars)
options(scipen = 999, pillar.sigfig = 3)
external_vars <- c("G", "rb", "pbl", "theta", "alpha1", "alpha2", "lambda20", "lambda22", 
                   "lambda23", "lambda24", "lambda30", "lambda32", "lambda33", "lambda34", "chi")
lp_endo <- lp[, !names(lp) %in% external_vars]
print(as.data.frame(lapply(lp_endo, function(x) round(x, 3))))
