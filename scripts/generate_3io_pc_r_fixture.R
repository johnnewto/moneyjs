#!/usr/bin/env Rscript

library(jsonlite)

output_dir <- "packages/web/test/fixtures/r-regressions"
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

round_value <- function(x) {
  round(unname(as.numeric(x)), digits = 12)
}

scenario_snapshot <- function(env, scenario, period, scalar_names, vector_names = character()) {
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

model_path <- "references/keynote_speech_Florence/0_3IO-PC-Model.R"
model_env <- new.env()
suppress_graphics <- function(expr) {
  pdf(file = NULL)
  on.exit({
    while (!is.null(dev.list())) {
      dev.off()
    }
    if (file.exists("Rplots.pdf")) {
      file.remove("Rplots.pdf")
    }
  }, add = TRUE)
  force(expr)
}
suppress_graphics(sys.source(model_path, envir = model_env))

consistency_error <- 0
for (scenario in 1:model_env$nScenarios) {
  for (period in 2:(model_env$nPeriods - 1)) {
    consistency_error <- consistency_error + abs(
      model_env$h_s[scenario, period] - model_env$h_h[scenario, period]
    )
  }
}
average_consistency_error <- consistency_error / (model_env$nPeriods * model_env$nScenarios)

fixture <- list(
  templateId = "3io-pc",
  sourceScript = model_path,
  checkpoints = list(
    "baseline-run" = list(
      periods = list(
        "5" = scenario_snapshot(
          model_env,
          1,
          5,
          c("y", "yd", "cons", "v", "b_h", "h_h", "p_c", "p_g"),
          c("x", "p", "d")
        ),
        "50" = scenario_snapshot(
          model_env,
          1,
          50,
          c("y", "yd", "cons", "v", "b_h", "h_h", "p_c", "p_g"),
          c("x", "p", "d")
        ),
        "100" = scenario_snapshot(
          model_env,
          1,
          100,
          c("y", "yd", "cons", "v", "b_h", "h_h", "p_c", "p_g"),
          c("x", "p", "d")
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

fixture_path <- file.path(output_dir, "3io-pc.json")
if (file.exists(fixture_path)) {
  existing <- fromJSON(fixture_path)
  if (!is.null(existing$checkpoints[["scenario-1-run"]])) {
    fixture$checkpoints[["scenario-1-run"]] <- existing$checkpoints[["scenario-1-run"]]
    fixture$sourceScenarioScript <- existing$sourceScenarioScript
  }
}

write_fixture("3io-pc", fixture)
cat(sprintf("Wrote %s\n", fixture_path))
