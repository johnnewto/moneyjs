# AGENTS.md

## Project Focus
This repository is browser-first and TypeScript-first.

Default implementation targets:
- `packages/web`
- `packages/core`
- `packages/core-worker`

The `references/` directories are not the default place to make changes. Use them for parity checks, migration reference, and historical behavior only.

## Architecture
The active architecture is split across three TypeScript packages:
- `packages/core`: solver engine, model runtime, and domain logic
- `packages/core-worker`: worker-facing wrapper around `@sfcr/core`
- `packages/web`: browser UI, editor flows, and result presentation

Preferred dependency direction:
- `packages/web` -> `packages/core-worker` and `packages/core`
- `packages/core-worker` -> `packages/core`
- `packages/core` should remain independent of browser UI concerns

Keep solver and model semantics in `packages/core`. Keep worker transport and browser-thread boundary code in `packages/core-worker`. Keep React UI, view state, and user interaction logic in `packages/web`.

## Working Rules
- Prefer the smallest change that solves the task.
- Keep new product work in the TypeScript packages unless a task explicitly requires reference-code investigation.
- When changing solver behavior, consider whether the change should be checked against the Java or R references.
- Preserve existing package boundaries unless the task requires moving responsibilities.

## Commands
Run commands from the repository root unless there is a specific reason not to.

Common commands:
- `pnpm dev`
- `pnpm web:dev`
- `pnpm build`
- `pnpm web:build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @sfcr/core test`
- `pnpm --filter @sfcr/web test`
- `pnpm --filter @sfcr/web exec vitest run test/<file>.test.tsx`

## Validation
- After code changes, run the most relevant checks for the affected package.
- For changes that cross package boundaries, run workspace `typecheck` and `test`.
- If a task affects browser behavior, prefer validating through the web app path rather than only the references.
- For narrow `packages/web` validation, prefer direct Vitest execution such as `pnpm --filter @sfcr/web exec vitest run test/AssistantMarkdown.test.tsx` instead of routing through the package `test` script.
- For CSS-only or small component-only changes in `packages/web`, run the smallest related test file first, then widen only if the change touches shared UI infrastructure.

## Reference Code
Use `references/java/` and `references/r-sfcr/` for:
- parity checks
- legacy behavior lookup
- migration guidance

Do not treat reference implementations as the default runtime target unless the task explicitly asks for that.

## Notes For Agents
- Favor edits in the active TypeScript packages over reference implementations.
- If behavior is copied or inferred from reference code, state that clearly.
- Avoid broad refactors unless they are requested or required by the change.
