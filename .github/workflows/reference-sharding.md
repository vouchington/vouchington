# Sharding

[Back to Workflow Authoring Reference](AUTHORING.md#sharding)

Shard jobs so every leaf job targets around 8 minutes. 10 minutes is a hard performance ceiling.
These are performance budgets monitored by the scheduled issue audit, never `timeout-minutes`
values or CI failure thresholds. The repo favors fewer, longer-running shards over many short ones:
build/startup overhead is fixed per shard, so splitting further than this buys little wall-clock
time while burning more runner capacity.

Playwright workflow runs are serialized per PR/ref to avoid overlapping suites for the same branch,
but the matrix shards inside a single run remain parallel. The root CI job dispatches both
Playwright suites as soon as the static checks pass, alongside the Vitest jobs; no Vitest result
delays or suppresses the browser suites.

Vitest's ownership registry owns each file-count policy. PR-selected and promoted-full jobs emit
`shard_total_override = ceil(fileCount / filesPerShard)` (GitHub matrix max 256). Otherwise the
reusable workflow counts the checked-out live suite after installing dependencies and resolves the
same formula. A positive override wins even when `full_suite` is true; missing or nonpositive live
counts fail the prep job rather than silently using a stale numeric fallback:

| CI job                 | Sizing policy                                   |
| ---------------------- | ----------------------------------------------- |
| `test-backend-unit`    | One shard per 350 checked-out or selected files |
| `test-web`             | One shard per 500 checked-out or selected files |
| `test-web-api`         | One shard per 64 checked-out or selected files  |
| `test-web-integration` | Fixed at one unless manually overridden         |

The `TEST_BACKEND_UNIT_FILES_PER_SHARD` and `TEST_WEB_FILES_PER_SHARD` repository variables, when
set to a positive integer, replace the registry's files-per-shard value for their job on every
path. Leave them unset, or equal to the registry value, so the table above stays authoritative; a
stale variable silently re-shards CI.

The full-stack integration suite is matrix-capable so it can be split later without redesigning
the report and artifact contracts. Its build and setup dominate its current runtime, so automatic
file-count fan-out would only duplicate that work. The backend-unit matrix used to cap
`max-parallel` at five, bounding its demand on the fixed self-hosted `[self-hosted, Linux, Docker,
Tests]` runner pool. GitHub-hosted runners have no such fixed pool, so the cap was removed and its
shards now run uncapped like every other matrix: GitHub schedules them against normal runner
capacity and queues excess work. Every shard-capable workflow puts a ten-minute watchdog on the
Vitest command itself; this is a step deadline, not a replacement for the job's broader timeout.

PR, labelled-full, fail-open, manual, and push Playwright runs all use
`max(1, ceil(runnable spec count × 6.1 seconds / 350 seconds))`; GitHub's matrix range limits the
result to 1–256. A caller's `shard_total_override` input, or else the optional
`PLAYWRIGHT_SHARD_TOTAL` repository variable, replaces the formula when set. The 6.1 seconds per
spec and 350-second execution budget are an allocation heuristic, not a per-spec SLA: 6.1 seconds is
the hosted-runner test-step time per spec with three Playwright workers, and the budget sizes each
shard for the seven-to-eight-minute job target. The current full suite resolves to six shards. See
the derivation in
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
[checks-static.yml](checks-static.yml)'s `static-web` job. The former shard-1 Vite cache save was
dropped when the fleet still ran on persistent self-hosted runners that already kept `.cache/`
across runs; GitHub-hosted runners are single-job VMs with nothing to persist, so there is no
cache-save step to restore now either. Backend-unit migrations run on every shard,
but no shard owns a singleton duty; backend port allocation and API/worker smoke run independently
in [checks-backend-smoke.yml](checks-backend-smoke.yml). Playwright keeps its existing per-shard build, runner labels,
worker limit, and Sentry/OTel behavior. The runtime audit's eight-minute median threshold and
ten-minute hard ceiling remain the performance controls, not timeout thresholds.
