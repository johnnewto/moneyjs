# Notebook Assistant Context Optimization

Notes for the browser notebook assistant context-size and latency optimizations.

## Goals

- Reduce LLM input tokens for common Edit-mode notebook changes.
- Keep notebook mutation authority in browser helper tools, not model-authored patch paths.
- Preserve enough notebook semantics for correct tool selection.
- Fall back to broader context when a request is ambiguous or structural.
- Avoid a second model call when browser tools already produced a valid patch preview.

The compact formats described here are assistant transport formats only. They are not persisted notebook document formats.

## Request Flow

Edit mode now has three main paths.

1. Build a compact first-turn context in `packages/web/src/notebook/notebookAssistantRuntime.ts`.
2. Send one request to the notebook assistant API.
3. Parse `notebookAssistantToolRequests` in `packages/web/src/notebook/notebookAssistantFlow.ts`.
4. Run helper tools locally in `packages/web/src/notebook/NotebookApp.tsx`.
5. Attach any proposed patch preview to the assistant message.
6. If all helper tools succeeded and produced a patch, build the final user-facing answer locally and skip the follow-up model request.
7. If no valid local patch answer is available, send a compact tool-result follow-up context.

The important boundary remains:

```text
Model chooses intent and helper arguments. Browser builds, validates, previews, and applies patches.
```

## Compact Edit Context

Edit mode uses `sfcr-assistant-compact` instead of full notebook JSON.

Shape:

```json
{
  "v": 1,
  "fmt": "sfcr-assistant-compact",
  "mode": "edit",
  "intent": "parameter-update",
  "nb": ["bmw-notebook", "BMW Browser Notebook"],
  "cells": 18,
  "cellTypes": "markdown (3), matrix (2), sequence (2), equations (1), solver (1), externals (1), initial-values (1), run (3), chart (3), table (1)",
  "sel": ["equations-newton", "delta", 0],
  "resultCount": 3,
  "m": [
    {
      "id": "equations-newton",
      "title": "BMW model",
      "ex": [["delta", "constant", "0.1", "Depreciation rate"]],
      "opt": {
        "method": "NEWTON",
        "periods": 100,
        "tolerance": "1e-10",
        "maxIterations": 100,
        "defaultInitialValue": "1e-15"
      }
    }
  ],
  "r": [["baseline-newton", "equations-newton", 50, "baseline", "Baseline run with Newton"]],
  "tools": ["createUpdateParameterPatch"]
}
```

Broader compact model example:

```json
{
  "v": 1,
  "fmt": "sfcr-assistant-compact",
  "mode": "edit",
  "nb": ["bmw-notebook", "BMW Browser Notebook"],
  "sel": ["equations-newton", "delta", 0],
  "m": [
    {
      "id": "equations-newton",
      "title": "BMW model",
      "eq": [
        ["Cd", "alpha0 + alpha1 * YD + alpha2 * lag(Mh)", "behavioral", "Consumption goods demand by households"],
        ["Cs", "Cd", "identity", "Consumption goods supplied by firms"],
        ["Gs", "Gd", "identity", "Government goods supplied on demand"],
        ["Ts", "theta * Y", "definition", "Tax revenue on output"],
        ["YD", "Y - Ts", "definition", "Disposable income after taxes"],
        ["Y", "Cs + Gs", "identity", "Output determined by aggregate demand"],
        ["Mh", "lag(Mh) + YD - Cd", "accumulation", "Household money balances"]
      ],
      "ex": [
        ["alpha0", "constant", "20", "Exogenous component in consumption"],
        ["alpha1", "constant", "0.75", "Propensity to consume out of income"],
        ["alpha2", "constant", "0.1", "Propensity to consume out of wealth"],
        ["delta", "constant", "0.1", "Depreciation rate"],
        ["Gd", "constant", "20", "Government demand for goods"],
        ["theta", "constant", "0.2", "Tax rate on output"]
      ],
      "iv": [],
      "opt": {
        "method": "NEWTON",
        "periods": 100
      }
    }
  ],
  "r": [
    ["baseline-newton", "equations-newton", 50, "baseline", "Baseline run with Newton"]
  ],
  "tools": ["createUpdateParameterPatch"]
}
```

Key fields:

- `fmt`: compact context marker.
- `intent`: request-specific hint such as `parameter-update`.
- `nb`: notebook id and title.
- `sel`: selected model id, selected or inferred variable target, selected period index.
- `m`: compact model rows.
- `eq`: equation rows as `[name, expression, role, description]` when needed.
- `ex`: external rows as `[name, kind, valueText, description]`.
- `iv`: initial value rows as `[name, valueText]` when needed.
- `r`: run rows as `[runId, modelId, periods, mode, title, description, baselineRunId, baselineStartPeriod, scenario]`.
- `cur`: selected-period values when available.
- `tools`: available browser assistant tool names.

Helper requests must still use canonical long argument names. Compact keys such as `m`, `ex`, or `sel` are never valid helper arguments or patch paths.

## Parameter-Only Fast Path

For explicit parameter edits, the context builder omits equations and initial values and sends only matching external rows.

Supported examples:

```text
set alpha1 to 0.65
set alpha1 to 0.6 and alpha2 to 0.12
set propensity to consume out of income to 0.6 and propensity to consume out of wealth to 0.12
set depreciation to 0.2
```

The detector can match:

- literal external names such as `alpha1`, `alpha2`, and `delta`
- full external descriptions such as `Propensity to consume out of income`
- unique description tokens such as `depreciation` for `Depreciation rate`

Generic command tokens such as `set`, `change`, `update`, and `make` are ignored so they do not accidentally select parameters whose descriptions contain those words.

When the fast path is active, `intent` is `parameter-update`, equation syntax is omitted from the prompt, and the model should usually call `createUpdateParameterPatch`.

## Broader Compact Model Path

If the request is not confidently recognized as a direct parameter edit, Edit mode still uses compact context, but includes the relevant model block with equations, externals, initial values, solver options, and runs.

Use this path for semantic or structural requests such as:

```text
Change the consumption equation to use expected income.
Add a wage share equation.
Create a scenario comparing policy responses.
Make the model more Keynesian.
```

This costs more than the parameter-only path, but gives the model enough context to choose the right helper tools or ask for more information.

## Tool-Result Follow-Up Context

When a second model call is still needed, the browser uses `sfcr-assistant-tool-result-context` instead of resending notebook context.

Shape:

```json
{
  "v": 1,
  "fmt": "sfcr-assistant-tool-result-context",
  "mode": "edit",
  "nb": ["bmw-notebook", "BMW Browser Notebook"],
  "sel": ["delta", 0],
  "resultCount": 3,
  "toolResults": [["createUpdateParameterPatch", true, "Update parameter 'delta' to 0.2.", 1]]
}
```

This format is intentionally small. It is only for explaining sanitized tool results, not for asking the model to reason over the whole notebook again.

## Local Success Answer

If Edit-mode helper tools all succeed and produce a patch, the browser skips the follow-up model request. The local answer is built by `buildNotebookAssistantLocalToolResultAnswer`.

The local answer includes:

- patch description
- preview validity
- changed cell count when available
- operation count
- review/apply wording

It does not include raw patch JSON, JSON Pointer paths, or internal cell ids.

The debug trace emits `request:skipped` for this path.

## Debug Signals

Useful debug events in the Assistant panel trace:

- `context:built`: first context size and notebook summary.
- `request:start`: model request was sent.
- `response:received`: model response text size.
- `tool:extracted`: parsed helper requests.
- `tool:result`: local browser tool output.
- `patch:proposed`: patch preview is ready.
- `request:skipped`: follow-up model request was intentionally skipped.
- `turn:done`: total turn duration.

Healthy simple parameter edit trace:

```text
context:built, phase first, roughly 3300-3600 chars
request:start, phase first
response:received, helper JSON only
tool:extracted
tool:result
patch:proposed
request:skipped, phase followup
turn:done
```

If a direct parameter edit still builds a roughly 5500+ character context, the target inference probably missed the user's wording and fell back to the broader compact model path.

## Pros

- Lower input-token cost for common Edit requests.
- Lower latency by skipping successful follow-up calls.
- Helper tools own canonical patch paths and validation.
- The persisted notebook format remains unchanged.
- Prompt surface is smaller and more task-specific.
- The model spends less effort reading irrelevant cells.
- Natural-language aliases can map to external parameters without sending the whole model.

## Cons And Risks

- More browser-side inference logic to maintain.
- Description-token matching can over-match if the rules are too broad.
- Compact context can hide information needed for ambiguous edits.
- Prompt, runtime, and tests must stay aligned as the compact schema evolves.
- Debugging requires inspecting both context inference and tool dispatch.
- Too many one-off heuristics would become brittle; prefer conservative matching plus fallback.

## Guardrails

- Use parameter-only context only when the request contains an edit verb and a value marker such as `to` or `=`.
- Prefer literal variable names over description-token inference.
- Ignore command words and generic description words.
- Use unique description tokens only when they identify one external in the notebook.
- Fall back to the broader compact model context when inference is uncertain.
- Keep helper tool argument names canonical and long-form.
- Never skip patch preview or user apply confirmation.

## Validation

Focused tests live in `packages/web/test/notebookAssistantRuntime.test.ts` and `packages/web/test/notebookAssistantFlow.test.ts`.

Relevant checks:

```bash
pnpm --filter @sfcr/web exec vitest run test/notebookAssistantRuntime.test.ts test/notebookAssistantFlow.test.ts
pnpm --filter @sfcr/web typecheck
pnpm --filter @sfcr/chat-api typecheck
```

Runtime tests cover:

- compact Edit context instead of full notebook JSON
- Ask mode retaining registry-backed read tool syntax
- equation and external descriptions in compact model context
- single-parameter fast path
- multi-parameter fast path
- description-based parameter targeting
- unique description-token targeting such as `depreciation` -> `delta`
- compact tool-result follow-up context
- local success answer without JSON Pointer leakage

## Implementation Pointers

- `packages/web/src/notebook/notebookAssistantRuntime.ts`
  - `buildNotebookAssistantContext`
  - `buildCompactNotebookAssistantContext`
  - `inferExplicitParameterTargets`
  - `buildNotebookAssistantToolResultContext`
  - `buildNotebookAssistantLocalToolResultAnswer`
- `packages/web/src/notebook/NotebookApp.tsx`
  - first request context building
  - local tool dispatch
  - successful follow-up skip
- `packages/web/src/notebook/notebookAssistantFlow.ts`
  - tool request extraction
  - stale helper alias normalization
- `packages/chat-api/src/notebookAssistantPrompt.ts`
  - model-facing compact context description
