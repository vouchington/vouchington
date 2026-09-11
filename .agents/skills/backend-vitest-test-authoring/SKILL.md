---
name: backend-vitest-test-authoring
description: Use when adding or changing backend tests, test fixtures, backend test helpers, integration boundaries, provider mocks, database or Valkey setup, or Vitest project selection.
---

# Backend Vitest Test Authoring

## Canonical skill (required)

Claude Code and Codex load `vouchington-testing:backend-vitest-test-authoring`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/backend-vitest-test-authoring/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Read the nearest backend `CLAUDE.md`, then
[`vitest-test-authoring`](../vitest-test-authoring/SKILL.md) for the shared mock-boundary and
naming contract, and [`docs/development/tests.md`](../../../docs/development/tests.md) for project
selection, parallel safety, and validation commands. Use
[`backend/test-helpers/README.md`](../../../backend/test-helpers/README.md) for entity-listener,
fixture, and dirty-database patterns.

1. Add test-case stubs first and select the exact owning Vitest project from the documented project
   name reference.
2. Exercise real PostgreSQL, Valkey, queue, worker, and internal service boundaries. Put reusable
   setup/assertion operations in `backend/test-helpers`; never import raw SQL from a backend test.
3. Randomize persistent fixtures with the shared helpers, register concurrent listener waits before
   mutations, and make assertions safe on a dirty, parallel database.
4. Mock only external provider boundaries — see
   [`vitest-test-authoring`](../vitest-test-authoring/SKILL.md) for the exact boundary and naming
   rules.
5. Run the exact file in its owning project before broader backend validation. If DB/Valkey setup is
   missing, follow [`local-site-testing`](../local-site-testing/SKILL.md) instead of bypassing the
   integration boundary.
6. Never reset rate-limit counters with instance or static `RateLimiter.invalidate()` in a test — it
   wipes every concurrent fork's counters, not just yours. Prefer a fresh request/session/IP that
   needs no cleanup. For fixed identities, derive exact owned keys through the production key
   builder and delete only those keys; route tests use `deleteRouteRateLimitKeys()`. See
   [tests.md § Rate-limiter cleanup](../../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#rate-limiter-cleanup-must-be-ownership-scoped-never-prefix-wide).
7. Wrap a non-decaying (future-dated or permanently top-scoring) fixture in
   `withDominantPostFixtures()` so it is cleaned up even when the test fails. See
   [tests.md § Persistent dominant fixtures](../../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#persistent-dominant-fixtures-require-deterministic-cleanup).
8. A compiler-backed contract test must reuse the memoized `loadBackendProgram()` or build one
   `buildVirtualProgramMatrix(import.meta, sources)` per test file, and use the matching
   constant from `cold-build-budget.mts`, never a new local timeout constant. Do not wrap matrix
   construction in another API-fixture helper; the consuming test owns its direct `beforeAll`
   build. Every derived cache backed by `loadBackendProgram()` must call it before its own cache
   lookup and scope cached results to the returned opaque generation; this preserves one shared
   program while inputs are fresh and atomically invalidates all derived results after the tracked
   CompilerHost's source, config/root, package metadata, failed lookup, directory, or realpath graph
   changes. See
   [tests.md § Compiler-backed contract tests](../../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#compiler-backed-contract-tests).
9. An EXPLAIN assertion against the shared `backend-data-stores` database must pass
   `explainCapturedTestQuery` a `PlanStatisticsRefresh` that `ANALYZE`s every relation in the plan,
   including join partners, not just the table under test; prefer the isolated `explain-analyze`
   scenario suite for new plan-shape gates. See
   [tests.md § Query-plan (EXPLAIN) assertions](../../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#query-plan-explain-assertions).
10. Apply the [Test Value and Safe Reduction](../../../docs/development/reference-tests-value-and-reduction.md) gate; do not duplicate an invariant already owned by a lower-cost realistic boundary.
