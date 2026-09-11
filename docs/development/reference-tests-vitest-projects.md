# Vitest Projects

[Back to Tests and Checks](tests.md#vitest-projects)

Never set `fileParallelism: false` or a literal `maxWorkers` in a Vitest config. Both are enforced
by `dev/vitest-config.test.mts`, and the root config explicitly keeps file parallelism on. Neither
knob actually works per-project: vitest reads the `VITEST_MAX_WORKERS` repo variable _after_ merging
project config and unconditionally overwrites both `fileParallelism: false` (which is itself
implemented internally as `maxWorkers = 1`) and any explicit `maxWorkers`. Concurrency is bounded
only by `VITEST_MAX_WORKERS` — set it via `parseVitestMaxWorkers()` /
`parseStorybookBrowserMaxWorkers()` (`test-helpers/vitest-config/environment.mts`), never a literal.
A test that cannot run in parallel with the rest of its suite needs to be fixed, not quarantined
behind a worker pin: assert properties scoped to the rows the test owns (randomized IDs, prefix
matching) instead of a global snapshot of shared state. A `sequence.groupOrder` sequential barrier
remains available for the rare case that genuinely cannot be made parallel-safe.

Every project must declare an explicit `testTimeout` and `hookTimeout`, enforced by
`dev/vitest-config.test.mts`. Without an explicit value, a project silently falls back to Vitest's
built-in `5000`/`10000` ms defaults — invisible at the project's definition site, and how
`ts-shared` broke `main` twice (#10762). The root config sets a `15_000`/`30_000` backstop, but that
is only a safety net for a project added between edits; it does not exempt any project from
declaring its own values. Start a new project at `15_000`/`30_000` and raise it only with a
demonstrated failure, documented with a one-line comment (see `toolingTestBudget` in
`test-helpers/vitest-config/tooling-projects.mts`) — never above the ceilings of `60_000` ms
(`testTimeout`) / `90_000` ms (`hookTimeout`) that the same guard file enforces. A single genuinely
slower test takes a per-test `{ timeout: ... }` override instead of raising its whole project's
budget, so one slow test doesn't mask a regression in every other test in that project.

Run any single project directly: `pnpm exec vitest run --project <name>`.

Reusable root scripts call [`ci/run-vitest-project-group.mts`](../../ci/run-vitest-project-group.mts), whose typed catalog is also used by local coverage. The runner starts one Vitest process for the selected projects and removes exactly one leading separator inserted by `pnpm run`, so both `pnpm run test:backend:default -- <files>` and forwarded Vitest flags work. Keep durable scripts project-based; filename lists are appropriate only for one-off local commands.

`pnpm run test:backend:modules` runs the Docker-free backend group: local analytics, modules,
`backend-no-data-mocks`, test helpers, and email templates. `pnpm run test:backend:docker` runs the
PostgreSQL/Valkey-backed analytics integration, data-store, and remaining mock projects. The
aggregate backend groups compose both sets.

Do not force a reporter for local Vitest runs; Vitest's default reporter behavior automatically uses `minimal` when it detects an AI coding agent. CI reporter wiring lives in `vitest.config.mts` and is activated by workflow env vars.

Backend Vitest projects alias `glide-mq` to an inline test shim. The shim drain waits for flushed
jobs to reach a terminal state with a bounded wall-clock timeout. Nested `Queue.add` calls from
inside a shim Worker processor enqueue and kick the child queue without waiting, matching
production. The shim still does not honor delay, deduplication, or ordering semantics, so tests
must assert production queue options directly and use integration tests for processor and
data-flow behavior.

`backend-real-glide-mq` is the narrow exception for a transport contract that cannot be established
with the shim. It runs only `backend/**/*.real-glide.mock.test.mts` against the worktree Valkey with the
actual `glide-mq` package. Its setup uses GlideMQ's isolated `voucha_qdb_15` key prefix plus a
random queue-name suffix, so it cannot consume or obliterate
jobs from the worktree worker fleet or a concurrent invocation. Run it explicitly with
`pnpm exec vitest run --project backend-real-glide-mq`; do not remove the shim from the normal
backend projects.

### Contents

- <a id="explain-test-selection-and-vitest-ownership"></a>[Explain Test Selection and Vitest Ownership](reference-explain-test-selection-and-vitest-ownership.md)
- <a id="dynamicconfig-cleanup"></a>[DynamicConfig Cleanup](reference-dynamicconfig-cleanup.md)
- <a id="project-name-reference"></a>[Project Name Reference](reference-project-name-reference.md)
- <a id="vitest-worker-exit-diagnostics"></a>[Vitest Worker-Exit Diagnostics](reference-vitest-worker-exit-diagnostics.md)
