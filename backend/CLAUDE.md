# Voucha Server

The server for Voucha, consisting of a server and a worker. Architecture reference: [README.md](README.md),
local setup: [../docs/development/BACKEND-SETUP.md](../docs/development/BACKEND-SETUP.md),
auth/session reference: [../docs/overview/architecture/auth-overview.md](../docs/overview/architecture/auth-overview.md).
Package inventories live in [catalogs/README.md](catalogs/README.md).

## Commands

See [README.md § Commands](README.md#commands) for the full command catalog: lint/format/typecheck/test targets, EXPLAIN ANALYZE profiling, and db:migrate/db:clean recovery.

## Module Structure

- Each file should have a single purpose. Split files with multiple complex business logic functions.
- Define functions from high-level to low-level, with utility functions at the bottom. Main exports (e.g. a class) at the top, utility functions at the bottom. When possible, move utilities to the `modules/utils` module.
- Use the latest Node.js features. Avoid adding package dependencies when Node.js natively supports the feature.

## Rules

- Before exposing API fields, check caller class: anon, user, owner, moderator, staff, admin. Keep internal/admin fields out of lower-privilege responses.
- Before creating a service or editing its manifest, load the [package-json-checklist skill](../.agents/skills/package-json-checklist/SKILL.md).
- Vote/election rules: [services/elections-votes/CLAUDE.md](services/elections-votes/CLAUDE.md).
- Every database-backed list must use cursor pagination through `@modules/pagination`; follow the [cross-surface contract](../docs/overview/architecture/pagination.md). Cap anonymous endpoints with `clampAnonLimit` (`ANON_MAX_LIMIT = 25`).
- When multiple writes must commit atomically, use `await using transaction = await beginTransaction()` from `@data-stores/psql`, call `await transaction.commit()` only after the writes succeed, and pass `{ query: transaction }` to nested helpers. Pass a selected pool or borrowed idle client to `beginTransaction({ client })`; keep `withTransactionOptions` only for joining a client that is already inside a transaction.
- Before adding or changing backend tests, fixtures, helpers, or mocks, load the [backend-vitest-test-authoring skill](../.agents/skills/backend-vitest-test-authoring/SKILL.md).
- Never persist raw bearer secrets, OAuth/social tokens, TOTP secrets, or OTP codes. Use `@modules/token-secrets`.
- Never call `process.exit()` or `process.kill()` in runtime code — use `addGracefulShutdownCallback()`. Forced-exit fallbacks: `setTimeout(() => process.exit(1), delay).unref()`. See [graceful shutdown](../docs/overview/architecture/graceful-shutdown.md).
- Avoid calling external APIs in a loop or unbounded `Promise.all()`. Move independent calls to jobs and load the [voucha-queue-authoring skill](../.agents/skills/voucha-queue-authoring/SKILL.md).
- Handle all errors with `onError` from `@modules/on-error`, `http-assert`/`http-errors`, and `.cause` when re-creating errors.
- Sanitize external content with `sanitizePromptInjection()` and `wrapExternalContent()` from `@jongleberry/vurst-prompt`. See [AI agents](../docs/overview/architecture/ai-agents.md#prompt-injection-protection).
- Prefix Node imports with `node:` (e.g. `node:fs`). There is no build process.
- The backend TS program must never load `lib.dom`: never import `vitest/config` (or anything reaching it) from `backend/**`, even type-only — it silently defers `fetch`/`Response`/`setTimeout` to DOM types. Enforced by `backend/types/lib-dom-absent.mts`; mechanism: [reference-tests-linters-and-static-analysis.md](../docs/development/reference-tests-linters-and-static-analysis.md).
- Backend `fetch` must import from `'undici'` and use `@modules/utils/http-dispatchers`. SSRF crawler fetches use `@modules/utils/http`. Dispatcher and timeout classification: [runtime-timeouts.md](../docs/development/runtime-timeouts.md).
- Prefer streams/`for-await`/`AsyncGenerators`. Do not buffer large content.
- Create a barrel file at `index.mts`.
- Avoid function overloading. Prefer named functions over arrow functions or `const`. Prefer early returns.
- If a function needs the current user, `currentUser` or `currentUserId` is the first parameter. Prefixes: [typescript-standards.md](../docs/overview/architecture/typescript-standards.md#function-naming-prefixes).
- Put each direct external API call in its own function tagged `/* no-mistakes: integration=<provider> */`. Analyzer exceptions: [Vitest Mock Typing](../docs/development/tests.md#vitest-mock-typing).
- New generic utilities belong in `backend/modules/` (`@modules/foo`). Do not create `backend/lib/`.
- Import Valkey per-concern packages documented in [data-stores/valkey/CLAUDE.md](data-stores/valkey/CLAUDE.md); do not route pub/sub, rate limiting, or GlideMQ through `@data-stores/valkey`.
- When removing or renaming finite enum values, follow [Finite Enum Ripple Checklist](../docs/development/finite-enum-ripple-checklist.md) before first push.
- Backend must not know frontend routes. Return structured entity references; the frontend resolves URLs via `web/lib/links/entity-href.ts`.

## Entity Anatomy Sync

When changing an entity's fields, lifecycle states, or DB schema, keep `docs/requirements/anatomy/<entity>.md` in sync with [Entity × Action Matrix](../docs/requirements/ENTITY-ACTION-MATRIX.md) and [Entity × Lifecycle Flow Matrix](../docs/requirements/ENTITY-LIFECYCLE-MATRIX.md).

## Topic Lifecycle States

Canonical predicates, merge semantics, active-topic SQL filters, and the `topic_type` vs. facet rule live in [TOPICS.md](../docs/requirements/content/TOPICS.md#topic-aliases-source-metadata-categories-lifecycle-states-and-related) and [Topic Types](../docs/requirements/content/reference-topics-topic-types.md#type-vs-facet). Update those pages in the same PR. Raw `topics` queries that omit either filter silently include merged or soft-deleted rows.

## See Also

- [README.md](README.md) — commands, related workspace links
- [catalogs/README.md](catalogs/README.md) — package inventories
- [Markdown content](md/README.md)
- [PostgreSQL](data-stores/psql/CLAUDE.md)
- [Services](services/CLAUDE.md)
- [API routes](api/CLAUDE.md)
- [Queues](queues/CLAUDE.md)
