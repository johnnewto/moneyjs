#!/usr/bin/env Rscript

library(jsonlite)
library(pkgload)

pkgload::load_all("references/r-sfcr", quiet = TRUE)
library(sfcr)

output_dir <- "packages/web/test/fixtures/r-regressions"
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

round_value <- function(x) {
  round(unname(as.numeric(x)), digits = 12)
}

period_snapshot <- function(model, period, variables) {
  row <- model[model$period == period, variables, drop = FALSE]
  if (nrow(row) != 1) {
    stop(sprintf("Expected exactly one row for period %s", period))
  }

  stats <- lapply(variables, function(variable) round_value(row[[variable]][[1]]))
  names(stats) <- variables
  stats
}

write_fixture <- function(name, payload) {
  writeLines(
    toJSON(payload, pretty = TRUE, auto_unbox = TRUE, digits = NA),
    file.path(output_dir, sprintf("%s.json", name))
  )
}

generate_bmw_fixture <- function() {
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

  bmw_external <- sfcr_set(
    rl ~ 0.025,
    alpha0 ~ 20,
    alpha1 ~ 0.75,
    alpha2 ~ 0.10,
    delta ~ 0.10,
    gamma ~ 0.15,
    kappa ~ 1,
    pr ~ 1
  )

  bmw <- sfcr_baseline(
    bmw_eqs,
    bmw_external,
    periods = 50,
    method = "Newton",
    hidden = c("Ms" = "Mh")
  )

  shock1 <- sfcr_shock(
    variables = sfcr_set(alpha0 ~ 30),
    start = 5,
    end = 50
  )
  bmw1 <- sfcr_scenario(bmw, scenario = shock1, periods = 50)

  shock2 <- sfcr_shock(
    variables = sfcr_set(alpha1 ~ 0.7),
    start = 5,
    end = 50
  )
  bmw2 <- sfcr_scenario(bmw, scenario = shock2, periods = 50)

  bs_bmw <- sfcr_matrix(
    columns = c("Households", "Firms", "Banks", "Sum"),
    codes = c("h", "f", "b", "s"),
    c("Money", h = "+Mh", b = "-Ms"),
    c("Loans", f = "-Ld", b = "+Ls"),
    c("Fixed capital", f = "+K", s = "+K"),
    c("Balance", h = "-Mh", s = "-Mh")
  )

  tfm_bmw <- sfcr_matrix(
    columns = c("Households", "Firms_current", "Firms_capital", "Banks_current", "Banks_capital"),
    codes = c("h", "fc", "fk", "bc", "bk"),
    c("Consumption", h = "-Cs", fc = "+Cd"),
    c("Investment", fc = "+Is", fk = "-Id"),
    c("Wages", h = "+WBs", fc = "-WBd"),
    c("Depreciation", fc = "-AF", fk = "+AF"),
    c("Interest loans", fc = "-rl[-1] * Ld[-1]", bc = "+rl[-1] * Ls[-1]"),
    c("Interest on deposits", h = "+rm[-1] * Mh[-1]", bc = "-rm[-1] * Ms[-1]"),
    c("Ch. loans", fk = "+d(Ld)", bk = "-d(Ls)"),
    c("Ch. deposits", h = "-d(Mh)", bk = "+d(Ms)")
  )

  fixture <- list(
    templateId = "bmw",
    sourceVignette = "references/r-sfcr/vignettes/articles/gl5-bmw.Rmd",
    checkpoints = list(
      "baseline-newton" = list(
        periods = list(
          "5" = period_snapshot(bmw, 5, c("Y", "Cd", "Mh", "W")),
          "50" = period_snapshot(bmw, 50, c("Y", "Cd", "Mh", "W"))
        )
      ),
      "scenario-1-run" = list(
        periods = list(
          "5" = period_snapshot(bmw1, 5, c("Cd", "YD", "Id", "AF")),
          "50" = period_snapshot(bmw1, 50, c("Cd", "YD", "Id", "AF"))
        )
      ),
      "scenario-2-run" = list(
        periods = list(
          "5" = period_snapshot(bmw2, 5, c("Cd", "YD", "W")),
          "50" = period_snapshot(bmw2, 50, c("Cd", "YD", "W"))
        )
      )
    ),
    matrixValidation = list(
      balanceSheet = capture.output(sfcr_validate(bs_bmw, bmw, "bs")),
      transactionFlow = capture.output(sfcr_validate(tfm_bmw, bmw, "tfm"))
    )
  )

  write_fixture("bmw", fixture)
}

generate_gl6_dis_fixture <- function() {
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

  dis <- sfcr_baseline(
    equations = dis_eqs,
    external = dis_ext,
    periods = 100,
    hidden = c("Mh" = "Ms")
  )

  shock1 <- sfcr_shock(
    variables = sfcr_set(phi ~ 0.35),
    start = 5,
    end = 40
  )
  dis1 <- sfcr_scenario(baseline = dis, scenario = shock1, periods = 40)

  shock2 <- sfcr_shock(
    variables = sfcr_set(sigma_T ~ 0.25),
    start = 5,
    end = 50
  )
  dis2 <- sfcr_scenario(dis, shock2, 50)

  bs_dis <- sfcr_matrix(
    columns = c("Households", "Production firms", "Banks", "Sum"),
    codes = c("h", "p", "b", "s"),
    c("Money", h = "+Mh", b = "-Ms"),
    c("Loans", p = "-Ld", b = "+Ls"),
    c("Inventories", p = "+INV", s = "+INV"),
    c("Balance", h = "-Mh", s = "-Mh")
  )

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

  fixture <- list(
    templateId = "gl6-dis",
    sourceVignette = "references/r-sfcr/vignettes/articles/gl6-dis.Rmd",
    checkpoints = list(
      "baseline-run" = list(
        periods = list(
          "5" = period_snapshot(dis, 5, c("ydhs", "c", "p", "Mh", "INV")),
          "100" = period_snapshot(dis, 100, c("ydhs", "c", "p", "Mh", "INV"))
        )
      ),
      "scenario-1-run" = list(
        periods = list(
          "5" = period_snapshot(dis1, 5, c("c", "ydhs", "p")),
          "40" = period_snapshot(dis1, 40, c("c", "ydhs", "p"))
        )
      ),
      "scenario-2-run" = list(
        periods = list(
          "5" = period_snapshot(dis2, 5, c("ydhs", "c", "inv", "inv_E")),
          "50" = period_snapshot(dis2, 50, c("ydhs", "c", "inv", "inv_E"))
        )
      )
    ),
    matrixValidation = list(
      balanceSheet = capture.output(sfcr_validate(bs_dis, dis, "bs")),
      transactionFlow = capture.output(sfcr_validate(tfm_dis, dis, "tfm"))
    )
  )

  write_fixture("gl6-dis", fixture)
}

generate_bmw_fixture()
generate_gl6_dis_fixture()
