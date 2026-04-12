# sfcr

`sfcr` is now centered on a **browser-first TypeScript implementation** for building and running stock-flow consistent (SFC) models.

The main product surface lives in:

- `packages/web`: browser app
- `packages/core`: solver engine and model runtime
- `packages/core-worker`: browser worker wrapper around the solver

The older implementations remain in the repo as references:

- `R/`: original R package implementation
- `java/`: migration/reference engine used to port behavior into TypeScript

## Current Focus

The primary development path is the browser application and the TypeScript solver.

That means:

- new product work should generally go into `packages/web` or `packages/core`
- root scripts are intended to support the browser app first
- R and Java are still valuable for parity checks and historical reference, but they are no longer the default entry point for the project

## Running The App

From the repo root:

```bash
pnpm dev
```

That starts the browser app in development mode.

You can also run the web app explicitly:

```bash
pnpm web:dev
```

The dev server will print a local URL, typically:

```text
http://localhost:5173
```

## Building

Build the browser-focused project from the repo root:

```bash
pnpm build
```

Or build the web app directly:

```bash
pnpm web:build
```

## Testing And Typechecking

Workspace-level checks:

```bash
pnpm typecheck
pnpm test
```

Core-only tests:

```bash
pnpm --filter @sfcr/core test
```

## Browser App Capabilities

The current browser application supports:

- editable equations, externals, initial values, solver options, and scenario shocks
- worker-backed baseline and scenario execution in the browser
- built-in SIM and BMW presets
- result tables and lightweight SVG charts
- JSON import/export through text and local files
- inline validation for common editor errors

## Project Layout

```text
packages/
  core/         TypeScript solver engine
  core-worker/  Worker protocol and wrapper
  web/          Browser application

R/              Original R package implementation
java/           Reference Java engine used during migration
```

## Role Of The R And Java Code

The R and Java code is still useful, but it is no longer the center of the repo.

Use them for:

- parity checks
- understanding legacy behavior
- migration reference when extending the TypeScript solver

Do not treat them as the default runtime target for new product work unless a task explicitly requires it.
