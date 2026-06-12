#!/usr/bin/env Rscript

library(jsonlite)

output_dir <- "packages/web/test/fixtures/r-regressions"
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

round_value <- function(x) {
  round(unname(as.numeric(x)), digits = 12)
}

period_snapshot <- function(env, scenario, period, scalar_names, vector_names = character()) {
  stats <- setNames(
    lapply(scalar_names, function(name) round_value(env[[name]][scenario, period])),
    scalar_names
  )

  for (name in vector_names) {
    vector <- env[[name]][scenario, period, ]
    for (index in seq_along(vector)) {
      stats[[sprintf("%s%d", name, index)]] <- round_value(vector[[index]])
    }
  }

  stats
}

write_fixture <- function(name, payload) {
  writeLines(
    toJSON(payload, pretty = TRUE, auto_unbox = TRUE, digits = NA),
    file.path(output_dir, sprintf("%s.json", name))
  )
}

model_path <- "references/six_lectures_on_sfc_models/IOPC_model.R"
model_env <- new.env()
suppress_graphics <- function(expr) {
  pdf(file = NULL)
  on.exit(
    {
      while (!is.null(dev.list())) {
        dev.off()
      }
      if (file.exists("Rplots.pdf")) {
        file.remove("Rplots.pdf")
      }
    },
    add = TRUE
  )
  force(expr)
}
suppress_graphics(sys.source(model_path, envir = model_env))

consistency_error <- 0
for (period in 2:(model_env$nPeriods - 1)) {
  consistency_error <- consistency_error + abs(
    model_env$h_s[1, period] - model_env$h_h[1, period]
  )
}
average_consistency_error <- consistency_error / model_env$nPeriods

fixture <- list(
  templateId = "io-pc",
  sourceScript = model_path,
  checkpoints = list(
    "baseline-run" = list(
      periods = list(
        "5" = period_snapshot(
          model_env,
          1,
          5,
          c("y", "yd", "cons", "v", "b_h", "h_h", "p_c"),
          c("x", "p")
        ),
        "50" = period_snapshot(
          model_env,
          1,
          50,
          c("y", "yd", "cons", "v", "b_h", "h_h", "p_c"),
          c("x", "p")
        ),
        "90" = period_snapshot(
          model_env,
          1,
          90,
          c("y", "yd", "cons", "v", "b_h", "h_h", "p_c"),
          c("x", "p")
        )
      )
    )
  ),
  consistencyCheck = list(
    hiddenEquation = "h_s - h_h",
    averageError = round_value(average_consistency_error),
    cumulativeError = round_value(consistency_error)
  )
)

fixture_path <- file.path(output_dir, "io-pc.json")
if (file.exists(fixture_path)) {
  existing <- fromJSON(fixture_path)
  for (scenario_id in c("scenario-1-run", "scenario-2-run")) {
    if (!is.null(existing$checkpoints[[scenario_id]])) {
      fixture$checkpoints[[scenario_id]] <- existing$checkpoints[[scenario_id]]
    }
  }
  if (!is.null(existing$sourceScenarioScript)) {
    fixture$sourceScenarioScript <- existing$sourceScenarioScript
  }
}

write_fixture("io-pc", fixture)
cat(sprintf("Wrote %s\n", fixture_path))
