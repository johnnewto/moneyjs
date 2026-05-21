# AGENTS.md

## Project Focus
This repository is browser-first and TypeScript-first.

Default implementation targets:
- `packages/web`
- `packages/core`
- `packages/core-worker`
- `packages/notebook-core`
- `packages/chat-api` (Cloudflare Worker for chat builder; separate from main app build)

The `references/` directories are not the default place to make changes. Use them for parity checks, migration reference, and historical behavior only.

Use Node.js 22 or newer (see `.nvmrc`). Run commands from the repository root unless there is a specific reason not to.

## Architecture
The active architecture is split across TypeScript packages:
- `packages/core`: solver engine, model runtime, and domain logic
- `packages/core-worker`: worker-facing wrapper around `@sfcr/core`
- `packages/notebook-core`: notebook document format, schema, YAML/JSON parsing, validation (no UI)
- `packages/web`: browser UI, editor flows, notebook presentation, and result display
- `packages/chat-api`: serverless chat-builder API (OpenAI proxy); browser uses `VITE_CHAT_BUILDER_API_URL`

Preferred dependency direction:
- `packages/web` -> `packages/core-worker`, `packages/notebook-core`, and `packages/core`
- `packages/core-worker` -> `packages/core`
- `packages/notebook-core` -> `packages/core`
- `packages/core` should remain independent of browser UI concerns

Keep solver and model semantics in `packages/core`. Keep worker transport and browser-thread boundary code in `packages/core-worker`. Keep notebook schema and document transforms in `packages/notebook-core`. Keep React UI, view state, and user interaction logic in `packages/web`.

## Working Rules
- Prefer the smallest change that solves the task.
- Keep new product work in the TypeScript packages unless a task explicitly requires reference-code investigation.
- When changing solver behavior, consider whether the change should be checked against the Java or R references.
- Preserve existing package boundaries unless the task requires moving responsibilities.
- Do not edit `packages/*/dist/` or hand-edit pilot `templates/generated/*.json`; regenerate from YAML (see Notebook Templates).

## Notebook Templates
Pilot notebook templates use YAML as source of truth:
- Source: `packages/web/src/notebook/templates/<id>.notebook.yaml`
- Generated (checked in): `packages/web/src/notebook/templates/generated/<id>.notebook.json`
- Pilot IDs: `bmw`, `sim`, `werner_quantity_theory_credit`, `werner_qtc_explainer`

After editing pilot YAML:

```bash
pnpm --filter @sfcr/web compile:notebook-yaml -- --write
```

Adding a template requires the YAML file, an entry in `packages/web/src/notebook/templates.ts` (`?raw` import + `NOTEBOOK_TEMPLATES`), and relevant tests. File names use underscores; TypeScript `NotebookTemplateId` values use hyphens (e.g. file `werner_quantity_theory_credit.notebook.yaml` → id `"werner-quantity-theory-credit"`).

Do not treat `packages/web/src/notebook/templates/legacy_json/` as source of truth.

## Notebook Schema
Canonical schema for validation: `packages/notebook-core/src/sfcr-notebook.schema.json`.

When the public notebook contract changes, also update `packages/web/public/sfcr-notebook.schema.json` (used by AI clients and evals).

After `packages/notebook-core` edits, run:

```bash
pnpm --filter @sfcr/notebook-core run check:boundaries
```

## Commands
Common commands:
- `pnpm dev`
- `pnpm web:dev`
- `pnpm build`
- `pnpm web:build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm web:test:fast`
- `pnpm web:test:integration`
- `pnpm --filter @sfcr/core test`
- `pnpm --filter @sfcr/web test`
- `pnpm --filter @sfcr/web exec vitest run test/<file>.test.tsx`
- `pnpm --filter @sfcr/web compile:notebook-yaml -- --write`
- `pnpm --filter @sfcr/notebook-core run check:boundaries`

## Validation
- After code changes, run the most relevant checks for the affected package.
- For changes that cross package boundaries, run workspace `typecheck` and `test`.
- If a task affects browser behavior, prefer validating through the web app path rather than only the references.
- For most `packages/web` changes, prefer `pnpm web:test:fast` during iteration. It covers the broad non-notebook-integration suite quickly.
- Run `pnpm web:test:integration` when changes affect notebook source import/export, linked cell editor behavior, or notebook navigation/inspection flows.
- For narrow `packages/web` validation, prefer direct Vitest execution such as `pnpm --filter @sfcr/web exec vitest run test/AssistantMarkdown.test.tsx` instead of routing through the package `test` script.
- For focused `packages/web` Vitest runs that are DOM-heavy or likely to emit large failure output, prefer `--reporter=dot` on the first run to improve terminal output reliability.
- For CSS-only or small component-only changes in `packages/web`, run the smallest related test file first, then widen only if the change touches shared UI infrastructure.
- `packages/core-worker` has compile-only tests in-package; worker protocol behavior is tested from `packages/web/test/workerHandler.test.ts`.

## Reference Code
Use `references/java/` and `references/r-sfcr/` for:
- parity checks
- legacy behavior lookup
- migration guidance

Do not treat reference implementations as the default runtime target unless the task explicitly asks for that.

## Cursor Rules
File-scoped agent rules live in `.cursor/rules/` (`.mdc` files). They complement this document with package-specific guidance when matching files are open.

## Notes For Agents
- Favor edits in the active TypeScript packages over reference implementations.
- If behavior is copied or inferred from reference code, state that clearly.
- Avoid broad refactors unless they are requested or required by the change.
- No ESLint or Prettier in this repo; rely on `tsc --noEmit` and Vitest/turbo tasks.
