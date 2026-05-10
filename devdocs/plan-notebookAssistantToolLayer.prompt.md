## Plan: Notebook Assistant Tool Layer

Build a read-only, browser-side tool layer that lets the notebook assistant query structured MoneyJS/SFCR notebook state on demand: notebook JSON, solver outputs, matrices, chart series, dependency graph data, and variable metadata. The recommended first implementation keeps tools read-only and executes them against an immutable browser snapshot captured when the user asks a question. Later write or compute actions such as `runScenario()`, `compareRuns()`, and `findAccountingErrors()` can build on the same schema and dispatcher after the read-only protocol is stable.

**Steps**
1. Phase 1 - Define the tool contract.
   - Create a typed tool registry for the initial read-only tool set: `getNotebookSummary`, `getEquation`, `getCurrentValues`, `getSeries`, `getSeriesWindow`, `getMatrix`, `getVariableMetadata`, `getDependencyGraph`, `listRuns`, `listVariables`, and `listCharts`.
   - Define input and output schemas in TypeScript first, with JSON-schema-compatible shapes for the assistant API.
   - Standardize identifiers exposed to the model: prefer notebook-visible stable ids where needed, but make tool results include human-readable titles and indices so responses do not expose raw implementation details unnecessarily.
   - Keep later mutating tools (`runScenario`, `compareRuns`, `suggestShock`, `findAccountingErrors`) out of the initial registry.

2. Phase 2 - Add stable notebook query functions.
   - Implement a focused query module that accepts a frozen notebook/runtime snapshot and exposes stable functions matching the tool registry.
   - Reuse existing notebook model section resolution through `buildEditorStateForNotebookModel`, `resolveNotebookModelKey`, and `resolveRunCellModelKey`.
   - Reuse existing runtime output shape from `useNotebookRunner`, including `outputs`, `status`, `errors`, and `getResult` semantics.
   - Reuse existing graph and metadata helpers: `buildDependencyGraph`, `buildVariableDescriptions`, and `buildVariableUnitMetadata`.
   - Return bounded results by default: `getSeries` may return full data only for a named run and variable, while `list*` and graph tools should support `limit`, `offset`, or summarized defaults if needed.

3. Phase 3 - Snapshot assistant state at question time.
   - In the notebook app, build an immutable assistant snapshot containing `NotebookDocument`, runtime outputs, runner statuses/errors, selected period index, selected cell, selected variable context, and derived model metadata.
   - Pass a compact context summary to the chat API as today, but include a machine-readable tool catalog and a snapshot version/hash.
   - Do not post all solver outputs up front. Let tool calls request series or windows only when needed.

4. Phase 4 - Implement a browser-side tool dispatcher.
   - Add a dispatcher that validates tool name and arguments, invokes the matching query function against the frozen snapshot, and returns a compact JSON result or typed error.
   - Include guardrails: reject unknown run ids, unknown variables, invalid periods, inverted windows, oversized series requests, and missing run results.
   - Keep dispatcher pure/read-only for the first release.

5. Phase 5 - Extend the assistant protocol.
   - Update the web assistant request/response loop from single static context to an iterative protocol: user question -> model requests tool -> browser executes tool -> model receives tool result -> assistant produces final answer.
   - Prefer API-driven tool selection with OpenAI Responses tools if the current chat API can stream tool-call events cleanly.
   - If streaming tool events are awkward, use a two-step fallback: ask the model for a structured JSON tool request, execute it in the browser, then send the tool result back in a follow-up request for the final answer.
   - Preserve the current SSE text streaming for final assistant text.

6. Phase 6 - Update prompts and UI language.
   - Update the notebook assistant system prompt to say it can use read-only tools for notebook state, solver results, matrices, charts, dependencies, and metadata.
   - Keep the promise that it will not change the notebook.
   - Add lightweight UI status text for tool activity such as “Inspecting series Y from baseline run” only if it helps user trust; avoid exposing internal ids in normal copy.

7. Phase 7 - Test the read-only tools end to end.
   - Unit test query functions with notebook fixtures covering baseline runs, scenario runs, matrices, chart cells, dependency graph output, variable metadata, and missing data.
   - Unit test dispatcher validation and typed tool errors.
   - Integration test the notebook assistant flow with mocked API responses that request tools and then stream final text.
   - Keep tests focused on the web package first; add chat-api tests only where protocol parsing or OpenAI payload construction changes.

8. Phase 8 - Add write/compute tools later.
   - After read-only tools are reliable, design a separate mutating tool capability tier with explicit user confirmation.
   - Start with compute-but-not-commit tools (`compareRuns`, maybe `findAccountingErrors`) before notebook-changing tools.
   - Treat `runScenario`, `suggestShock`, and future notebook edits as privileged actions with confirmation, rate limits, and clear UI affordances.

**Relevant files**
- `packages/web/src/notebook/NotebookApp.tsx` — current assistant request flow, `buildNotebookAssistantContext`, selected period/variable state, and current value extraction via `getCurrentValueMapForModelRef`.
- `packages/web/src/notebook/useNotebookRunner.ts` — runtime outputs, run status/error state, baseline/scenario execution, and result lookup semantics.
- `packages/web/src/notebook/types.ts` — canonical notebook cell and runtime output types, including run, matrix, chart, table, and sequence cells.
- `packages/web/src/notebook/modelSections.ts` — model resolution and editor-state assembly for modern sectioned notebooks and legacy model cells.
- `packages/web/src/notebook/dependencyGraph.ts` — existing parsed dependency graph, nodes, edges, variable type, lag/current dependency metadata, and graph errors.
- `packages/web/src/lib/variableDescriptions.ts` — variable description extraction from equations and externals.
- `packages/web/src/lib/units.ts` and `packages/web/src/lib/unitMeta.ts` — variable unit metadata and unit diagnostics for `getVariableMetadata`.
- `packages/chat-api/src/index.ts` — current `/v1/notebook-assistant/ask` endpoint and OpenAI Responses request construction.
- `packages/chat-api/src/notebookAssistantPrompt.ts` — read-only assistant instructions that need tool-awareness.
- `packages/web/test/App.notebook-navigation.test.tsx` — existing assistant integration test to extend or mirror for tool-based flow.
- `packages/web/test/dependencyGraph.test.ts` — existing dependency graph test coverage to reuse for dependency tool assertions.

**Verification**
1. Run focused query/dispatcher tests, for example `pnpm --filter @sfcr/web exec vitest run test/notebookAssistantTools.test.ts` once added.
2. Run the existing assistant navigation test path, for example `pnpm --filter @sfcr/web exec vitest run test/App.notebook-navigation.test.tsx`.
3. Run dependency-specific coverage after graph tool work: `pnpm --filter @sfcr/web test -- dependencyGraph`.
4. Run `pnpm --filter @sfcr/web typecheck` after adding shared types, schemas, and protocol changes.
5. Manually validate on the BMW notebook: ask for a variable equation, selected-period values, a named series window, a matrix explanation, and dependencies for a variable.
6. Confirm final assistant text does not leak raw cell ids unless the user explicitly asks for JSON/source-level details.

**Decisions**
- Start with read-only tools only.
- Execute tools in the browser against the current notebook/runtime snapshot because solver outputs currently live in web app state, not in the chat API worker.
- Keep the chat API responsible for model orchestration and final text, not for recomputing notebook state in the first version.
- Use bounded, targeted data access instead of sending full solver outputs in the initial context.
- Separate future mutating/compute tools into a later permissioned tier.

**Further Considerations**
1. Tool-call protocol choice: use native Responses tool calls if streaming support is straightforward; otherwise use a structured JSON tool-request round trip first.
2. Snapshot freshness: include a snapshot hash/version so the app can reject tool calls if the notebook changed while the assistant was thinking.
3. Result size limits: define a conservative default for series windows and require explicit `getSeriesWindow` for long runs.
