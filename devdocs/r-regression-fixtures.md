# R regression fixtures for notebook templates

Notebook template regressions compare browser/TypeScript solver output against checked-in JSON checkpoints under `packages/web/test/fixtures/r-regressions/`. Most checkpoints come from R reference implementations; scenario semantics follow the TypeScript engine where they differ from R.

## Fixture layout

Each `*.json` file has:

- `templateId` — must match a key in `packages/web/src/notebook/templates.ts`
- `checkpoints` — map of run cell id → period → variable → expected value
- optional `sourceVignette` / `sourceScript` — where baseline numbers were generated
- optional `matrixValidation` — expected `sfcr_validate` messages (r-sfcr templates only)

Regression harness: `packages/web/test/notebookTemplateRegressionHarness.ts`  
Tolerance: `5e-3` per variable.

| Fixture | Template | Generator | Test suite |
|---------|----------|-----------|------------|
| `bmw.json` | `bmw` | `scripts/generate_notebook_r_fixtures.R` | `notebookTemplateRegression.test.ts` |
| `gl2-pc.json` | `gl2-pc` | `scripts/generate_notebook_r_fixtures.R` | `notebookTemplateRegression.test.ts` |
| `gl6-dis.json` | `gl6-dis` | `scripts/generate_notebook_r_fixtures.R` | `notebookTemplateRegression.extended.test.ts` |
| `gl7-insout.json` | `gl7-insout` | `scripts/generate_notebook_r_fixtures.R` | `notebookTemplateRegression.extended.test.ts` |
| `gl8-growth.json` | `gl8-growth` | `scripts/generate_notebook_r_fixtures.R` | `notebookTemplateRegression.extended.test.ts` |
| `eco-3io-pc.json` | `eco-3io-pc` | baseline: `scripts/generate_florence_r_fixture.R`; scenario: TypeScript (see below) | `notebookTemplateRegression.extended.test.ts` |

## Refresh Godley-Lavoie / r-sfcr fixtures

Requires R, `jsonlite`, and the `references/r-sfcr` submodule (`git submodule update --init --recursive`).

From repo root:

```bash
Rscript scripts/generate_notebook_r_fixtures.R
```

This loads `references/r-sfcr` via `pkgload` and writes all five vignette-based fixtures. `gl8-growth` equations are parsed from `references/java/.../GrowthModels.java`.

Validate:

```bash
pnpm web:test:templates
```

Or only the default regression suite:

```bash
pnpm --filter @sfcr/web exec vitest run test/notebookTemplateRegression.test.ts
pnpm --filter @sfcr/web exec vitest run test/notebookTemplateRegression.extended.test.ts
```

## Refresh ECO-3IO-PC (Florence keynote)

Reference code: `references/keynote_speech_Florence/` (cloned from [marcoverpas/keynote_speech_Florence](https://github.com/marcoverpas/keynote_speech_Florence)).

### Baseline checkpoints

Requires R and `jsonlite` only (no r-sfcr package).

```bash
Rscript scripts/generate_florence_r_fixture.R
```

The script sources `references/keynote_speech_Florence/1_ECO-3IO-PC-Model.R`, snapshots baseline scenario 1 at periods 5, 50, and 100, and writes `packages/web/test/fixtures/r-regressions/eco-3io-pc.json`.

**Scenario checkpoints are preserved** on re-run: if `scenario-1-run` already exists in the JSON, the R script keeps it (and `sourceScenarioScript`) unchanged.

After editing the notebook YAML:

```bash
pnpm --filter @sfcr/web compile:notebook-yaml -- --write eco-3io-pc
```

### Scenario checkpoints (`scenario-1-run`)

The Florence R code runs two scenarios in one pass (path continuation). The SFCR notebook uses `runScenario`, which **restarts from the baseline terminal state** and applies shocks from period 1 — same pattern as `gl2-pc`.

Do **not** copy R scenario-2 values into the fixture; they will not match the browser engine.

To refresh scenario checkpoints after changing the notebook or scenario definition:

1. Run the extended regression and note failing `eco-3io-pc:scenario-1-run:…` diffs, or
2. Run a one-off dump from the TypeScript engine (same imports as `notebookTemplateRegressionHarness.ts`): `runBaseline` on `baseline-run`, then `runScenario` with the `scenario-1-run` cell shocks.
3. Update `checkpoints.scenario-1-run` in `eco-3io-pc.json` and keep `sourceScenarioScript` accurate.

## When to regenerate

- Changed equations, externals, solver options, or run periods in a template YAML → re-run the matching generator, then regression tests.
- Changed `references/r-sfcr` or Java growth model source → `generate_notebook_r_fixtures.R`.
- Changed Florence R model → `generate_florence_r_fixture.R` (baseline only unless you also refresh scenario JSON manually).
- Intentional solver/port change that diverges from R → update fixture JSON and document why in the PR.

## Prerequisites

- **R** 4.x with `jsonlite`
- **r-sfcr fixtures**: submodule at `references/r-sfcr`, plus R deps used by that package (`pkgload`, etc.)
- **Florence fixture**: clone under `references/keynote_speech_Florence/` (see `references/README.md`)
