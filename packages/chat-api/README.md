# SFCR Chat API

Cloudflare Worker proxy for the in-notebook assistant, notebook share shortening (TinyURL), and offline notebook-draft eval harness. It keeps API keys out of the browser and streams model events back to clients.

Endpoints:

- `POST /v1/notebook-assistant/ask`: Q&A and safe edit proposals for the current notebook.
- `POST /v1/notebook-share/shorten`: shorten a MoneyJS `nbz` share URL via TinyURL (requires `TINYURL_API_TOKEN`).
- `POST /v1/chat-builder/draft`: generate a full notebook draft (used by the eval harness and API clients, not a browser route).

## Local Development

Use Node.js 22 or newer.

Create local secrets:

```bash
cp packages/chat-api/.dev.vars.example packages/chat-api/.dev.vars
```

Edit `packages/chat-api/.dev.vars` and set:

- `OPENAI_API_KEY` — in-notebook assistant
- `TINYURL_API_TOKEN` — automatic TinyURL shortening for Share link ([TinyURL developer / API token](https://tinyurl.com/app/dev))
- `BETA_PASSWORD` — optional beta gate

Start the local Node adapter:

```bash
pnpm --filter @sfcr/chat-api dev
```

Expected output:

```text
SFCR chat API local server listening on http://localhost:8787
Draft endpoint: http://localhost:8787/v1/chat-builder/draft
```

Editable local prompts live in `packages/chat-api/prompts/`:

- `chat-builder-system.md`: full notebook draft generation.
- `notebook-assistant-system.md`: notebook Q&A responses and safe patch proposal guidance.

In local Node development these files are read on every request, so prompt edits do not require restarting `pnpm --filter @sfcr/chat-api dev`.

Point the web app at the assistant endpoint:

```bash
VITE_NOTEBOOK_ASSISTANT_API_URL=http://localhost:8787/v1/notebook-assistant/ask pnpm web:dev
```

On localhost, the notebook app also falls back to `http://localhost:8787/v1/notebook-assistant/ask` when no env var is set.

Wrangler local dev is still available on systems with a recent enough GLIBC:

```bash
pnpm --filter @sfcr/chat-api dev:wrangler
```

The Node adapter exists because Wrangler's local `workerd` runtime can fail on older Linux distributions. Production still deploys to Cloudflare Workers.

On `localhost`, the web app calls `http://localhost:8787/v1/notebook-share/shorten` for Share link even when no `VITE_*` env var is set.

## Notebook share shortening

MoneyJS **Share link** builds a long URL with an `nbz` query parameter (LZ-compressed notebook JSON), then calls this Worker to shorten it via TinyURL before copying to the clipboard.

Flow:

1. Browser builds `…/notebook?nbz=…&cell=…` (optional `cell` for deep links).
2. Browser `POST`s `{ "url": "<long share url>" }` to `/v1/notebook-share/shorten`.
3. Worker validates the URL origin (must match `ALLOWED_ORIGINS` / `DISCOVERY_ALLOWED_ORIGINS`) and that it is a notebook share link with `nbz`.
4. Worker calls TinyURL `POST https://api.tinyurl.com/create` with `TINYURL_API_TOKEN`.
5. Browser copies the TinyURL (for example `https://tinyurl.com/…`). If shortening fails, it copies the long URL instead.

**Local:** set `TINYURL_API_TOKEN` in `.dev.vars`, run `pnpm --filter @sfcr/chat-api dev`, then `pnpm dev` in another terminal.

**Production:**

```bash
cd packages/chat-api
pnpm dlx wrangler secret put TINYURL_API_TOKEN
pnpm --filter @sfcr/chat-api run deploy
```

Configure the static frontend to use the same Worker base URL as the assistant:

```text
VITE_NOTEBOOK_ASSISTANT_API_URL=https://sfcr-chat-api.<account>.workers.dev/v1/notebook-assistant/ask
```

`VITE_CHAT_BUILDER_API_URL` also works; the web app derives `/v1/notebook-share/shorten` from either variable.

**Verify after deploy:**

```bash
curl -s -X POST "https://sfcr-chat-api.<account>.workers.dev/v1/notebook-share/shorten" \
  -H "Content-Type: application/json" \
  -H "Origin: https://johnnewto.github.io" \
  -d '{"url":"https://johnnewto.github.io/moneyjs/notebook?nbz=test"}'
```

Expected: `200` with `{ "shortUrl": "https://tinyurl.com/..." }`. `503` with `TINYURL_API_TOKEN is not configured` means the secret is missing.

TinyURL only shortens the long MoneyJS URL; it does not bypass the browser `nbz` size limit for very large notebooks.

## Draft Eval Harness

Offline draft-generation regression uses `pnpm eval:chat-builder` against `POST /v1/chat-builder/draft`:

```bash
pnpm eval:chat-builder -- --fixture sim-basic
pnpm eval:chat-builder:live -- --fixture sim-basic --model gpt-5.4
```

Artifacts are written under `packages/web/eval-runs/chat-builder/`.

## Deploy

```bash
pnpm --filter @sfcr/chat-api run deploy
```

Set the OpenAI key as a Cloudflare Worker secret:

```bash
cd packages/chat-api
pnpm dlx wrangler secret put OPENAI_API_KEY
```

Set a beta password as a Worker secret when you want the public frontend gated:

```bash
pnpm dlx wrangler secret put BETA_PASSWORD
```

Set a TinyURL API token when you want Share link to copy shortened URLs automatically:

```bash
pnpm dlx wrangler secret put TINYURL_API_TOKEN
```

For production, set:

- `OPENAI_API_KEY`: Cloudflare secret.
- `BETA_PASSWORD`: optional Cloudflare secret. When set, browser requests must include the matching beta password.
- `TINYURL_API_TOKEN`: optional Cloudflare secret. When set, `POST /v1/notebook-share/shorten` proxies notebook share URLs to TinyURL.
- `ALLOWED_ORIGINS`: comma-separated allowed browser origins, for example `https://johnnewto.github.io`.
- `DISCOVERY_ALLOWED_ORIGINS`: comma-separated allowed origins for public discovery bundles. Defaults to `ALLOWED_ORIGINS` when unset.
- `MAX_OUTPUT_TOKENS`: output token cap for each OpenAI response. Defaults to `8000`.
- `OPENAI_MODEL_ALLOWLIST`: comma-separated model ids accepted by the proxy, for example `gpt-5.4-mini,gpt-5.4,gpt-4.1,gpt-5.5,o3`.
- `CHAT_BUILDER_RATE_LIMITER`: Cloudflare Workers Rate Limiting binding configured in `wrangler.toml` as 10 requests per minute per rate-limit key.

Configure GitHub Pages builds with:

```text
VITE_NOTEBOOK_ASSISTANT_API_URL=https://sfcr-chat-api.<account>.workers.dev/v1/notebook-assistant/ask
```

The Worker only fetches notebook discovery bundles from trusted origins. Discovery resources are capped at 250 KB each, example loading is capped at five unique examples, and the assembled discovery bundle is capped at 1 MB. Public discovery resources are cached for 10 minutes when Cloudflare's default cache is available.

## Validation

```bash
pnpm --filter @sfcr/chat-api typecheck
pnpm --filter @sfcr/chat-api test
```
