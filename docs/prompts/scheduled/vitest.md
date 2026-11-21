Improve Vitest reliability and speed. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one Vitest project or test folder.

Load `test-authoring`, `testing-rules`, and `vouchington-backend-tests`. Focus: flakiness, isolation, and performance. Deletion belongs to [test-pruning.md](test-pruning.md); mock replacement to [backend-real-tests.md](backend-real-tests.md).

- Run the relevant test more than once. For PostgreSQL or Valkey state, run it freshly cleaned (`pnpm run db:clean`, then `pnpm run db:migrate`) and again without cleaning, with a separately randomized unrelated fixture cohort. Assert test-owned IDs or contribution deltas; trace any leaked row to its creator and fix the scoping or cleanup boundary, not with broad cleanup, blind reruns, or timeout increases.
- Do not raise per-test timeouts (the global `teardownTimeout: 20_000` in `vitest.config.mts` is a justified exception, not a precedent). Terminal-event waits in helpers need their own bounded deadline with a named failure.
- Before fixing a recurring failure signature, check `git log` and blame on the test, `vitest.config.mts`, and `test-helpers/vitest-config/**`; several prior patches need a fix that closes the pattern. Record deferred follow-ups in the owning reference doc or `AGENTS.md`, not only a PR body.
- Do not add worker-exit instrumentation; those diagnostics were removed until a hosted exit is reproduced. For a post-assertion `Worker exited unexpectedly`, check per-shard RSS/heap and `[vitest-teardown-overrun]` output first (`[vitest-teardown]` markers need `VITEST_DIAGNOSTICS=1`). Pool and isolation values: [Pools, Isolation, and Vitest 5](../../development/reference-tests-vitest-projects.md#pools-isolation-and-vitest-5); forks concurrency is bounded only by `VITEST_MAX_WORKERS` via `parseVitestMaxWorkers()`.
