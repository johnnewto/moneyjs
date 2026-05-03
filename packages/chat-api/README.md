# SFCR Chat API

Cloudflare Worker proxy for the browser chat builder. It keeps the OpenAI API key out of the GitHub Pages frontend and streams model events back to the browser.

Detailed usage notes are in `../../devdocs/chat-builder-serverless.md`.

## Local Development

Create local secrets:

```bash
cp packages/chat-api/.dev.vars.example packages/chat-api/.dev.vars
```

Then edit `packages/chat-api/.dev.vars` and set `OPENAI_API_KEY`. To enable the browser beta gate locally, also set `BETA_PASSWORD`.

Start the local Node adapter:

```bash
pnpm chat-api:dev
```

The chat-builder system prompt is in `packages/chat-api/prompts/chat-builder-system.md`. In local Node development it is read on every request, so prompt edits do not require restarting `pnpm chat-api:dev`.

Point the web app at the Worker:

```bash
VITE_CHAT_BUILDER_API_URL=http://localhost:8787/v1/chat-builder/draft pnpm web:dev
```

The default local web app also falls back to `http://localhost:8787/v1/chat-builder/draft`.

Wrangler local dev is still available on systems with a recent enough GLIBC:

```bash
pnpm chat-api:dev:wrangler
```

## Deploy

```bash
pnpm chat-api:deploy
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

For production, set:

- `OPENAI_API_KEY`: Cloudflare secret.
- `BETA_PASSWORD`: optional Cloudflare secret. When set, browser requests must include the matching beta password.
- `ALLOWED_ORIGINS`: comma-separated allowed browser origins, for example `https://johnnewto.github.io`.
- `MAX_OUTPUT_TOKENS`: output token cap for each OpenAI response. Defaults to `8000`.
- `OPENAI_MODEL_ALLOWLIST`: comma-separated model ids accepted by the proxy.
- `CHAT_BUILDER_RATE_LIMITER`: Cloudflare Workers Rate Limiting binding configured in `wrangler.toml` as 10 requests per minute per rate-limit key.
