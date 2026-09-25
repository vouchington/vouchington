Review Vitest tests. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Run the relevant local Vitest test more than once when investigating reliability. When it depends
  on PostgreSQL or Valkey state, run it in freshly cleaned state and again without cleaning first.
  After `pnpm run db:clean`, run `pnpm run db:migrate` before the clean-baseline test when PostgreSQL
  is involved. The cohort steps below are PostgreSQL-specific; use workload-specific isolation for
  Valkey.
- For PostgreSQL aggregate, unscoped-list, or cleanup-count tests, create or retain a separately
  randomized, unrelated fixture cohort, then rerun without cleaning. Assert test-owned IDs or
  contribution deltas. When the query is intentionally global, assert the unrelated cohort's
  expected inclusion separately rather than treating its rows as leakage. For cleanup tests, assert
  the unrelated cohort still exists after cleanup.
- Treat cohort interference as leakage only when it changes the test-owned contribution, removes
  unrelated rows during ownership-scoped cleanup, or fails a cohort-independent assertion. Trace
  each leaked row to the fixture or test that created it, fix the query scoping or cleanup boundary,
  and record the required isolation invariant in its owning reference doc or nearest `CLAUDE.md`
  using the follow-up durability rule below. Do not mask the leak with broad cleanup, indiscriminate
  reruns, or timeout increases.
- Find any failures and make them more reliable.
- Find opportunities to make tests faster or leaner.
- Review `--coverage` reports and add tests for increased coverage.
- Review CLAUDE.md and README.md files for any incongruence between tests and requirements.
- Avoid increasing a per-test or per-file timeout to paper over a real failure; the global
  `teardownTimeout: 20_000` in `vitest.config.mts` is a deliberate, already-justified exception that
  bounds teardown across all pool types, not a precedent for further timeout increases.
- Prefer creating new entities in the test instead of reusing entities.
- Use randomized IDs to avoid conflicts.
- If a prior PR's `## Follow-ups` section named a specific follow-up action, verify the owning
  reference doc or a `CLAUDE.md` actually records it (`git log` on the prior fix commits, then
  grep those files) before landing another attempt at the same signature; report and durably
  document any missing follow-up there. Do not block the test fix on filing a GitHub issue —
  this prompt has no issue-publication path.
- Avoid unnecessary mocking, especially internal service calls that can be exercised directly.
- Before proposing a fix for a recurring failure signature, check whether it already recurred:
  `git log` / `git blame` on the failing test file, `vitest.config.mts`, and
  `test-helpers/vitest-config/**`. A signature with
  multiple prior patches needs the fix that closes the pattern, not another partial instance of it.
- Honor a documented stopping condition before opening a new instrumentation pass. If
  [Vitest Worker Exit Diagnostics § Stopping condition](../../development/reference-vitest-worker-exit-diagnostics.md#stopping-condition)
  already names this signature and its condition is met, perform the escalation it names instead of
  adding another diagnostic pass.
- For a post-assertion worker exit (the test passes, then its worker crashes during teardown),
  consult the `signature → cause` table in
  [Vitest Worker Exit Diagnostics](../../development/reference-vitest-worker-exit-diagnostics.md).
  The `[vitest-fork-exit]` sentinel's _absence_ from a crash's own log is diagnostic only when the
  failing project actually registers `test-helpers/vitest.setup.fork-exit-sentinel.mts` in its
  `setupFiles` — currently only `backend-data-projects.mts`'s sub-projects and the
  `backend-real-glide-mq` project in the root `vitest.config.mts` do; `backend-core-projects.mts`,
  `web-projects.mts`, and `tooling-projects.mts` never register it, so a missing sentinel line
  there is not evidence of anything. Check per-shard RSS/heap and the `[vitest-teardown]` /
  `[vitest-teardown-overrun]` output before assuming a leak regardless. The
  Per-project `pool` / `isolate` values are recorded in
  [Pools, Isolation, and Vitest 5](../../development/reference-tests-vitest-projects.md#pools-isolation-and-vitest-5).
  Forks-pool projects have no per-project `poolOptions` / `maxForks` / `singleFork`; concurrency is
  bounded only by the repository-owned `VITEST_MAX_WORKERS` environment policy via
  `parseVitestMaxWorkers()`, and
  `dev/vitest-config.test.mts` bans a hardcoded `maxWorkers` literal.
- Record any deferred follow-up in the owning reference doc or a `CLAUDE.md`, not only in a PR body
  or issue comment — a PR body is exactly what a later scheduled run cannot read.
