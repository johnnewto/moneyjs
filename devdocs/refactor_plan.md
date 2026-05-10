# MoneyJS / SFCR Refactoring Plan

## Goal

Make the codebase easier to maintain by separating notebook logic, solver/domain logic, UI rendering, assistant integration, and file import/export.

The main principle is: keep `packages/web` thin. React components should compose state, hooks, and views; reusable notebook, validation, import/export, dependency, and model logic should live in pure TypeScript modules that can be tested without rendering the app.

## Priorities

1. Reduce large multi-purpose files.
2. Move reusable notebook/model logic out of React components.
3. Preserve behavior while extracting modules.
4. Create clean boundaries between `web`, `core`, `core-worker`, and `chat-api`.
5. Improve testability before changing product behavior.
6. Keep future format support possible without adding unsupported formats during the refactor.

## Current Package Boundaries

```text
packages/core          solver engine, model runtime, and domain logic
packages/core-worker   worker-facing wrapper around @sfcr/core
packages/web           browser UI, editor flows, and result presentation
packages/chat-api      serverless assistant backend and tool routing
```

Preferred dependency direction:

```text
web -> core-worker
web -> core
core-worker -> core
chat-api -> core where needed
```

Avoid this:

```text
core -> web
core-worker -> web
chat-api -> web
```

If a future `notebook-core` package is introduced, it should be pure TypeScript and browser/server reusable:

```text
web -> notebook-core -> core
chat-api -> notebook-core
```

`notebook-core` must not import React, DOM APIs, browser storage, CSS, UI components, or Cloudflare-specific APIs.

---

# Phase 1 - Inventory and Low-risk Cleanup

## 1. Add file-size visibility

Add a small script to report large TypeScript files. This should be the first low-risk change because it gives future refactors a visible baseline without touching runtime behavior.

Example command:

```bash
rg --files packages | rg '\.(ts|tsx)$' | xargs wc -l | sort -n
```

Example rule of thumb:

* React component over 350 lines: review for splitting.
* Domain module over 500 lines: review for splitting.
* File with more than 3 major responsibilities: split even if not huge.

Current large-file hotspots include:

```text
packages/web/src/notebook/NotebookCellView.tsx
packages/web/src/notebook/notebookAssistantTools.ts
packages/web/src/notebook/NotebookApp.tsx
packages/web/src/components/dependencyGraphLayout.ts
packages/web/src/app/App.tsx
packages/web/src/components/ResultChart.tsx
packages/web/src/components/EquationGridEditor.tsx
packages/web/src/components/DependencyGraphCanvas.tsx
packages/web/src/notebook/SourceCodeEditor.tsx
packages/web/src/notebook/sourceEditing.tsx
packages/web/src/notebook/notebookAssistantFlow.ts
packages/web/src/notebook/dependencyRows.ts
packages/web/src/notebook/document.ts
packages/web/src/lib/units.ts
packages/web/src/lib/editorModel.ts
packages/chat-api/src/index.ts
```

## 2. Be careful with formatting churn

The workspace currently has `pnpm` scripts for build, test, lint, and typecheck, but no root formatting script. Do not run a repo-wide formatter as part of a behavior-preserving refactor unless formatting tooling is added intentionally in its own PR.

Useful existing commands:

```bash
pnpm typecheck
pnpm test
pnpm web:test:fast
pnpm web:test:integration
pnpm --filter @sfcr/core test
pnpm --filter @sfcr/web test
```

If formatting is desired, make it a dedicated tooling PR:

* Add Prettier or another formatter explicitly.
* Add `format` and `format:check` scripts.
* Run the formatter in that PR only.
* Avoid mixing formatting-only changes with code movement.

---

# Phase 2 - Split Notebook Document Logic

## Problem

`packages/web/src/notebook/document.ts` contains several responsibilities that are easier to test and reason about separately:

* JSON parsing
* Markdown parsing
* notebook serialization
* schema diagnostics
* source location mapping
* typo matching
* path parsing
* slug generation
* normalization

## Proposed structure

Start inside `packages/web` before introducing a new package:

```text
packages/web/src/notebook/document/
  index.ts
  parseNotebookSource.ts
  serializeNotebook.ts
  normalizeNotebook.ts
  jsonNotebook.ts
  markdownNotebook.ts
  diagnostics.ts
  sourceLocation.ts
  schemaPaths.ts
  typoHints.ts
  slugify.ts
```

## Refactor steps

1. Add focused tests around the existing public behavior.
2. Create the new folder.
3. Move pure helper functions first.
4. Keep existing public exports compatible through `document/index.ts` or a compatibility export.
5. Avoid behavior changes in the first PR.
6. Only after the split is stable, consider moving pure modules to a shared package.

## Tests to add or preserve

```text
document.test.ts
  - parses valid notebook JSON
  - rejects invalid notebook JSON with useful diagnostics
  - imports Markdown notebook
  - serializes notebook without losing cells
  - reports line/column for invalid source
  - suggests likely typo for invalid cell fields
```

Relevant validation commands:

```bash
pnpm --filter @sfcr/web typecheck
pnpm --filter @sfcr/web exec vitest run test/SourceCodeEditor.test.ts
pnpm --filter @sfcr/web exec vitest run test/notebookSourceAnalysis.test.ts
pnpm web:test:integration
```

---

# Phase 3 - Split Editor Model Logic

## Problem

`packages/web/src/lib/editorModel.ts` likely mixes:

* editor state types
* runtime model conversion
* validation
* JSON import/export
* number parsing
* unit diagnostics
* defaults

## Proposed structure

```text
packages/web/src/editor-model/
  index.ts
  types.ts
  defaults.ts
  parseEditorJson.ts
  serializeEditorJson.ts
  validateEditorModel.ts
  runtimeAdapter.ts
  numberParsing.ts
  unitDiagnostics.ts
```

## Refactor steps

1. Extract types first.
2. Extract defaults and number parsing.
3. Extract parsing and serialization.
4. Extract validation.
5. Extract runtime conversion.
6. Keep the old import path temporarily with a compatibility export.

Example:

```ts
// packages/web/src/lib/editorModel.ts
export * from "../editor-model";
```

Run targeted tests before widening to broader web tests.

---

# Phase 4 - Extract Assistant and Chat Client Logic

## Problem

Assistant and chat request handling is likely spread across app and notebook views. The largest related hotspots include:

```text
packages/web/src/notebook/notebookAssistantTools.ts
packages/web/src/notebook/notebookAssistantFlow.ts
packages/chat-api/src/index.ts
```

Likely responsibilities currently mixed into UI or route handlers:

* API URL resolution
* request creation
* response typing
* SSE parsing
* streaming state
* error handling
* model defaults
* assistant tool call handling

## Proposed structure

```text
packages/web/src/assistant/
  assistantClient.ts
  sse.ts
  types.ts
  useAssistantStream.ts
  notebookAssistant.ts
  builderAssistant.ts
```

If types or request builders are needed by both `packages/web` and `packages/chat-api`, extract those only after the web-side split is stable.

## Refactor steps

1. Extract low-level SSE parser and tests.
2. Extract typed request/response interfaces.
3. Extract API client functions.
4. Replace inline fetch logic in React components.
5. Extract assistant tool routing only after request/streaming behavior is pinned by tests.

---

# Phase 5 - Split Large React Components

## Target files

Primary targets:

```text
packages/web/src/notebook/NotebookCellView.tsx
packages/web/src/notebook/NotebookApp.tsx
packages/web/src/app/App.tsx
```

Secondary targets:

```text
packages/web/src/components/ResultChart.tsx
packages/web/src/components/EquationGridEditor.tsx
packages/web/src/components/DependencyGraphCanvas.tsx
packages/web/src/notebook/SourceCodeEditor.tsx
```

## Goal

React components should mostly compose hooks and smaller panels. They should not contain parsing, validation, solver orchestration, assistant API logic, or import/export pipelines.

## Suggested hooks

```text
useNotebookRouting.ts
useNotebookSourceEditor.ts
useNotebookImportExport.ts
useNotebookAssistant.ts
useNotebookSelection.ts
useNotebookRun.ts
useNotebookDiagnostics.ts
```

## Suggested component structure

```text
packages/web/src/notebook/components/
  NotebookLayout.tsx
  NotebookToolbar.tsx
  NotebookCellList.tsx
  NotebookCellView.tsx
  NotebookInspector.tsx
  NotebookSourceEditor.tsx
  NotebookDiagnosticsPanel.tsx
  NotebookAssistantPanel.tsx
  NotebookRunPanel.tsx
```

## Refactor steps

1. Extract presentational components first.
2. Extract stateful hooks second.
3. Keep rendering behavior unchanged.
4. Avoid introducing new features during this phase.
5. Use existing tests as guardrails before broadening the split.

For most web component changes, start with:

```bash
pnpm web:test:fast
```

Run integration tests when source editing, notebook navigation, linked cell editing, or assistant flows are affected:

```bash
pnpm web:test:integration
```

---

# Phase 6 - Standardize the Import/Export Pipeline

## Goal

Make the existing JSON and Markdown flows consistent without adding new source formats during the refactor.

Current notebook source editing supports JSON and Markdown. YAML support was previously removed, so YAML/TOML/TypeScript templates should be treated as future product decisions rather than refactor scope.

## Proposed pipeline

```text
source text
  -> detect format
  -> parse
  -> normalize
  -> validate
  -> preview diagnostics
  -> apply to notebook state
  -> serialize/export
```

## Proposed files

```text
packages/web/src/notebook/io/
  detectFormat.ts
  parseSource.ts
  serializeSource.ts
  formats/
    json.ts
    markdown.ts
```

Design the format interface so future formats can be added later, but do not add placeholder YAML/TOML/TypeScript implementations until there is a product requirement and tests.

Potential future formats:

| Format     | Possible role                | Refactor status |
| ---------- | ---------------------------- | --------------- |
| JSON       | canonical storage            | in scope        |
| Markdown   | readable notebook docs       | in scope        |
| YAML       | human-editable templates     | future decision |
| TOML       | compact config-like models   | future decision |
| TypeScript | developer-authored templates | future decision |

---

# Phase 7 - Consider a Shared Notebook Package

## Problem

Some notebook logic may not be web-specific:

* notebook schema validation
* notebook normalization
* dependency graph generation
* model section extraction
* matrix validation
* cell classification
* source parsing
* serialization

## Recommendation

Do not create `packages/notebook-core` as the first step. First extract pure modules inside `packages/web`, keep behavior stable, and prove the boundaries with tests. Create the package only after the extracted modules are clearly reusable by `packages/chat-api`, future CLI tools, or future converters.

Possible package shape:

```text
packages/notebook-core/
  src/
    document/
    schema/
    matrices/
    dependency/
    validation/
    classification/
    io/
```

Package purpose:

```text
@sfcr/notebook-core contains pure notebook logic reusable by:
  - browser app
  - tests
  - Cloudflare chat API
  - future CLI tools
  - future notebook converters
```

Boundary rule:

```text
notebook-core must not import:
  - React
  - DOM APIs
  - browser storage
  - CSS
  - UI components
  - Cloudflare-specific APIs
```

---

# Phase 8 - Add Architectural Tests

## Add dependency boundary checks

Use a tool such as:

* `dependency-cruiser`
* `eslint-plugin-boundaries`
* custom TypeScript path rules

## Example rules

```text
packages/core must not import packages/web
packages/core-worker must not import packages/web
packages/chat-api must not import React
packages/web components should not import solver internals directly when a core/core-worker adapter exists
packages/notebook-core must not import React if that package is introduced
```

Add these after the first few splits, when there is enough structure for the rules to enforce.

---

# Phase 9 - Improve Test Coverage Around Risky Logic

## High-priority tests

```text
notebook parsing
notebook serialization
source diagnostics
matrix validation
balance matrix row sums
transaction matrix row sums
dependency graph generation
stock/flow classification
unit diagnostics
assistant request formatting
SSE stream parsing
worker solver calls
```

## Useful test categories

```text
unit tests         pure functions
integration tests  notebook parse -> run -> display data
snapshot tests     notebook JSON serialization where stable
fixture tests      real templates from packages/web/public/notebook-examples
```

Keep tests close to the module being extracted. Add broad integration tests only when the extraction crosses app flows or package boundaries.

---

# Suggested PR Sequence

## PR 1 - File-size report and refactor guardrails

* Add a large-file report script.
* Document target hotspots.
* Do not run a repo-wide formatter unless formatting tooling is the whole PR.
* No behavior changes.

## PR 2 - Split `document.ts`

* Extract parsing, serialization, diagnostics, and utilities.
* Keep exports compatible.
* Add or preserve focused tests.

## PR 3 - Split `editorModel.ts`

* Extract types, defaults, validation, runtime adapter, JSON import/export, number parsing, and unit diagnostics.
* Keep the old import path temporarily.

## PR 4 - Extract assistant client and stream parsing

* Add shared SSE parser.
* Add typed assistant API client.
* Replace duplicate fetch and streaming code.
* Keep assistant tool behavior unchanged.

## PR 5 - Split notebook React views

* Start with `NotebookCellView.tsx` and `NotebookApp.tsx`.
* Extract presentational components and hooks.
* No behavior changes.

## PR 6 - Split remaining large web components

* Address `App.tsx`, `ResultChart.tsx`, `EquationGridEditor.tsx`, `DependencyGraphCanvas.tsx`, and `SourceCodeEditor.tsx` as separate focused PRs where possible.

## PR 7 - Standardize JSON and Markdown import/export

* Create a single pipeline for detection, parsing, normalization, validation, diagnostics, and serialization.
* Keep YAML/TOML/TypeScript out of scope unless product requirements are added.

## PR 8 - Consider `packages/notebook-core`

* Move proven pure notebook logic out of `packages/web` only after the boundaries are clear.
* Update imports.
* Add dependency boundary checks.

## PR 9 - Add classification and diagnostics layer

* Add stock/flow classification.
* Add unit checks.
* Add matrix consistency hints.
* Treat this as behavior/product work, not just refactoring.

---

# Final Target Architecture

```text
packages/
  core/
    solver and SFC runtime

  core-worker/
    web worker wrapper for solver

  notebook-core/        optional, after extraction proves the boundary
    notebook schema, parsing, validation, matrices, dependency graph

  web/
    React UI, view state, browser interactions, and adapters

  chat-api/
    assistant backend and tool routing
```

The refactor should move from concrete to abstract: split and test existing modules first, then introduce shared package boundaries only when the extracted code has proven it belongs outside `packages/web`.
