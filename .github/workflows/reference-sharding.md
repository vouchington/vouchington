# Sharding

[Back to Workflow Authoring Reference](AUTHORING.md#sharding)

Shard jobs so every leaf job targets around 8 minutes. 10 minutes is a hard performance ceiling.
These are performance budgets monitored by the scheduled issue audit, never `timeout-minutes`
values or CI failure thresholds. The repo favors fewer, longer-running shards over many short ones:
build/startup overhead is fixed per shard, so splitting further than this buys little wall-clock
time while burning more runner capacity.

Playwright workflow runs are serialized per PR/ref to avoid overlapping suites for the same branch,
but the matrix shards inside a single run remain parallel. The root CI job waits for application
Vitest jobs to settle before dispatching Playwright; that outer dependency debounces scarce runner
allocation without serializing either Playwright matrix or making an upstream test failure suppress
the browser suites.

Vitest's ownership registry owns each file-count policy. PR-selected and promoted-full jobs emit
`shard_total_override = ceil(fileCount / filesPerShard)` (GitHub matrix max 256). Otherwise the
reusable workflow counts the checked-out live suite after installing dependencies and resolves the
same formula. A positive override wins even when `full_suite` is true; missing or nonpositive live
counts fail the prep job rather than silently using a stale numeric fallback:

| CI job                 | Sizing policy                                   |
| ---------------------- | ----------------------------------------------- |
| `test-backend-unit`    | One shard per 520 checked-out or selected files |
| `test-web`             | One shard per 800 checked-out or selected files |
| `test-web-api`         | One shard per 64 checked-out or selected files  |
| `test-web-integration` | Fixed at one unless manually overridden         |

The full-stack integration suite is matrix-capable so it can be split later without redesigning
the report and artifact contracts. Its build and setup dominate its current runtime, so automatic
file-count fan-out would only duplicate that work. The backend-unit matrix alone caps
`max-parallel` at five, preserving its prior simultaneous Tests-pool demand while its six shards
queue in the same run. Other matrices remain uncapped: GitHub schedules them against normal runner
capacity and queues excess work. Every shard-capable workflow puts a ten-minute watchdog on the
Vitest command itself; this is a step deadline, not a replacement for the job's broader timeout.

Playwright has no repository-variable shard cap on any path. PR, labelled-full, fail-open, manual,
and push runs all use `max(1, ceil(runnable spec count × 8.6 seconds / 313 seconds))`; GitHub's
matrix range limits the result to 1–256. The 8.6 seconds per spec and 313-second execution budget
are an allocation heuristic, not a measured per-spec duration, calibrated for GitHub-hosted
`ubuntu-latest` runners (2 vCPU while this repo is private) — see the derivation in
[`ci/playwright/shard-selection.mts`](../../ci/playwright/shard-selection.mts). The execution budget
leaves room for fixed per-shard build/startup overhead inside the whole job's ~10-minute ceiling
(build + migrate + compile + test, not just the test step), plus a per-shard warm-up/variance
buffer, rounded up to a whole minute, reflected in that job's step `timeout-minutes`. The push-path
`main-web.yml` workflow used to pin its own `shard_total_override` here, sized against the
self-hosted fleet's measured runtimes; that override predated the move to GitHub-hosted runners and
was never recalibrated for them, so it was dropped in favor of the same formula the PR path already
uses.

Each sharded workflow includes a lightweight job that generates its matrix before the test job
runs. Web shards run symmetrically — no shard owns a singleton duty; the pages-router check,
dependency check, typecheck, production build, and smoke test moved to
[checks-static.yml](checks-static.yml)'s `static-web` job, and the former shard-1 Vite cache save
was dropped since self-hosted runners already persist `.cache/` across runs (see
[RUNNERS.md](RUNNERS.md#self-hosted-runner-caching)). Backend-unit migrations run on every shard,
but no shard owns a singleton duty; backend port allocation and API/worker smoke run independently
in [checks-backend-smoke.yml](checks-backend-smoke.yml). Playwright keeps its existing per-shard build, runner labels,
worker limit, and Sentry/OTel behavior. The runtime audit's eight-minute median threshold and
ten-minute hard ceiling remain the performance controls, not timeout thresholds.
