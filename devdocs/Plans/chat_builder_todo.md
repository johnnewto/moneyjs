# Chat Builder Todo

Future work for bringing the useful eval-harness feedback into the real browser chat-builder page at `/#/chat-builder`.

## Current State

The terminal eval harness under `packages/web/evals/chat-builder/` now provides progress stages, compact request/response summaries, retrieval summaries, validation summaries, saved artifacts, offline fixtures, and manual live mode.

The actual browser route at `http://localhost:5173/#/chat-builder` still uses the existing app path in `packages/web/src/app/App.tsx`:

- sends a prompt to `/v1/chat-builder/draft`
- streams assistant text into the chat transcript
- normalizes the response into a notebook document or legacy section draft
- validates the preview enough to show draft readiness

It does not yet show the eval-style request, response, parse, retrieval, or validation progress in the UI.

## Goal

Make the browser chat-builder feel debuggable during manual use without turning it into an eval runner.

The app should expose user-facing progress and summaries:

- preparing request
- sending request
- streaming response
- parsing notebook
- validating draft
- ready or failed

The eval harness should remain the deeper lab bench for saved responses, artifacts, deterministic tests, batch runs, and live/manual regression work.

## Phase 1: Browser Progress Events

Add a lightweight progress state to `ChatBuilderApp` in `packages/web/src/app/App.tsx`.

Suggested state:

```ts
interface ChatBuilderProgressEvent {
  stage: string;
  message: string;
  timestamp: number;
}
```

Add helpers:

```ts
appendDraftProgress(stage: string, message: string): void
clearDraftProgress(): void
```

Emit stages from `handleStartDraft` and `requestChatBuilderDraft`:

- `start`: prompt accepted, model selected
- `request`: endpoint/model/origin/discovery URL summary
- `stream`: first model delta received
- `response`: total streamed characters and short preview
- `parse`: notebook title/cell count or parse failure
- `validation`: ready/blocked and diagnostic count
- `done`: artifact preview ready or request failed

Do not include beta passwords, API keys, or raw large notebook JSON in progress messages.

## Phase 2: Compact Summary UI

Add a small summary block in the right-hand Draft Model Preview panel.

Successful draft example:

```text
Request: live gpt-4.1 -> http://localhost:8787/v1/chat-builder/draft
Discovery: /.well-known/sfcr.json
Prompt: 161 chars "Build the SIM model..."
Response: 7507 chars parsed title="SIM Browser Notebook" cells=16
Validation: ready diagnostics=0
```

Failure example:

```text
Request: live gpt-4.1 -> http://localhost:8787/v1/chat-builder/draft
Response: 842 chars parse failed
Error: Live response failed (insufficient_quota): You exceeded your current quota...
Validation: blocked diagnostics=1
```

Keep this as a work-focused status panel, not a decorative card. It should be compact and scannable.

## Phase 3: SSE Error Detection In App Path

The eval harness now detects OpenAI SSE `error` and `response.failed` events. Bring equivalent handling into the browser chat-builder path.

Current app code only extracts `response.output_text.delta` in `parseChatBuilderSseEvent`. It should also detect provider failures and surface clear messages such as:

```text
Live response failed (insufficient_quota): You exceeded your current quota...
```

Preferred implementation:

- extend the shared SSE reader if it can throw structured errors cleanly
- otherwise add chat-builder-specific SSE failure detection around `readChatBuilderSseResponse`
- preserve partial response text only when useful for debugging

## Phase 4: Shared Telemetry Helpers

Extract browser-safe helpers instead of importing eval code into the app bundle.

Possible file:

```text
packages/web/src/app/chatBuilderTelemetry.ts
```

Possible helpers:

```ts
summarizeChatBuilderPrompt(prompt: string): { chars: number; preview: string }
summarizeChatBuilderResponse(text: string): { chars: number; preview: string }
formatChatBuilderRequestSummary(args: ...): string
formatChatBuilderResponseSummary(args: ...): string
```

Constraints:

- no `fs`, `path`, Ajv, or Node-only imports
- no artifact-writing logic in browser code
- no secrets in summaries

The eval harness can later reuse compatible pure formatting helpers if useful, but that should not block the app work.

## Phase 5: Retrieval Transparency

Start with transparency rather than changing production retrieval behavior.

Show which discovery URL the app sent:

```text
Discovery: /.well-known/sfcr.json
```

Optionally show known public examples after fetching discovery resources:

```text
Examples available: starter, SIM, BMW, GL6 DIS rentier
```

Later, if deterministic retrieval becomes production behavior:

- move ranking into a shared browser-safe module
- fetch discovery/examples before sending the API request
- send selected example ids or compact summaries to the API
- size-limit full example documents carefully

Do not import the eval harness directly into `packages/web/src`.

## Phase 6: Validation Transparency

The app already computes draft validation/build diagnostics. Make the result more explicit in the preview summary.

Show:

- whether parsing produced a notebook document
- notebook title
- cell count
- validation readiness
- diagnostic count
- first few diagnostic messages when blocked

This mirrors the CLI summary while staying user-facing.

## Phase 7: Tests

Add or extend browser app tests for the real route.

Suggested file:

```text
packages/web/test/App.chat-builder.test.tsx
```

Test cases:

- successful streamed draft shows progress stages
- successful draft shows compact request/response/validation summary
- SSE `insufficient_quota` failure surfaces a clear provider error
- beta password is never displayed in progress or summary text
- validation-blocked draft shows diagnostic count and keeps apply disabled

Also consider extending `packages/web/test/assistantSse.test.ts` if SSE failure handling is made shared.

## Suggested Order

1. Add browser progress events in `ChatBuilderApp`.
2. Add compact summary UI.
3. Add SSE provider error detection.
4. Add tests for success and quota failure.
5. Extract shared telemetry helpers if the first implementation creates duplication.
6. Add retrieval transparency.
7. Consider deterministic production retrieval only after the UI/debugging path is stable.

## Non-Goals

- Do not move artifact writing into the browser app.
- Do not make normal app usage depend on eval fixtures.
- Do not import `packages/web/evals/chat-builder/lib.mjs` into production React code.
- Do not implement notebook tweaking/edit assistant evals here; that should be a sibling `notebook-assistant` eval harness.
