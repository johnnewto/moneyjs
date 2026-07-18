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

Notebook routes use path-based URLs such as `/notebook/bmw` or the hash fallback `#/notebook`.

## Building

Use Node.js 22 or newer. Wrangler requires Node 22 for the chat API Worker, and the GitHub Pages workflow also builds with Node 22.

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

To enable the in-notebook assistant on GitHub Pages, point the static frontend at the Cloudflare Worker proxy:

```bash
VITE_BASE_PATH=/moneyjs/ VITE_NOTEBOOK_ASSISTANT_API_URL=https://sfcr-chat-api.<account>.workers.dev/v1/notebook-assistant/ask pnpm web:build
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

Web test lanes:

```bash
pnpm web:test:fast
pnpm web:test:integration
```

Use `pnpm web:test:fast` for quick feedback during most `packages/web` work. Use `pnpm web:test:integration` when a change affects notebook source flows, linked cell editors, or notebook navigation/inspection behavior.

Core-only tests:

```bash
pnpm --filter @sfcr/core test
```

## Browser App Capabilities

The current browser application is notebook-first and supports:

- notebook templates such as SIM and BMW, plus imported variants
- linked equation, external, initial-value, solver, matrix, run, chart, and markdown cells
- worker-backed baseline and scenario execution in the browser
- result tables, charts, accounting matrices, and variable inspection
- notebook source editing in JSON, YAML, or Markdown
- notebook share links (`nbz` query parameter, CircuitJS-style `ctz` sharing); see [Notebook share links](#notebook-share-links)
- optional in-notebook assistant when `VITE_NOTEBOOK_ASSISTANT_API_URL` is configured

## Notebook share links

The **Share link** button copies a URL that embeds the current notebook as LZ-compressed JSON in the `nbz` query parameter, for example:

```text
https://johnnewto.github.io/moneyjs/#/notebook?nbz=<compressed>&cell=<optional-cell-id>
```

The `nbz` payload lives in the **hash** so static hosts (GitHub Pages) do not receive a multi-kilobyte query string (which causes HTTP 414 URI Too Long). Legacy `…/notebook?nbz=…` links still load when the server accepts the request.

Opening the link loads the notebook as an imported variant. If a cell is selected when sharing, the optional `cell` parameter deep-links to that section.

**Size limit:** compressed `nbz` payloads are capped at 128,000 characters in the browser. Larger notebooks must use Save or Export instead. The chat-api shorten endpoint accepts share URLs up to the same 128,000-character limit.

**Share link shortening:** when the chat API Worker is configured with the `SHARE_LINKS` KV binding, Share link automatically copies a short `/s/:code` URL (on the Worker host, or `SHORT_LINK_BASE_URL` if set) instead of the long `nbz` URL. Opening the short link `302`s to the MoneyJS share URL. If shortening is unavailable, Share link falls back to the long URL.

Production requires both:

1. `SHARE_LINKS` KV binding on the chat API Worker (see [Chat API](#chat-api))
2. GitHub Pages build var `VITE_NOTEBOOK_ASSISTANT_API_URL` or `VITE_CHAT_BUILDER_API_URL` pointing at the deployed Worker

Local development:

```bash
# terminal 1
cp packages/chat-api/.dev.vars.example packages/chat-api/.dev.vars
pnpm --filter @sfcr/chat-api dev

# terminal 2
pnpm dev
```

On `localhost`, the web app uses `http://localhost:8787` for shortening without extra env vars (the Node adapter uses in-memory KV).

More detail: `packages/chat-api/README.md` (Notebook share shortening section).

## GitHub Pages

This repository is configured to deploy the browser app to:
[https://johnnewto.github.io/moneyjs/](https://johnnewto.github.io/moneyjs/)

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes `packages/web/dist` whenever `main` is updated.

If the repository name changes, update the `VITE_BASE_PATH` value in that workflow so it matches the new Pages path.
Also update `packages/web/public/404.html`; GitHub Pages uses that file to redirect direct notebook deep links such as `/moneyjs/notebook/sim` back into the browser app.

### Chat API

The in-notebook assistant, notebook share shortening (Cloudflare KV `/s/:code`), and offline draft-eval harness use a Cloudflare Worker in `packages/chat-api` so secrets stay out of the browser bundle.

Detailed usage notes are in `packages/chat-api/README.md`.

Local Worker development:

```bash
cp packages/chat-api/.dev.vars.example packages/chat-api/.dev.vars
```

Edit `packages/chat-api/.dev.vars`:

- `OPENAI_API_KEY` — in-notebook assistant
- `BETA_PASSWORD` — optional beta gate

Start the GLIBC-friendly local Node adapter:

```bash
pnpm --filter @sfcr/chat-api dev
```

Deploy the Worker (after creating KV namespaces and pasting IDs into `packages/chat-api/wrangler.toml` — see `packages/chat-api/README.md`):

```bash
pnpm --filter @sfcr/chat-api run deploy
```

Configure Worker secrets (prompted interactively):

```bash
cd packages/chat-api
pnpm dlx wrangler secret put OPENAI_API_KEY
pnpm dlx wrangler secret put BETA_PASSWORD   # optional
```

Point GitHub Pages builds at the Worker (repository variable or workflow env):

```text
VITE_NOTEBOOK_ASSISTANT_API_URL=https://sfcr-chat-api.<account>.workers.dev/v1/notebook-assistant/ask
```

The Worker streams OpenAI Responses API events to the browser, caps each response with `MAX_OUTPUT_TOKENS`, and accepts only allowlisted origins and models. Configure `ALLOWED_ORIGINS`, `MAX_OUTPUT_TOKENS`, and `OPENAI_MODEL_ALLOWLIST` in `packages/chat-api/wrangler.toml` or Cloudflare. `wrangler.toml` also defines a Cloudflare Workers Rate Limiting binding for 10 requests per minute per rate-limit key, plus the `SHARE_LINKS` KV binding used by notebook share shortening.

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
