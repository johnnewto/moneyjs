#!/usr/bin/env Rscript

# Generate the R regression fixture and YAML data fragments for the Italy SFC
# empirical notebook template.
#
# Source model: references/Italy-SFC-Model/1_Model_upload (marcoverpas/Italy-SFC-Model),
# an empirical bimets stock-flow consistent model for Italy (Canelli, Fontana,
# Realfonzo & Veronese Passarella 2021/2022/2024).
#
# The SFCR notebook engine cannot estimate coefficients. We therefore estimate
# the behavioural coefficients in R, bake them into notebook equations, and emit
# the STATIC in-sample baseline used by 4_In_sample_pred (type_pred = 0).
#
# Outputs:
#   packages/web/test/fixtures/r-regressions/italy-sfc.json  (regression checkpoints)
#   scripts/generated/italy_sfc_yaml_fragments.txt           (externals / initial-values / coeffs)
#
# Prerequisites: R 4.x with `bimets` and `jsonlite`. If `bimets` is installed in
# a non-default library, set R_LIBS_USER before running.

# Run from the repository root (consistent with the other fixture generators).
repo_root <- normalizePath(getwd(), mustWork = FALSE)
if (!dir.exists(file.path(repo_root, "packages"))) {
  stop("Run this script from the repository root (could not find ./packages).")
}

# Allow a repo-local R library (handy when the default library is not writable).
local_lib <- file.path(repo_root, ".rlib")
if (dir.exists(local_lib)) {
  .libPaths(c(local_lib, .libPaths()))
}

suppressWarnings(suppressMessages({
  library(bimets)
  library(jsonlite)
}))

model_file <- file.path(repo_root, "references", "Italy-SFC-Model", "1_Model_upload")
data_file <- file.path(repo_root, "references", "Italy-SFC-Model", "Data_Aalborg.csv")
fixture_path <- file.path(repo_root, "packages", "web", "test", "fixtures", "r-regressions", "italy-sfc.json")
fragments_dir <- file.path(repo_root, "scripts", "generated")
fragments_path <- file.path(fragments_dir, "italy_sfc_yaml_fragments.txt")

stopifnot(file.exists(model_file))

# ---- Build + estimate the model by sourcing a preprocessed copy of 1_Model_upload ----
raw <- readLines(model_file, warn = FALSE)
raw <- raw[!grepl("^\\s*rm\\(list", raw)]
raw <- raw[!grepl("dev\\.off", raw)]
raw <- raw[!grepl('cat\\("\\\\014"\\)', raw)]
raw <- raw[!grepl("^\\s*library\\(knitr\\)", raw)]
# Read the dataset locally instead of from Dropbox.
raw <- gsub('^\\s*DataEE <- read\\.csv\\(.*$',
            sprintf('DataEE <- read.csv("%s")', data_file),
            raw)

tmp <- tempfile(fileext = ".R")
writeLines(raw, tmp)
message("Sourcing preprocessed model definition ...")
source(tmp, local = TRUE)
stopifnot(exists("S_model"))

behaviourals <- names(S_model$behaviorals)
identities <- names(S_model$identities)
message(sprintf("Model loaded: %d behaviourals, %d identities", length(behaviourals), length(identities)))

# Minimal exogenize list from references/Italy-SFC-Model/4_In_sample_pred when
# type_pred = 0. The remaining behaviourals become live notebook equations.
static_exo_vars <- c(
  "oph", "opf", "opb", "opcb", "oacb", "oaf", "oab", "oag", "oah",
  "rstar", "Lp_row", "Lp_en"
)
live_behaviourals <- setdiff(behaviourals, static_exo_vars)
endogenous_vars <- sort(unique(c(identities, live_behaviourals)))
endogenous_vars <- setdiff(endogenous_vars, static_exo_vars)

# Keep the old all-exogenized DYNAMIC run available as a diagnostic sidecar.
dynamic_exo_vars <- sort(unique(c(behaviourals, "opf")))

estimated_model <- S_model

# ---- STATIC simulation matching 4_In_sample_pred type_pred = 0 ----
static_exo <- stats::setNames(as.list(rep(TRUE, length(static_exo_vars))), static_exo_vars)

message("Running STATIC simulation 1998-2021 (minimal exogenize list) ...")
S_model_static <- SIMULATE(
  estimated_model,
  simType = "STATIC",
  TSRANGE = c(1998, 1, 2021, 1),
  simConvergence = 1e-8,
  simIterLimit = 1000,
  Exogenize = static_exo,
  quietly = TRUE
)

# ---- DYNAMIC identity-only diagnostic with behaviourals (+ opf) exogenised ----
dynamic_exo <- stats::setNames(as.list(rep(TRUE, length(dynamic_exo_vars))), dynamic_exo_vars)

message("Running DYNAMIC simulation 1998-2021 (behaviourals exogenised diagnostic) ...")
S_model_dynamic <- SIMULATE(
  estimated_model,
  simType = "DYNAMIC",
  TSRANGE = c(1998, 1, 2021, 1),
  simConvergence = 1e-11,
  simIterLimit = 5000,
  Exogenize = dynamic_exo,
  quietly = TRUE
)

sim_static <- S_model_static$simulation
sim_dynamic <- S_model_dynamic$simulation

year_value <- function(ts, year) {
  if (is.null(ts)) return(NA_real_)
  v <- tryCatch(as.numeric(window(ts, start = c(year, 1), end = c(year, 1))), error = function(e) NA_real_)
  if (length(v) == 0) NA_real_ else v[1]
}

# Variables checked by the regression harness (core flows, stocks, prices, rates).
check_vars <- c(
  "y", "gy", "cons", "consR", "id", "idR", "gov", "nx", "x", "im",
  "yd", "vh", "wb", "nd", "ff", "fdf", "lf", "lh", "ls",
  "mh", "ms", "hh", "hbd", "bh", "bb", "bcb", "bs", "deb", "def",
  "eh", "es", "vf", "vg", "vb", "vcb", "vrow", "brow",
  "p", "pc", "rb", "rl", "intg", "inth", "intf",
  "deb_ratio", "def_ratio", "Omega", "un"
)
check_vars <- check_vars[check_vars %in% c(behaviourals, identities)]

# SFCR period index: index 0 = 1997 (initial values), index i = year 1997 + i.
# The harness reads result.series[var][Number(periodText) - 1], so for year Y the
# fixture key is (Y - 1997) + 1 = Y - 1996.
check_years <- c(1999, 2008, 2021)
periods <- list()
for (yr in check_years) {
  key <- as.character(yr - 1996)
  vals <- list()
  for (v in check_vars) {
    x <- year_value(sim_static[[v]], yr)
    if (is.finite(x)) vals[[v]] <- x
  }
  periods[[key]] <- vals
}

fixture <- list(
  templateId = "italy-sfc",
  sourceScript = "references/Italy-SFC-Model/1_Model_upload (+ scripts/generate_italy_sfc_r_fixture.R)",
  note = "Baseline = STATIC in-sample simulation matching 4_In_sample_pred type_pred=0. Lags read from observed modelData, while only the minimal 12-variable exogenize list remains external. Period index 0 = 1997 initial values, index i = year 1997 + i.",
  checkpoints = list(
    "baseline-run" = list(periods = periods)
  )
)

dir.create(dirname(fixture_path), recursive = TRUE, showWarnings = FALSE)
writeLines(toJSON(fixture, auto_unbox = TRUE, pretty = TRUE, digits = 12), fixture_path)
message(sprintf("Wrote fixture: %s", fixture_path))

# ---- Emit YAML fragments: externals (behavioural series), initial values, coefficients ----
# SFCR years: 1997..2021 inclusive (25 periods, index 0..24).
sfcr_years <- 1997:2021

obs_series <- function(name) {
  ts <- estimated_model$modelData[[name]]
  sapply(sfcr_years, function(y) year_value(ts, y))
}

fmt_num <- function(x) {
  ifelse(is.finite(x), formatC(x, format = "g", digits = 10), "0")
}

dir.create(fragments_dir, recursive = TRUE, showWarnings = FALSE)
con <- file(fragments_path, "w")
writeLines("# ===== EXTERNALS (behavioural variables + opf exogenised to observed series) =====", con)
writeLines("# Minimal STATIC exogenous variables from 4_In_sample_pred type_pred=0.", con)
for (b in static_exo_vars) {
  vals <- obs_series(b)
  writeLines(sprintf('      - { name: %s, kind: series, observed: true, valueText: "%s" }',
                     b, paste(fmt_num(vals), collapse = ", ")), con)
}

writeLines("", con)
writeLines("# ===== OBSERVED HISTORY (all modelData series, 1997..2021) =====", con)
writeLines("# Rows whose names also have equations seed STATIC lags; equations overwrite the simulated current path.", con)
for (b in sort(setdiff(names(estimated_model$modelData), static_exo_vars))) {
  vals <- obs_series(b)
  if (all(!is.finite(vals))) next
  writeLines(sprintf('      - { name: %s, kind: series, observed: true, valueText: "%s" }',
                     b, paste(fmt_num(vals), collapse = ", ")), con)
}

writeLines("", con)
writeLines("# ===== OBSERVED OVERLAY SERIES (suffixed _obs, no equation) =====", con)
writeLines("# Plain externals carrying observed paths so charts can overlay observed vs simulated (Fig. 1).", con)
overlay_vars <- c("y", "cons", "id", "gov", "nx", "im", "x", "nd", "rb", "p", "un", "deb")
for (b in overlay_vars) {
  vals <- obs_series(b)
  if (all(!is.finite(vals))) next
  writeLines(sprintf('      - { name: %s_obs, kind: series, valueText: "%s" }',
                     b, paste(fmt_num(vals), collapse = ", ")), con)
}

writeLines("", con)
writeLines("# ===== LIVE BEHAVIOURAL EQUATIONS (coefficients baked in) =====", con)

escape_regex <- function(x) gsub("([][{}()+*^$|\\\\.?])", "\\\\\\1", x)
substitute_coefficients <- function(eq, co) {
  if (is.null(co)) return(eq)
  cn <- rownames(co)
  cv <- as.numeric(co)
  order <- order(nchar(cn), decreasing = TRUE)
  out <- eq
  for (idx in order) {
    name <- cn[idx]
    value <- fmt_num(cv[idx])
    pattern <- sprintf("(?<![A-Za-z0-9_.])%s(?![A-Za-z0-9_.])", escape_regex(name))
    out <- gsub(pattern, value, out, perl = TRUE)
  }
  out
}

for (b in live_behaviourals) {
  eq <- substitute_coefficients(estimated_model$behaviorals[[b]]$eq, estimated_model$behaviorals[[b]]$coefficients)
  pieces <- strsplit(eq, "=", fixed = TRUE)[[1]]
  lhs <- trimws(pieces[1])
  rhs <- trimws(paste(pieces[-1], collapse = "="))
  rhs <- gsub('"', '\\"', rhs, fixed = TRUE)
  lhs <- gsub('"', '\\"', lhs, fixed = TRUE)
  writeLines(sprintf('      - { name: "%s", expression: "%s", desc: "Estimated behavioural: %s" }',
                     lhs, rhs, b), con)
}

writeLines("", con)
writeLines("# ===== INITIAL VALUES (endogenous variables at 1997, index 0) =====", con)
for (i in endogenous_vars) {
  v1997 <- year_value(estimated_model$modelData[[i]], 1997)
  if (!is.finite(v1997)) v1997 <- year_value(sim_static[[i]], 1998) # fallback
  writeLines(sprintf('      - [%s, %s]', i, fmt_num(v1997)), con)
}

writeLines("", con)
writeLines("# ===== ESTIMATED COEFFICIENTS (OLS in R, 1998-2019) - for display =====", con)
for (b in behaviourals) {
  co <- estimated_model$behaviorals[[b]]$coefficients
  if (is.null(co)) next
  cv <- as.numeric(co)
  cn <- rownames(co)
  if (is.null(cn)) cn <- names(co)
  pieces <- paste(cn, fmt_num(cv), sep = "=")
  writeLines(sprintf("# %-10s : %s", b, paste(pieces, collapse = ", ")), con)
}
close(con)
message(sprintf("Wrote YAML fragments: %s", fragments_path))

# ---- Consistency diagnostics: simulated vs observed, and Hs - Hd ----
report_vars <- c("y", "cons", "deb", "vh", "bs")
message("\nSimulated vs observed (2021):")
for (v in report_vars) {
  s <- year_value(sim_static[[v]], 2021)
  o <- year_value(estimated_model$modelData[[v]], 2021)
  message(sprintf("  %-6s sim=%14.2f obs=%14.2f rel.diff=%.2e", v, s, o, abs(s - o) / max(abs(o), 1)))
}
hs <- sapply(1998:2021, function(y) year_value(sim_static[["hs"]], y))
hd <- sapply(1998:2021, function(y) year_value(sim_static[["hd"]], y))
message(sprintf("Max |hs - hd| over 1998-2021: %.3e", max(abs(hs - hd), na.rm = TRUE)))
