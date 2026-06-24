#!/usr/bin/env Rscript

# Generate the R regression fixture and YAML data fragments for the Italy SFC
# empirical notebook template.
#
# Source model: references/Italy-SFC-Model/1_Model_upload (marcoverpas/Italy-SFC-Model),
# an empirical bimets stock-flow consistent model for Italy (Canelli, Fontana,
# Realfonzo & Veronese Passarella 2021/2022/2024).
#
# The SFCR notebook engine performs a pure DYNAMIC forward solve and cannot
# estimate coefficients. We therefore mirror the repo's in-sample baseline:
# estimate the behavioural coefficients in R, then run a DYNAMIC simulation over
# 1998-2021 in which every behavioural variable is exogenised to its observed
# series. Only the accounting identities stay endogenous - exactly the variables
# the SFCR notebook keeps as equations. This makes the R simulation reproducible
# by the SFCR forward solver.
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

# Firms' "other payments" opf is an accounting residual that feeds back into the
# firms' profit block (ff -> opf -> fdf -> ff), which is singular once fuf is
# exogenised. The repo's in-sample script (4_In_sample_pred) exogenises opf for
# the same reason, so we treat it as an observed exogenous series here too. This
# keeps the SFCR equation system an acyclic DAG of identities.
extra_exo <- c("opf")
exo_vars <- sort(unique(c(behaviourals, extra_exo)))
endo_identities <- setdiff(identities, exo_vars)

# ---- DYNAMIC simulation with behaviourals (+ opf) exogenised to observed data ----
exo <- stats::setNames(as.list(rep(TRUE, length(exo_vars))), exo_vars)

message("Running DYNAMIC simulation 1998-2021 (behaviourals exogenised) ...")
S_model <- SIMULATE(
  S_model,
  simType = "DYNAMIC",
  TSRANGE = c(1998, 1, 2021, 1),
  simConvergence = 1e-11,
  simIterLimit = 5000,
  Exogenize = exo,
  quietly = TRUE
)

sim <- S_model$simulation

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
    x <- year_value(sim[[v]], yr)
    if (is.finite(x)) vals[[v]] <- x
  }
  periods[[key]] <- vals
}

fixture <- list(
  templateId = "italy-sfc",
  sourceScript = "references/Italy-SFC-Model/1_Model_upload (+ scripts/generate_italy_sfc_r_fixture.R)",
  note = "Baseline = DYNAMIC in-sample simulation with all behaviourals exogenised to observed Eurostat series; only identities are endogenous. Period index 0 = 1997 initial values, index i = year 1997 + i.",
  checkpoints = list("baseline-run" = list(periods = periods))
)

dir.create(dirname(fixture_path), recursive = TRUE, showWarnings = FALSE)
writeLines(toJSON(fixture, auto_unbox = TRUE, pretty = TRUE, digits = 12), fixture_path)
message(sprintf("Wrote fixture: %s", fixture_path))

# ---- Emit YAML fragments: externals (behavioural series), initial values, coefficients ----
# SFCR years: 1997..2021 inclusive (25 periods, index 0..24).
sfcr_years <- 1997:2021

obs_series <- function(name) {
  ts <- S_model$modelData[[name]]
  sapply(sfcr_years, function(y) year_value(ts, y))
}

fmt_num <- function(x) {
  ifelse(is.finite(x), formatC(x, format = "g", digits = 10), "0")
}

dir.create(fragments_dir, recursive = TRUE, showWarnings = FALSE)
con <- file(fragments_path, "w")
writeLines("# ===== EXTERNALS (behavioural variables + opf exogenised to observed series) =====", con)
writeLines("# Each row: { name, kind: series, valueText: \"1997..2021\", desc }", con)
for (b in exo_vars) {
  vals <- obs_series(b)
  writeLines(sprintf('      - { name: %s, kind: series, valueText: "%s" }',
                     b, paste(fmt_num(vals), collapse = ", ")), con)
}

writeLines("", con)
writeLines("# ===== INITIAL VALUES (endogenous identities at 1997, index 0) =====", con)
for (i in sort(endo_identities)) {
  v1997 <- year_value(S_model$modelData[[i]], 1997)
  if (!is.finite(v1997)) v1997 <- year_value(sim[[i]], 1998) # fallback
  writeLines(sprintf('      - [%s, %s]', i, fmt_num(v1997)), con)
}

writeLines("", con)
writeLines("# ===== ESTIMATED COEFFICIENTS (OLS in R, 1998-2019) - for display =====", con)
for (b in behaviourals) {
  co <- S_model$behaviorals[[b]]$coefficients
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
  s <- year_value(sim[[v]], 2021)
  o <- year_value(S_model$modelData[[v]], 2021)
  message(sprintf("  %-6s sim=%14.2f obs=%14.2f rel.diff=%.2e", v, s, o, abs(s - o) / max(abs(o), 1)))
}
hs <- sapply(1998:2021, function(y) year_value(sim[["hs"]], y))
hd <- sapply(1998:2021, function(y) year_value(sim[["hd"]], y))
message(sprintf("Max |hs - hd| over 1998-2021: %.3e", max(abs(hs - hd), na.rm = TRUE)))
