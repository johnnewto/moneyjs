# Chat Builder Serverless Development

The chat builder is a static GitHub Pages frontend plus a small serverless API in `packages/chat-api`.

The frontend must never store or send an OpenAI API key. Browser code sends chat-builder requests to the serverless API, and the API adds the OpenAI key from its environment.

## Local Development

Use Node.js 22 or newer:

```bash
fnm use
node -v
```

Create local API environment variables:

```bash
cp packages/chat-api/.dev.vars.example packages/chat-api/.dev.vars
```

Edit `packages/chat-api/.dev.vars`:

```text
OPENAI_API_KEY=sk-your-key
ALLOWED_ORIGINS=http://localhost:5173,https://johnnewto.github.io
BETA_PASSWORD=
MAX_OUTPUT_TOKENS=8000
OPENAI_MODEL_ALLOWLIST=gpt-5.5,gpt-4.1,o3
```

Set `BETA_PASSWORD` to require the browser user to enter a beta password before the Worker will call OpenAI. Leave it blank to disable the beta gate.

Start the local chat API:

```bash
pnpm chat-api:dev
```

Expected output:

```text
SFCR chat API local server listening on http://localhost:8787
Draft endpoint: http://localhost:8787/v1/chat-builder/draft
```

The chat-builder system prompt lives at:

```text
packages/chat-api/prompts/chat-builder-system.md
```

The local Node adapter reads this file on every request, so you can edit prompt wording and immediately retry from the browser without restarting `pnpm chat-api:dev`.

Start the web app in another terminal:

```bash
fnm use
pnpm web:dev
```

Open:

```text
http://localhost:5173/#/chat-builder
```

For localhost, the web app automatically falls back to:

```text
http://localhost:8787/v1/chat-builder/draft
```

You can override it explicitly:

```bash
VITE_CHAT_BUILDER_API_URL=http://localhost:8787/v1/chat-builder/draft pnpm web:dev
```

## Why Local Dev Does Not Use Wrangler By Default

`pnpm chat-api:dev` runs `packages/chat-api/scripts/dev-node.mjs`, a small Node adapter around the Worker handler.

This avoids local `workerd` compatibility problems on older Linux distributions. For example, Wrangler `4.87.0` may download a `workerd` binary that requires GLIBC `2.32` or newer, while Ubuntu systems with GLIBC `2.31` fail before the Worker starts.

The Node adapter is only for local development. The deployed runtime is still Cloudflare Workers. Production uses the bundled fallback prompt from `packages/chat-api/src/chatBuilderSystemPrompt.ts`, so production prompt changes require a Worker deploy unless a dynamic prompt store is added later.

If your system supports Wrangler local dev, use:

```bash
pnpm chat-api:dev:wrangler
```

## API Contract

Endpoint:

```text
POST /v1/chat-builder/draft
```

Request body from the browser:

```json
{
  "discoveryUrl": "http://localhost:5173/.well-known/sfcr.json",
  "model": "gpt-5.5",
  "messages": [
    {
      "role": "assistant",
      "text": "Describe the SFC model you want to build..."
    }
  ],
  "prompt": "Build a small SFC model..."
}
```

The API validates:

- request method and path
- CORS origin
- beta password, when `BETA_PASSWORD` is configured
- Cloudflare Worker rate limit binding, when deployed with `CHAT_BUILDER_RATE_LIMITER`
- allowed model id
- prompt length
- message count and message length
- discovery URL format
- presence of `OPENAI_API_KEY`

The API then loads the SFCR discovery bundle server-side and calls:

```text
https://api.openai.com/v1/responses
```

with:

```json
{
  "max_output_tokens": 8000,
  "store": false,
  "stream": true
}
```

The API streams OpenAI Server-Sent Events back to the browser. The frontend reads `response.output_text.delta` events, accumulates the text, parses the final JSON as a full `NotebookDocument`, extracts the primary model sections for validation, and preserves the complete notebook JSON for preview. Balance-sheet matrices, transactions-flow matrices, sequence cells, charts, tables, and scenarios should therefore be returned as native notebook `cells`, not as a separate draft-only shape.

## Production Deployment

Set the Cloudflare Worker secret:

```bash
cd packages/chat-api
pnpm dlx wrangler secret put OPENAI_API_KEY
```

Set the beta password secret when you want the public frontend gated:

```bash
pnpm dlx wrangler secret put BETA_PASSWORD
```

Deploy:

```bash
cd /home/john/repos/sfcr
pnpm chat-api:deploy
```

Configure production variables in Cloudflare or `packages/chat-api/wrangler.toml`:

```text
ALLOWED_ORIGINS=https://johnnewto.github.io
MAX_OUTPUT_TOKENS=8000
OPENAI_MODEL_ALLOWLIST=gpt-5.5,gpt-4.1,o3
```

`packages/chat-api/wrangler.toml` also configures `CHAT_BUILDER_RATE_LIMITER` with Cloudflare's Workers Rate Limiting binding. The current setting is 10 accepted draft requests per minute per rate-limit key. Cloudflare documents that this binding is backed by the same infrastructure as rate limiting rules, applies per Cloudflare location, and is intentionally permissive rather than an exact accounting counter.

Configure GitHub Actions repository variable:

```text
VITE_CHAT_BUILDER_API_URL=https://sfcr-chat-api.<account>.workers.dev/v1/chat-builder/draft
```

The Pages workflow passes that variable into the Vite build.

## Validation

Useful checks:

```bash
pnpm --filter @sfcr/chat-api typecheck
pnpm --filter @sfcr/web typecheck
pnpm --filter @sfcr/web test -- App.test.tsx
pnpm build
```

## Troubleshooting

If `pnpm chat-api:dev` says `OPENAI_API_KEY is not set`, create or edit:

```text
packages/chat-api/.dev.vars
```

If the browser says the endpoint is not configured, set:

```bash
VITE_CHAT_BUILDER_API_URL=http://localhost:8787/v1/chat-builder/draft pnpm web:dev
```

If Wrangler local dev fails with GLIBC errors, use:

```bash
pnpm chat-api:dev
```

instead of:

```bash
pnpm chat-api:dev:wrangler
```
