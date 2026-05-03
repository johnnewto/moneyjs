# sfcr

`sfcr` is now centered on a **browser-first TypeScript implementation** for building and running stock-flow consistent (SFC) models.

Live app: [https://johnnewto.github.io/moneyjs/](https://johnnewto.github.io/moneyjs/)

The main product surface lives in:

- `packages/web`: browser app
- `packages/core`: solver engine and model runtime
- `packages/core-worker`: browser worker wrapper around the solver

The older implementations remain in the repo as references:

- `references/java/`: migration/reference engine used to port behavior into TypeScript
- `references/r-sfcr/`: pinned checkout of the upstream R implementation for parity/reference work

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

For a local preview of the current production build at the root path:

```bash
pnpm web:build
pnpm web:preview
```

For a GitHub Pages-style preview with the `/moneyjs/` base path:

```bash
pnpm web:preview:pages
```

That preview runs on:

```text
http://localhost:4173/moneyjs/
```

The dev server will print a local URL, typically:

```text
http://localhost:5173
```

The chat builder can also be opened directly at the Pages-style local route:

```text
http://localhost:5173/moneyjs/#/chat-builder
```

## Building

Use Node.js 22 or newer. Wrangler requires Node 22 for the chat-builder Worker, and the GitHub Pages workflow also builds with Node 22.

With `fnm`:

```bash
fnm install
fnm use
corepack enable
```

With `nvm`, the same repo version file also works:

```bash
nvm install
nvm use
corepack enable
```

Build the browser-focused project from the repo root:

```bash
pnpm build
```

Or build the web app directly:

```bash
pnpm web:build
```

For a GitHub Pages deployment, build the app with the repository base path:

```bash
VITE_BASE_PATH=/moneyjs/ pnpm web:build
```

To enable the chat builder on GitHub Pages, point the static frontend at the Cloudflare Worker proxy:

```bash
VITE_BASE_PATH=/moneyjs/ VITE_CHAT_BUILDER_API_URL=https://sfcr-chat-api.<account>.workers.dev/v1/chat-builder/draft pnpm web:build
```

Equivalent root script:

```bash
pnpm web:build:pages
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

## GitHub Pages

This repository is configured to deploy the browser app to:
[https://johnnewto.github.io/moneyjs/](https://johnnewto.github.io/moneyjs/)

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes `packages/web/dist` whenever `main` is updated.

If the repository name changes, update the `VITE_BASE_PATH` value in that workflow so it matches the new Pages path.

### Chat Builder API

The chat builder uses a Cloudflare Worker in `packages/chat-api` so the OpenAI API key is never stored in or sent from the browser.

Detailed usage notes are in `devdocs/chat-builder-serverless.md`.

Local Worker development:

```bash
cp packages/chat-api/.dev.vars.example packages/chat-api/.dev.vars
```

Edit `packages/chat-api/.dev.vars` and set `OPENAI_API_KEY`. Set `BETA_PASSWORD` when you want the browser beta gate enabled locally, then start the GLIBC-friendly local Node adapter:

```bash
pnpm chat-api:dev
```

Deploy the Worker:

```bash
pnpm chat-api:deploy
```

Configure the Worker secret before using it:

```bash
cd packages/chat-api
pnpm dlx wrangler secret put OPENAI_API_KEY
```

Optional beta gate:

```bash
pnpm dlx wrangler secret put BETA_PASSWORD
```

The Worker streams OpenAI Responses API events to the browser, caps each response with `MAX_OUTPUT_TOKENS`, and accepts only allowlisted origins and models. Configure `ALLOWED_ORIGINS`, `MAX_OUTPUT_TOKENS`, and `OPENAI_MODEL_ALLOWLIST` in `packages/chat-api/wrangler.toml` or Cloudflare. `wrangler.toml` also defines a Cloudflare Workers Rate Limiting binding for 10 draft requests per minute per rate-limit key.

### AI Discovery Endpoints

The browser app publishes AI-facing notebook authoring resources for browser-based tools such as ChatGPT or Claude.

Canonical GitHub Pages URLs:

- `https://johnnewto.github.io/moneyjs/.well-known/sfcr.json`
- `https://johnnewto.github.io/moneyjs/ai/index.html`
- `https://johnnewto.github.io/moneyjs/.well-known/sfcr-notebook-guide.json`
- `https://johnnewto.github.io/moneyjs/notebook-guide.md`
- `https://johnnewto.github.io/moneyjs/sfcr-notebook.schema.json`
- `https://johnnewto.github.io/moneyjs/ai-prompts/create-sfcr-notebook.md`

Example notebook references:

- `https://johnnewto.github.io/moneyjs/notebook-examples/bmw.notebook.json`
- `https://johnnewto.github.io/moneyjs/notebook-examples/gl6-dis-rentier.notebook.v2.json`

Local development equivalents:

- `http://localhost:5173/.well-known/sfcr.json`
- `http://localhost:5173/ai/index.html`

Recommended discovery flow for AI clients:

1. Fetch `/.well-known/sfcr.json` first.
2. Follow that index to the notebook manifest, guide, schema, prompt, and examples.
3. Validate generated notebook JSON against the published schema before returning it.

## Project Layout

```text
packages/
  core/         TypeScript solver engine
  core-worker/  Worker protocol and wrapper
  web/          Browser application

references/
  java/         Reference Java engine used during migration
  r-sfcr/       Upstream R reference repo (git submodule)
```

## Role Of The Reference Code

The reference code is still useful, but it is no longer the center of the repo.

Use them for:

- parity checks
- understanding legacy behavior
- migration reference when extending the TypeScript solver

If cloning fresh, initialize the external R reference with:

```bash
git submodule update --init --recursive
```

Do not treat them as the default runtime target for new product work unless a task explicitly requires it.
