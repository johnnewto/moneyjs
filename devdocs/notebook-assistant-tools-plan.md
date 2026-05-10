# Notebook Assistant Tool Plan

## Goal

Give the browser notebook assistant safe, reviewable access to notebook state, run values, and notebook-edit proposals without letting the model mutate the notebook directly.

The assistant should be able to:

- Inspect notebook structure, variables, equations, matrices, charts, runs, and result values.
- Ask for more data when the answer depends on runtime output or metadata not already present in context.
- Compile common edit requests into validated notebook patch proposals.
- Let the user preview, apply, discard, or undo proposed notebook changes in the browser UI.

## Current Architecture

The active implementation is browser-first.

- `packages/web/src/notebook/notebookAssistantTools.ts` owns the browser-side tool registry and dispatcher.
- `packages/web/src/notebook/notebookPatch.ts` owns pure patch preview, validation, and application.
- `packages/web/src/notebook/NotebookApp.tsx` builds assistant context, parses model tool requests, runs tools locally, sends tool results back to the API, and hosts the patch preview/apply UI.
- `packages/chat-api/prompts/notebook-assistant-system.md` and `packages/chat-api/src/notebookAssistantPrompt.ts` instruct the model to request tools with structured JSON and to treat edits as proposals.

The chat API remains a streaming model proxy. Notebook tool execution happens in the browser so the API does not need notebook runtime internals.

## Implemented

### Read-Only Data Tools

Implemented in `notebookAssistantTools.ts`:

- `getNotebookSummary`
- `getEquation`
- `getCurrentValues`
- `getSeries`
- `getSeriesWindow`
- `getMatrix`
- `getVariableMetadata`
- `getDependencyGraph`
- `listRuns`
- `listVariables`
- `listCharts`

These tools read from a `NotebookAssistantSnapshot` containing the notebook document, selected UI context, and runtime outputs.

### Patch Foundation

Implemented in `notebookPatch.ts`:

- `validateNotebookPatch`
- `previewNotebookPatch`
- `applyNotebookPatch`

Patch behavior:

- Supports `add`, `replace`, and `remove` operations.
- Uses JSON Pointer paths.
- Restricts edits to allowed notebook paths.
- Normalizes patched documents through notebook serialization.
- Validates the whole notebook after transformation.
- Summarizes added, changed, and removed cells.

### Proposal Tools

Implemented in `notebookAssistantTools.ts`:

- `validateNotebookPatch`
- `previewNotebookPatch`
- `explainNotebookPatch`

These expose patch validation and explanation to the assistant without applying changes.

### High-Level Patch Helpers

Implemented in `notebookAssistantTools.ts`:

- `createAddChartPatch`
- `createUpdateChartVariablesPatch`
- `createUpdateParameterPatch`

These generate validated patch proposals from user-friendly arguments.

`createAddChartPatch` validates the target run and, when result data exists, verifies requested variables exist in that run's series. It generates a unique chart cell id from the chart title.

`createUpdateChartVariablesPatch` validates the chart id, checks requested variables against the chart's source run result when result data exists, and proposes replacing the chart's variable list.

`createUpdateParameterPatch` finds the matching externals cell and parameter row, then creates a `replace` operation for the parameter `valueText`.

### Manual Patch UI

Implemented in `NotebookApp.tsx`:

- Patch JSON text area.
- Preview patch.
- Apply patch.
- Discard patch.
- Undo patch.
- Validation summary and issue display.

Patch application remains user-confirmed.

### Browser-Side Tool Loop

Implemented in `NotebookApp.tsx`:

- The model can emit a fenced JSON block with this shape:

```json
{
  "notebookAssistantToolRequests": [
    {
      "name": "listRuns",
      "args": {}
    }
  ]
}
```

- The browser parses the request.
- The browser dispatches tools with `dispatchNotebookAssistantTool`.
- Tool results are sent back to the assistant in a follow-up request.
- If a tool result includes a patch proposal, the Patch JSON panel is populated and previewed automatically.

### Tool Loop Hardening

Implemented in `NotebookApp.tsx` and covered by assistant navigation tests:

- Tool request JSON is replaced with user-facing status instead of staying visible in the chat thread.
- Malformed tool request JSON is reported without sending a follow-up request.
- Unknown tool names are returned as tool failures and included in the follow-up result payload.
- Helper validation failures are surfaced in the assistant answer instead of loading an invalid patch.
- One browser-side tool round runs per user ask, with a bounded number of tool requests in that round.
- Final assistant answers keep a compact tool execution summary above the model's answer.

## Example: BMW Chart Request

User asks in the assistant panel:

> Add a chart showing disposable income and consumption for the BMW baseline run.

The model should not invent a raw notebook edit immediately. It should request the helper tool that can validate the run id and series names:

```json
{
  "notebookAssistantToolRequests": [
    {
      "name": "createAddChartPatch",
      "args": {
        "runId": "baseline-newton",
        "title": "Disposable income",
        "variables": ["YD", "Cd"]
      }
    }
  ]
}
```

The browser runs `createAddChartPatch` against the current notebook snapshot. With the BMW template and a completed baseline result, the tool returns a patch proposal like:

```json
{
  "description": "Add chart 'Disposable income'.",
  "operations": [
    {
      "op": "add",
      "path": "/cells/-",
      "value": {
        "id": "disposable-income",
        "type": "chart",
        "title": "Disposable income",
        "sourceRunCellId": "baseline-newton",
        "variables": ["YD", "Cd"]
      }
    }
  ]
}
```

The browser sends the tool result back to the assistant. The final assistant answer should say that it prepared a validated patch proposal and that it is ready for user preview/apply. The Patch JSON panel is filled automatically, but the notebook is not changed until the user clicks Apply patch.

If `YD` or `Cd` are missing from the run result, the helper returns an error instead of a patch. The assistant should report that the requested series were not available and ask the user to run or inspect the relevant notebook result.

## Example: BMW Parameter Change

User asks:

> Change the BMW consumption parameter `alpha1` to `0.65`.

The model can request:

```json
{
  "notebookAssistantToolRequests": [
    {
      "name": "createUpdateParameterPatch",
      "args": {
        "modelId": "equations-newton",
        "variable": "alpha1",
        "value": 0.65
      }
    }
  ]
}
```

The browser returns a validated patch replacing the `valueText` for the matching externals row. The assistant summarizes the proposed parameter change, and the user can preview/apply it from the Patch JSON panel.

## Current Step

Add the next product helper in a small slice.

Recommended first helper:

1. Add `createAddScenarioRunPatch`.
2. Validate the source model or baseline run references exist.
3. Generate a unique scenario run id from the title.
4. Return `{ patch, preview }` without applying the change.
5. Add focused assistant tool tests for valid scenario runs, missing references, and id collisions.

## Next Product Helpers

After the chart variable update helper, add more high-level patch helpers in small slices:

- `createAddScenarioRunPatch`
- `createAddEquationPatch`
- `createUpdateEquationPatch`
- `createAddMatrixRowPatch`

Each helper should return `{ patch, preview }`, reuse existing patch validation, and avoid applying changes directly.

## Validation Checklist

For tool-loop and helper changes, run focused checks first:

```bash
pnpm --filter @sfcr/web exec vitest run test/notebookAssistantTools.test.ts
pnpm --filter @sfcr/web exec vitest run test/notebookPatch.test.ts
pnpm --filter @sfcr/web exec vitest run test/App.notebook-navigation.test.tsx -t "assistant-requested notebook tools|malformed assistant notebook tool|unknown assistant notebook tool|helper validation|asks the notebook assistant|previews, applies, and undoes"
pnpm --filter @sfcr/web typecheck
pnpm --filter @sfcr/chat-api typecheck
```

Run broader web or workspace tests when helper behavior crosses package boundaries or affects shared notebook flows.

## Non-Goals For Now

- Do not let the model directly mutate notebook state.
- Do not move notebook runtime state into `packages/chat-api`.
- Do not expose browser-only UI concerns through `packages/core`.
- Do not add broad patch paths just to make one helper easier.
