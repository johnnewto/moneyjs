# Notebook Assistant Round Trip

Reference notes for how the in-notebook assistant, local live tests, and notebook-assistant eval harness fit together.

Related design note: [Notebook Assistant Context Optimization](notebook-assistant-context-optimization.md).

## Runtime Surfaces

- Browser assistant panel: `packages/web/src/notebook/NotebookApp.tsx`
- Assistant runtime helpers: `packages/web/src/notebook/notebookAssistantRuntime.ts`
- Assistant flow parsing and policy: `packages/web/src/notebook/notebookAssistantFlow.ts`
- Assistant tool dispatcher and helpers: `packages/web/src/notebook/notebookAssistantTools.ts` and `packages/web/src/notebook/assistantTools/`
- Patch validation and preview: `packages/web/src/notebook/notebookPatch.ts`
- Chat API endpoint: `packages/chat-api/src/index.ts` at `/v1/notebook-assistant/ask`
- Model-facing prompt source: `packages/chat-api/prompts/notebook-assistant-system.md`
- Bundled prompt module: `packages/chat-api/src/notebookAssistantPrompt.ts`
- Offline eval scoring core: `packages/web/src/notebook/notebookAssistantEval.ts`
- Eval CLI and fixtures: `packages/web/evals/notebook-assistant/`

## Browser Assistant Turn

The browser Assistant panel owns the live user-facing round trip. It is a bounded multi-step flow:

1. Build notebook context from the current notebook document, assistant mode, selected variable, selected period, runtime status/results, UI hints, available tool names, and tool syntax.
2. Send the first request to `/v1/notebook-assistant/ask` with recent chat messages, model, beta password if needed, context, and user question.
3. Stream the first assistant response into the current assistant message.
4. Parse `notebookAssistantToolRequests` with `extractNotebookAssistantToolRequests`.
5. Filter requests with `filterNotebookAssistantToolRequestsForMode`.
6. Dispatch allowed tools locally with `dispatchNotebookAssistantToolRequests`.
7. If helper tools produce a patch, attach the previewable patch immediately to the assistant message.
8. If Edit mode helper tools all succeed and produce a patch, synthesize the final patch-ready answer locally and skip the follow-up model request.
9. Otherwise, build a compact follow-up question with summarized tool results using `buildNotebookAssistantToolFollowupQuestion`.
10. Send a second request to `/v1/notebook-assistant/ask` with the tool results follow-up.
11. Stream the final assistant response into the same assistant message.
12. Check the final response for direct patch proposals or text-derived chart update proposals.

This is a bounded one-tool-round loop. Many successful Edit helper patches complete with one model request; other tool paths may still use a compact second request. It is not an unbounded agent loop that repeatedly calls tools until convergence.

## Mode Contract

Ask mode can inspect notebook state and request read-only tools. It must not create, validate, preview, explain, or return notebook patches. If a user asks for a notebook change in Ask mode, the assistant should direct them to Edit mode.

Edit mode prepares changes for user review. It should use read tools when needed to resolve run ids, chart ids, model ids, variables, or runtime data. For supported changes, it should request helper patch tools rather than hand-writing raw patch JSON.

The browser enforces the mode boundary after the model responds by filtering requested tools. Ask mode blocks patch tools even if the model requests them.

## Patch Handling

The assistant never applies notebook changes directly. It can only produce or trigger a patch proposal.

Patch proposals are previewed with `previewNotebookPatch`, validated with `validateNotebookPatch`, and then shown to the user for review. Applying a patch is a separate explicit user action in the browser.

Helper-generated patches are preferred for common operations:

- chart and table creation or updates
- equation creation, updates, and removals
- external parameter changes
- initial values
- scenario runs and run options
- matrix rows
- markdown cells
- notebook title changes
- variable descriptions and unit metadata

Raw patch JSON is reserved for unsupported edits. Raw patches should use minimal JSON Pointer operations and stable `/cells/by-id/<cell-id>/<property>` paths for cell-property edits.

## Local Live Tests

The Assistant panel includes local-only live test prompts when the web app runs in Vite dev mode on `localhost` or `127.0.0.1`.

These controls run fixed prompts through the same browser assistant request and tool loop as the normal composer. They are manual smoke tests for the live local stack:

- `pnpm web:dev`
- `pnpm --filter @sfcr/chat-api dev`
- browser Assistant tab
- `Local Live Tests`

The debug trace panel shows context building, request stages, tool extraction, tool dispatch, patch proposal, follow-up request, and final response events.

## Offline Eval Harness

The notebook-assistant eval harness is offline-first. Fixtures provide:

- an existing notebook fixture
- assistant mode
- user request
- saved assistant response text
- expected tools, patch/no-patch behavior, patch summary, and target assertions

The offline evaluator does not call the model. It loads saved response text and evaluates it through `packages/web/src/notebook/notebookAssistantEval.ts`.

That TypeScript evaluator imports the production assistant modules for tool extraction, mode filtering, tool dispatch, patch extraction, validation, preview, and scoring. This avoids a separate eval-only implementation of assistant semantics.

Run the offline harness from the repository root:

```bash
pnpm --filter @sfcr/web run eval:notebook-assistant -- --fixture ask-list-runs
pnpm --filter @sfcr/web run eval:notebook-assistant -- --all
```

Artifacts are written to `packages/web/eval-runs/notebook-assistant/`.

## CLI Live Eval Status

The CLI live command is reserved but not implemented yet:

```bash
pnpm --filter @sfcr/web run eval:notebook-assistant:live -- --fixture edit-change-alpha1
```

To implement it, add a response provider that mirrors the browser assistant turn:

1. Load the fixture notebook and build equivalent assistant context.
2. Call `/v1/notebook-assistant/ask` for the first response.
3. Parse and dispatch local tool requests against the fixture snapshot.
4. Send summarized tool results back through a follow-up request.
5. Score the final response and any patch through `notebookAssistantEval.ts`.
6. Write the same artifacts as offline mode, plus live request metadata.

CLI live mode should remain manual or scheduled. It should not run in normal PR CI because it depends on network, provider quota, model variability, and local API configuration.

## Prompt Documentation Boundary

Keep architecture notes out of `packages/chat-api/prompts/notebook-assistant-system.md` unless they directly improve model behavior. That file is model-facing prompt text. Operational and architectural details belong here and in `packages/web/evals/notebook-assistant/README.md`.
