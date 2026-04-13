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

extract_java_call_pairs <- function(text, pattern) {
  matches <- gregexpr(pattern, text, perl = TRUE)
  captures <- regmatches(text, matches)[[1]]
  if (length(captures) == 0) {
    return(data.frame(name = character(), value = character(), stringsAsFactors = FALSE))
  }

  parsed <- lapply(
    captures,
    function(entry) {
      match <- regexec(pattern, entry, perl = TRUE)
      values <- regmatches(entry, match)[[1]]
      c(values[2], values[3])
    }
  )

  as.data.frame(do.call(rbind, parsed), stringsAsFactors = FALSE) |>
    stats::setNames(c("name", "value"))
}

load_growth_model_from_java <- function() {
  java_source <- paste(
    readLines("references/java/src/main/java/io/github/joaomacalos/sfcr/model/GrowthModels.java", warn = FALSE),
    collapse = "\n"
  )

  equation_pairs <- extract_java_call_pairs(
    java_source,
    r"{\.equation\("([^"]+)",\s*"([^"]+)"\)}"
  )
  external_pairs <- extract_java_call_pairs(
    java_source,
    r"{external\(builder,\s*"([^"]+)",\s*"([^"]+)"\);}"
  )
  initial_pairs <- extract_java_call_pairs(
    java_source,
    r"{initial\(builder,\s*"([^"]+)",\s*"([^"]+)"\);}"
  )

  equations <- do.call(
    sfcr_set,
    lapply(seq_len(nrow(equation_pairs)), function(index) {
      stats::as.formula(sprintf("%s ~ %s", equation_pairs$name[[index]], equation_pairs$value[[index]]))
    })
  )

  externals <- do.call(
    sfcr_set,
    lapply(seq_len(nrow(external_pairs)), function(index) {
      stats::as.formula(sprintf("%s ~ %s", external_pairs$name[[index]], external_pairs$value[[index]]))
    })
  )

  initials <- do.call(
    sfcr_set,
    lapply(seq_len(nrow(initial_pairs)), function(index) {
      stats::as.formula(sprintf("%s ~ %s", initial_pairs$name[[index]], initial_pairs$value[[index]]))
    })
  )

  list(equations = equations, externals = externals, initial = initials)
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

generate_gl7_insout_fixture <- function() {
  insout_eqs <- sfcr_set(
    y ~ sE + (invE - inv[-1]),
    N ~ y / pr,
    WB ~ N * W,
    UC ~ WB / y,
    sE ~ beta * s[-1] + (1 - beta) * sE[-1],
    invT ~ sigmaT * sE,
    sigmaT ~ sigma0 - sigma1 * rl,
    invE ~ inv[-1] + gamma * (invT - inv[-1]),
    p ~ (1 + tau) * (1 + phi) * NHUC,
    NHUC ~ (1 - sigmaT) * UC + sigmaT * (1 + rl[-1]) * UC[-1],
    s ~ c + g,
    S ~ s * p,
    inv ~ inv[-1] + y - s,
    sigmas ~ inv[-1] / s,
    INV ~ inv * UC,
    Ld ~ INV,
    FXf ~ S - TX - WB + (INV - INV[-1]) - rl[-1] * INV[-1],
    pi ~ (p / p[-1]) - 1,
    YDr ~ FX + WB + rm[-1] * M2h[-1] + rb[-1] * Bhh[-1] + BLh[-1],
    CG ~ (pbl - pbl[-1]) * BLh[-1],
    YDhs ~ YDr + CG,
    FX ~ FXf + FXb,
    V ~ V[-1] + YDhs - C,
    Vnc ~ V - Hhh,
    ydr ~ YDr / p - pi * (V[-1] / p),
    ydhs ~ (YDr - pi * V[-1] + CG) / p,
    v ~ V / p,
    c ~ alpha0 + alpha1 * ydrE + alpha2 * v[-1],
    ydrE ~ epsilon * ydr[-1] + (1 - epsilon) * ydrE[-1],
    C ~ p * c,
    YDrE ~ p * ydrE + pi * (V[-1] / p),
    VE ~ V[-1] + (YDrE - C),
    Hhd ~ lambdac * C,
    VncE ~ VE - Hhd,
    ERrbl ~ rbl,
    M2d ~ VncE * (lambda20 + lambda22 * rm + lambda23 * rb + lambda24 * ERrbl + lambda25 * (YDrE / VncE)),
    Bhd ~ VncE * (lambda30 + lambda32 * rm + lambda33 * rb + lambda34 * ERrbl + lambda35 * (YDrE / VncE)),
    BLd ~ (VncE / pbl) * (lambda40 + lambda42 * rm + lambda43 * rb + lambda44 * ERrbl + lambda45 * (YDrE / VncE)),
    M1d ~ VncE * (lambda10 + lambda12 * rm + lambda13 * rb + lambda14 * ERrbl + lambda15 * (YDrE / VncE)),
    M1d2 ~ VncE - M2d - Bhd - pbl * BLd,
    Hhh ~ Hhd,
    Bhh ~ Bhd,
    BLh ~ BLd,
    M1hN ~ Vnc - M2d - Bhd - pbl * BLd,
    z1 ~ if (M1hN > 0) {1} else {0},
    z2 ~ 1 - z1,
    M1h ~ M1hN * z1,
    M2hN ~ M2d,
    M2h ~ M2d * z1 + (Vnc - Bhh - pbl * BLd) * z2,
    TX ~ S * (tau / (1 + tau)),
    G ~ p * g,
    PSBR ~ G + rb[-1] * Bs[-1] + BLs[-1] - (TX + FXcb),
    Bs ~ Bs[-1] + PSBR - (BLs - BLs[-1]) * pbl,
    BLs ~ BLd,
    pbl ~ 1 / rbl,
    GD ~ GD[-1] + PSBR,
    Hs ~ Bcb + As,
    Hbs ~ Hs - Hhs,
    Bcb ~ Bs - Bhh - Bbd,
    As ~ Ad,
    ra ~ rb,
    FXcb ~ rb[-1] * Bcb[-1] + ra[-1] * As[-1],
    Hhs ~ Hhd,
    M1s ~ M1h,
    M2s ~ M2h,
    Ls ~ Ld,
    Hbd ~ ro1 * M1s + ro2 * M2s,
    BbdN ~ M1s + M2s - Ls - Hbd,
    BLRN ~ BbdN / (M1s + M2s),
    Ad ~ (bot * (M1s + M2s) - BbdN) * z3,
    z3 ~ if (BLRN < bot) {1} else {0},
    Bbd ~ Ad + M1s + M2s - Ls - Hbd,
    BLR ~ Bbd / (M1s + M2s),
    rm ~ rm[-1] + zetam * (z4 - z5) + zetab * (rb - rb[-1]),
    z4 ~ if (BLRN[-1] < bot) {1} else {0},
    z5 ~ if (BLRN[-1] > top) {1} else {0},
    FXb ~ rl[-1] * Ls[-1] + rb[-1] * Bbd[-1] - rm[-1] * M2s[-1] - ra[-1] * Ad[-1],
    rl ~ rl[-1] + zetal * (z6 - z7) + (rb - rb[-1]),
    z6 ~ if (BPM < botpm) {1} else {0},
    z7 ~ if (BPM > toppm) {1} else {0},
    lM1s ~ M1s[-1],
    lM2s ~ M2s[-1],
    BPM ~ (FXb + FXb[-1]) / (lM1s + lM1s[-1] + lM2s + lM2s[-1]),
    omegaT ~ exp(Omega0 + Omega1 * log(pr) + Omega2 * log(N / Nfe)),
    W ~ W[-1] * (1 + Omega3 * (omegaT[-1] - (W[-1] / p[-1]))),
    Y ~ p * s + UC * (inv - inv[-1])
  )

  insout_ext <- sfcr_set(
    rbl ~ 0.027,
    rb ~ 0.023,
    pr ~ 1,
    g ~ 25,
    Nfe ~ 133.28,
    alpha0 ~ 0,
    alpha1 ~ 0.95,
    alpha2 ~ 0.05,
    beta ~ 0.5,
    bot ~ 0.02,
    botpm ~ 0.003,
    epsilon ~ 0.5,
    gamma ~ 0.5,
    lambdac ~ 0.1,
    phi ~ 0.1,
    ro1 ~ 0.1,
    ro2 ~ 0.1,
    sigma0 ~ 0.3612,
    sigma1 ~ 3,
    tau ~ 0.25,
    zetab ~ 0.9,
    zetal ~ 0.0002,
    zetam ~ 0.0002,
    Omega0 ~ -0.32549,
    Omega1 ~ 1,
    Omega2 ~ 1.5,
    Omega3 ~ 0.1,
    top ~ 0.06,
    toppm ~ 0.005,
    lambda10 ~ -0.17071,
    lambda11 ~ 0,
    lambda12 ~ 0,
    lambda13 ~ 0,
    lambda14 ~ 0,
    lambda15 ~ 0.18,
    lambda20 ~ 0.52245,
    lambda21 ~ 0,
    lambda22 ~ 30,
    lambda23 ~ -15,
    lambda24 ~ -15,
    lambda25 ~ -0.06,
    lambda30 ~ 0.47311,
    lambda31 ~ 0,
    lambda32 ~ -15,
    lambda33 ~ 30,
    lambda34 ~ -15,
    lambda35 ~ -0.06,
    lambda40 ~ 0.17515,
    lambda41 ~ 0,
    lambda42 ~ -15,
    lambda43 ~ -15,
    lambda44 ~ 30,
    lambda45 ~ -0.06
  )

  insout <- sfcr_baseline(
    equations = insout_eqs,
    external = insout_ext,
    periods = 210,
    initial = sfcr_set(p ~ 1, W ~ 1, UC ~ 1, BPM ~ 0.0035),
    hidden = c("Hbd" = "Hbs"),
    tol = 1e-15
  )

  shock1 <- sfcr_shock(
    variables = sfcr_set(sigma0 ~ 0.4),
    start = 5,
    end = 70
  )
  insout1 <- sfcr_scenario(
    baseline = insout,
    periods = 70,
    scenario = list(shock1)
  )

  shock2 <- sfcr_shock(
    variables = sfcr_set(g ~ 30),
    start = 5,
    end = 55
  )
  insout2 <- sfcr_scenario(insout, list(shock2), periods = 55, tol = 1e-15)

  shock6 <- sfcr_shock(
    variables = sfcr_set(Omega0 ~ -0.2),
    start = 4,
    end = 55
  )
  shock7 <- sfcr_shock(
    variables = sfcr_set(rb ~ 0.03, rbl ~ 0.039),
    start = 5,
    end = 55
  )
  insout7 <- sfcr_scenario(insout, list(shock6, shock7), 55, tol = 1e-30)

  bs_insout <- sfcr_matrix(
    columns = c("Households", "Firms", "Government", "Central bank", "Banks", "Sum"),
    codes = c("h", "f", "g", "cb", "b", "s"),
    r1 = c("Inventories", f = "+INV", s = "+INV"),
    r2 = c("HPM", h = "+Hhd", cb = "-Hs", b = "+Hbd"),
    r3 = c("Advances", cb = "+As", b = "-Ad"),
    r4 = c("Checking deposits", h = "+M1h", b = "-M1s"),
    r5 = c("Time deposits", h = "+M2h", b = "-M2s"),
    r6 = c("Bills", h = "+Bhh", g = "-Bs", cb = "+Bcb", b = "+Bbd"),
    r7 = c("Bonds", h = "+BLh * pbl", g = "-BLs * pbl"),
    r8 = c("Loans", f = "-Ld", b = "+Ls"),
    r9 = c("Balance", h = "-V", f = 0, g = "+GD", cb = 0, b = 0, s = "-INV")
  )

  tfm_insout <- sfcr_matrix(
    columns = c("Households", "Firms current", "Firms capital", "Govt.", "CB current", "CB capital", "Banks current", "Banks capital"),
    codes = c("h", "fc", "fk", "g", "cbc", "cbk", "bc", "bk"),
    c("Consumption", h = "-C", fc = "+C"),
    c("Govt. Expenditures", fc = "+G", g = "-G"),
    c("Ch. Inv", fc = "+(INV - INV[-1])", fk = "-(INV - INV[-1])"),
    c("Taxes", fc = "-TX", g = "+TX"),
    c("Wages", h = "+WB", fc = "-WB"),
    c("Entrepreneurial profits", h = "+FXf", fc = "-FXf"),
    c("Bank profits", h = "+FXb", bc = "-FXb"),
    c("CB profits", g = "+FXcb", cbc = "-FXcb"),
    c("int. advances", cbc = "+ra[-1] * As[-1]", bc = "-ra[-1] * Ad[-1]"),
    c("int. loans", fc = "-rl[-1] * Ld[-1]", bc = "+rl[-1] * Ld[-1]"),
    c("int. deposits", h = "+rm[-1] * M2h[-1]", bc = "-rm[-1] * M2h[-1]"),
    c("int. bills", h = "+rb[-1] * Bhh[-1]", g = "-rb[-1] * Bs[-1]", cbc = "+rb[-1] * Bcb[-1]", bc = "+rb[-1] * Bbd[-1]"),
    c("int. bonds", h = "+BLh[-1]", g = "-BLs[-1]"),
    c("Ch. advances", cbk = "-(As - As[-1])", bk = "+(Ad - Ad[-1])"),
    c("Ch. loans", fk = "+(Ld - Ld[-1])", bk = "-(Ls - Ls[-1])"),
    c("Ch. cash", h = "-(Hhh - Hhh[-1])", cbk = "+(Hs - Hs[-1])", bk = "-(Hbd - Hbd[-1])"),
    c("Ch. M1", h = "-(M1h - M1h[-1])", bk = "+(M1s - M1s[-1])"),
    c("Ch. M2", h = "-(M2h - M2h[-1])", bk = "+(M2s - M2s[-1])"),
    c("Ch. bills", h = "-(Bhh - Bhh[-1])", g = "+(Bs - Bs[-1])", cbk = "-(Bcb - Bcb[-1])", bk = "-(Bbd - Bbd[-1])"),
    c("Ch. bonds", h = "-(BLh - BLh[-1]) * pbl", g = "+(BLs - BLs[-1]) * pbl")
  )

  fixture <- list(
    templateId = "gl7-insout",
    sourceVignette = "references/r-sfcr/vignettes/articles/gl7-insout.Rmd",
    checkpoints = list(
      "baseline-run" = list(
        periods = list(
          "5" = period_snapshot(insout, 5, c("Y", "pi", "V", "BLRN", "BPM")),
          "210" = period_snapshot(insout, 210, c("Y", "pi", "V", "BLRN", "BPM"))
        )
      ),
      "scenario-1-run" = list(
        periods = list(
          "5" = period_snapshot(insout1, 5, c("INV", "Ls", "rm", "rb")),
          "70" = period_snapshot(insout1, 70, c("INV", "Ls", "rm", "rb"))
        )
      ),
      "scenario-2-run" = list(
        periods = list(
          "5" = period_snapshot(insout2, 5, c("c", "v", "ydr", "pi")),
          "55" = period_snapshot(insout2, 55, c("c", "v", "ydr", "pi"))
        )
      ),
      "scenario-7-run" = list(
        periods = list(
          "5" = period_snapshot(insout7, 5, c("pi", "s", "V", "Bs")),
          "55" = period_snapshot(insout7, 55, c("pi", "s", "V", "Bs"))
        )
      )
    ),
    matrixValidation = list(
      balanceSheet = capture.output(sfcr_validate(bs_insout, insout, "bs")),
      transactionFlow = capture.output(sfcr_validate(tfm_insout, insout, "tfm"))
    )
  )

  write_fixture("gl7-insout", fixture)
}

generate_gl8_growth_fixture <- function() {
  growth_model <- load_growth_model_from_java()

  growth <- sfcr_baseline(
    equations = growth_model$equations,
    external = growth_model$externals,
    initial = growth_model$initial,
    periods = 350,
    method = "Broyden",
    hidden = c("Bbs" = "Bbd"),
    tol = 1e-15,
    max_iter = 350,
    rhtol = TRUE,
    .hidden_tol = 1e-6
  )

  scenario1 <- sfcr_scenario(
    baseline = growth,
    scenario = sfcr_shock(variables = sfcr_set(omega0 ~ -0.1), start = 5, end = 150),
    periods = 350,
    method = "Broyden"
  )

  scenario2 <- sfcr_scenario(
    baseline = growth,
    scenario = sfcr_shock(variables = sfcr_set(GRg ~ 0.035), start = 10, end = 11),
    periods = 350,
    method = "Broyden"
  )

  scenario10 <- sfcr_scenario(
    baseline = growth,
    scenario = sfcr_shock(variables = sfcr_set(NPLk ~ 0.05), start = 10, end = 150),
    periods = 350,
    method = "Broyden"
  )

  bs_growth <- sfcr_matrix(
    columns = c("Households", "Firms", "Govt", "Central Bank", "Banks", "Sum"),
    codes = c("h", "f", "g", "cb", "b", "s"),
    c("Inventories", f = "+IN", s = "+IN"),
    c("Fixed Capital", f = "+K", s = "+K"),
    c("HPM", h = "+Hhd", cb = "-Hs", b = "+Hbd"),
    c("Money", h = "+Mh", b = "-Ms"),
    c("Bills", h = "+Bhd", g = "-Bs", cb = "+Bcbd", b = "+Bbd"),
    c("Bonds", h = "+BLd * Pbl", g = "-BLs * Pbl"),
    c("Loans", h = "-Lhd", f = "-Lfd", b = "+Ls"),
    c("Equities", h = "+Ekd * Pe", f = "-Eks * Pe"),
    c("Bank capital", h = "+OFb", b = "-OFb"),
    c("Balance", h = "-V", f = "-Vf", g = "GD", s = "-(IN + K)")
  )

  tfm_growth <- sfcr_matrix(
    columns = c("Households", "Firms curr.", "Firms cap.", "Govt.", "CB curr.", "CB cap.", "Banks curr.", "Banks cap."),
    code = c("h", "fc", "fk", "g", "cbc", "cbk", "bc", "bk"),
    c("Consumption", h = "-CONS", fc = "+CONS"),
    c("Govt. Exp.", fc = "+G", g = "-G"),
    c("Investment", fc = "+INV", fk = "-INV"),
    c("Inventories", fc = "+(IN - IN[-1])", fk = "-(IN - IN[-1])"),
    c("Taxes", h = "-TX", g = "+TX"),
    c("Wages", h = "+WB", fc = "-WB"),
    c("Inventory financing cost", fc = "-Rl[-1] * IN[-1]", bc = "+Rl[-1] * (IN[-1])"),
    c("Entr. Profits", h = "+FDf", fc = "-Ff", fk = "+FUf", bc = "+Rl[-1] * (Lfs[-1] - IN[-1] - NPL)"),
    c("Banks Profits", h = "+FDb", bc = "-Fb", bk = "+FUb"),
    c("Int. hh loans", h = "-Rl[-1] * Lhd[-1]", bc = "+Rl[-1] * Lhs[-1]"),
    c("Int. deposits", h = "+Rm[-1] * Mh[-1]", bc = "-Rm[-1] * Ms[-1]"),
    c("Int. bills", h = "+Rb[-1] * Bhd[-1]", g = "-Rb[-1] * Bs[-1]", cbc = "+Rb[-1] * Bcbd[-1]", bc = "+Rb[-1] * Bbd[-1]"),
    c("Int. bonds", h = "+BLd[-1]", g = "-BLd[-1]"),
    c("Ch. loans", h = "+(Lhd - Lhd[-1])", fk = "+(Lfd - Lfd[-1])", bk = "-(Ls - Ls[-1])"),
    c("Ch. cash", h = "-(Hhd - Hhd[-1])", cbk = "+(Hs - Hs[-1])", bk = "-(Hbd - Hbd[-1])"),
    c("Ch. deposits", h = "-(Mh - Mh[-1])", bk = "+(Ms - Ms[-1])"),
    c("Ch. bills", h = "-(Bhd - Bhd[-1])", g = "+(Bs - Bs[-1])", cbk = "-(Bcbd - Bcbd[-1])", bk = "-(Bbd - Bbd[-1])"),
    c("Ch. bonds", h = "-(BLd - BLd[-1]) * Pbl", g = "+(BLs - BLs[-1]) * Pbl"),
    c("Ch. equities", h = "-(Ekd - Ekd[-1]) * Pe", fk = "+(Eks - Eks[-1]) * Pe"),
    c("Loan defaults", fk = "+NPL", bk = "-NPL")
  )

  fixture <- list(
    templateId = "gl8-growth",
    sourceVignette = "references/r-sfcr/vignettes/articles/gl8-growth.Rmd",
    checkpoints = list(
      "baseline-run" = list(
        periods = list(
          "5" = period_snapshot(growth, 5, c("Yk", "P", "BLR", "CAR", "GD")),
          "350" = period_snapshot(growth, 350, c("Yk", "PI", "GRk", "BLR", "CAR"))
        )
      ),
      "scenario-1-run" = list(
        periods = list(
          "10" = period_snapshot(scenario1, 10, c("PI", "Rl", "CAR", "BLR")),
          "150" = period_snapshot(scenario1, 150, c("PI", "Rl", "CAR", "BLR"))
        )
      ),
      "scenario-2-run" = list(
        periods = list(
          "10" = period_snapshot(scenario2, 10, c("PI", "Rl", "BLR", "CAR")),
          "25" = period_snapshot(scenario2, 25, c("PI", "Rl", "BLR", "CAR"))
        )
      ),
      "scenario-10-run" = list(
        periods = list(
          "10" = period_snapshot(scenario10, 10, c("CAR", "Rl", "BLR", "PI")),
          "150" = period_snapshot(scenario10, 150, c("CAR", "Rl", "BLR", "PI"))
        )
      )
    ),
    matrixValidation = list(
      balanceSheet = capture.output(sfcr_validate(bs_growth, growth, "bs", rtol = TRUE, tol = 1e-8)),
      transactionFlow = capture.output(sfcr_validate(tfm_growth, growth, "tfm", tol = 1e-7, rtol = TRUE))
    )
  )

  write_fixture("gl8-growth", fixture)
}

generate_bmw_fixture()
generate_gl6_dis_fixture()
generate_gl7_insout_fixture()
generate_gl8_growth_fixture()
