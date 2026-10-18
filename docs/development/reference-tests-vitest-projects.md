# Vitest Projects

[Back to Tests and Checks](tests.md#vitest-projects)

Project definitions live in `test-helpers/vitest-config/*`; the root `vitest.config.mts` composes them. This page records the constraints behind them.

## Concurrency

Never set `fileParallelism: false` or a literal `maxWorkers` in a Vitest config (`dev/vitest-config.test.mts` enforces this). Vitest applies the repository-owned `VITEST_MAX_WORKERS` policy after merging project config and overwrites both knobs, so neither works per project. A test that cannot run in parallel is fixed, not quarantined behind a worker pin: assert properties scoped to owned rows (randomized ids, prefix matching) instead of a global snapshot of shared state. A `sequence.groupOrder` barrier remains available for the rare case that genuinely cannot be made parallel-safe.

## Timeouts

Every project declares an explicit `testTimeout` and `hookTimeout`, within the [suite hard cap](tests.md#test-suite-rules). An override belongs on the measured slow case, not on the whole project.

A test that spawns a child process with its own timeout keeps that timeout strictly below its project's `testTimeout`, and reports the child's signal and timeout state instead of coercing a kill into a generic failure; use `runProcess` from `dev/test-helpers/run-process.mts`.

A first exec of a freshly written executable is expensive on macOS, especially under full-suite load, while re-execing it is cheap. A harness that writes fresh fake executables per test can burn a child's timeout budget under load. Build and warm one set of fakes per file in `beforeAll` and hand each test a symlink (`dev/test-helpers/tmux-fake-bin.mts`).

## Project grouping

Root scripts call `ci/run-vitest-project-group.mts`, whose typed catalog local coverage also uses. Keep durable scripts project-based. A helper test that inspects live database pools belongs to `backend-data-stores`, not `backend-test-helpers`, so that importing a helper never initializes PostgreSQL by accident.

## Queue shim and the real transport

Backend projects alias `glide-mq` to an inline test shim whose drain is event-driven with a bounded watchdog below the test budget. Its in-memory state and deduplication do not establish production transport ordering or retry-backoff timing: assert production queue options directly and use integration tests for transport behavior. `backend-real-glide-mq` is the narrow exception for a transport contract the shim cannot establish. It runs only `*.real-glide.mock.test.mts` against the worktree Valkey under an isolated key prefix and random queue names, so it cannot consume jobs from the worker fleet or a concurrent run.

## Pools, Isolation, and Vitest 5

Keep per-project `pool` and `isolate` explicit; Vitest diagnostics hints never suggest changing an explicit option. `pool: 'threads'` is not a drop-in for the `isolate: false` backend projects because `valkey-glide` NAPI and PostgreSQL pools do not belong in `worker_threads`. Shared-fork leak rules are in [Parallel-Safety](reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files). Do not enable further Vitest knobs because a blog table or `vitest doctor` says they are faster; enable one only when a specific project's `Duration` line shows the matching phase dominating.

Tooling setup files apply their environment to `process.env` in place (`replaceEnvInPlace`, `ci/tooling-test-env.mts`). Never reassign `process.env` in a setup file: `vi.stubEnv` unsets variables with `delete` on the original object, so a replacement object leaks stubbed variables between tests.

### Contents

- <a id="explain-test-selection-and-vitest-ownership"></a>[Explain Test Selection and Vitest Ownership](reference-explain-test-selection-and-vitest-ownership.md)
- <a id="dynamicconfig-cleanup"></a>[DynamicConfig Cleanup](reference-dynamicconfig-cleanup.md)
- <a id="project-name-reference"></a>[Project Name Reference](reference-project-name-reference.md)
