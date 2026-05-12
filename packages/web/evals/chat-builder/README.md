# Chat Builder Eval Harness

Offline-first harness for debugging chat-builder notebook generation. The harness records retrieval, semantic index, raw draft, validation, and summary artifacts for each fixture.

## Phase 1: Offline Harness + Saved Responses

Implemented as the default mode:

```bash
pnpm eval:chat-builder -- --fixture sim-basic
pnpm eval:chat-builder -- --all
```

The SIM fixture uses the canonical public SIM notebook as its saved response. Runs write artifacts under `packages/web/eval-runs/chat-builder/`.

## Phase 2: Deterministic Retrieval/Index/Validation Tests

Implemented through the pure helpers in `lib.mjs` and covered by `test/chatBuilderEvalHarness.test.mjs`:

- semantic notebook index construction
- deterministic example ranking from discovery resources
- schema/reference/expectation validation

The focused harness test prints lightweight progress stages for the offline eval case:

```text
[chat-builder-eval:request] savedResponse=... prompt="..."
[chat-builder-eval:response] chars=... preview="..."
[chat-builder-eval:validation] ok=true diagnostics=0
```

For ad hoc CLI debugging, pass `--progress` or set `EVAL_CHAT_BUILDER_PROGRESS=1` before running an eval command to get the same stage points. Live CLI runs enable progress automatically.

Manual CLI runs also print compact request, retrieval, response, and validation summaries after each fixture, even when stage progress is off.

## Phase 3: Live OpenAI Mode For One Fixture, Manual Only

Live mode is opt-in and calls the configured chat-builder API endpoint. It is never used by default tests.

```bash
pnpm eval:chat-builder:live -- --fixture sim-basic --model gpt-4.1
```

Live mode prints progress by default so slow network/model calls have visible request, response, parse, validation, and artifact stages.

Useful environment variables:

```text
EVAL_CHAT_BUILDER_API_URL=http://localhost:8787/v1/chat-builder/draft
EVAL_DISCOVERY_URL=http://localhost:5173/.well-known/sfcr.json
EVAL_ORIGIN=http://localhost:5173
EVAL_CHAT_BUILDER_BETA_PASSWORD=
EVAL_OPENAI_MODEL=gpt-4.1
```

The live harness sends `Origin: http://localhost:5173` by default because the chat API enforces the same allowed-origin gate as the browser app. Use `--origin` or `EVAL_ORIGIN` if your local web server uses a different allowed origin.

If a live run fails with `Live response failed (insufficient_quota)`, the request reached OpenAI but the account or project quota rejected it. The artifact `draft.raw.txt` preserves the raw SSE stream for confirmation.

## Phase 4: Live Batch Eval, Manual Or Scheduled

After more fixtures exist, run:

```bash
pnpm eval:chat-builder:live -- --all --model gpt-4.1
```

Keep this manual or scheduled; do not put it in normal PR CI.

## Phase 5: Dashboard/Comparison Reports

The artifact format is intentionally plain JSON/text so a later report page can compare runs by fixture, model, validation status, selected examples, and repair attempts.
