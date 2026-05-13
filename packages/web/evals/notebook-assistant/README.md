# Notebook Assistant Eval Harness

Offline-first harness for debugging in-notebook assistant ask/edit behavior. This is a sibling to the chat-builder eval harness: chat-builder evaluates full notebook drafts, while this harness evaluates existing notebook context, tool choice, minimal patch proposals, validation, and preview summaries.

The scoring core lives in `src/notebook/notebookAssistantEval.ts` and imports the production assistant flow, tool dispatcher, and patch validation modules. The Node CLI in this folder is a fixture/artifact wrapper around that TypeScript evaluator.

## Assistant Round Trip Coverage

The browser Assistant panel already supports a bounded multi-step assistant turn:

1. Build notebook context from the current notebook, selected variable/period, run state, mode, and advertised tool syntax.
2. Send the first request to `/v1/notebook-assistant/ask`.
3. Parse `notebookAssistantToolRequests` from the assistant response.
4. Filter tools by mode.
5. Dispatch allowed tools locally in the browser.
6. Attach a proposed patch immediately if helper tools produce one.
7. Send a follow-up request with summarized tool results.
8. Stream the final assistant answer.
9. Check the final answer for direct patch proposals or text-derived chart proposals.

This is a two-request, one-tool-round loop, not an unbounded agent loop.

The offline eval harness uses `src/notebook/notebookAssistantEval.ts`, which imports the production assistant flow, tool dispatcher, and patch validation modules. It evaluates saved assistant responses without network calls.

The CLI live eval command is still reserved for a future response provider that will call `/v1/notebook-assistant/ask`, run the same local tool dispatch, send tool results back, and score the final response through the same TypeScript evaluator.

## Phase 1: Offline Harness + Saved Responses

Implemented as the default mode:

```bash
pnpm eval:notebook-assistant -- --fixture ask-list-runs
pnpm eval:notebook-assistant -- --all
```

Runs write artifacts under `packages/web/eval-runs/notebook-assistant/`:

- `fixture.json`
- `assistant.raw.txt`
- `tool-requests.json`
- `tool-results.json`
- `patch.json`
- `preview.json`
- `validation.json`
- `summary.json`

For ad hoc debugging, pass `--progress` or set `EVAL_NOTEBOOK_ASSISTANT_PROGRESS=1`.

## Fixture Contract

Each fixture supplies an existing notebook, assistant mode, user question, saved assistant response, and expected behavior:

```json
{
  "id": "edit-change-alpha1",
  "mode": "edit",
  "question": "Change alpha1 to 0.65.",
  "notebookPath": "../../public/notebook-examples/sim.notebook.json",
  "savedResponsePath": "responses/edit-change-alpha1.raw.txt",
  "expected": {
    "toolNames": ["createUpdateParameterPatch"],
    "patch": true,
    "patchSummary": { "addedCells": 0, "changedCells": 1, "removedCells": 0, "operationCount": 1 }
  }
}
```

Ask-mode fixtures should expect read tools or grounded prose and no patch. Edit-mode fixtures should prefer helper patch tools where available and use raw patches only as a fallback case.

## Phase 2: Deterministic Tool/Patch Tests

The TypeScript evaluator and CLI wrapper are covered by `test/notebookAssistantEvalHarness.test.mjs`:

- fixture loading
- production assistant tool request extraction
- ask-mode patch/tool blocking through the real mode filter
- helper patch extraction through the real tool dispatcher
- patch validation and preview through the real patch module
- artifact writing

Focused test command:

```bash
pnpm --filter @sfcr/web exec vitest run test/notebookAssistantEvalHarness.test.mjs
```

## Phase 3: Live Mode, Manual Only

CLI live mode is intentionally not implemented yet. The browser Assistant panel already has a local live-test path for manual checks against `/v1/notebook-assistant/ask`; the CLI still needs a response provider that can call that endpoint, execute local notebook tools, send tool results back, and pass the final response through the same TypeScript evaluator.

```bash
pnpm eval:notebook-assistant:live -- --fixture edit-change-alpha1
```

The command currently reports that CLI live mode is not available rather than falling back silently.

## Phase 4: Live Batch Eval, Manual Or Scheduled

After live mode exists and more fixtures are added, run it manually or from a scheduled job. Do not put live provider calls in normal PR CI.

## Phase 5: Dashboard/Comparison Reports

The artifact format is plain JSON/text so a later report page can compare fixtures, model responses, tools used, patch summaries, validation status, and residual diagnostics.
