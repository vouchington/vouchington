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

Vitest's ownership registry owns each file-count policy. The reusable workflow's prep job runs
[`ci/vitest/shard-total.mts`](../../../../ci/vitest/shard-total.mts), which counts the checked-out live
suite after installing dependencies and resolves `ceil(fileCount / filesPerShard)` (GitHub matrix
max 256); missing or nonpositive live counts fail the prep job rather than silently using a stale
numeric fallback:

| CI job                 | Sizing policy                       |
| ---------------------- | ----------------------------------- |
| `test-backend-unit`    | One shard per 250 checked-out files |
| `test-web`             | One shard per 500 checked-out files |
| `test-web-api`         | One shard per 64 checked-out files  |
| `test-web-integration` | Fixed at one                        |

The `TEST_BACKEND_UNIT_FILES_PER_SHARD` and `TEST_WEB_FILES_PER_SHARD` repository variables, when
set to a positive integer, replace the registry's files-per-shard value for their job. Leave them unset, or equal to the registry value, so the table above stays authoritative; a
stale variable silently re-shards CI.

The full-stack integration suite is matrix-capable so it can be split later without redesigning
the report and artifact contracts. Its build and setup dominate its current runtime, so automatic
file-count fan-out would only duplicate that work. The backend-unit matrix used to cap
`max-parallel` at five, bounding its demand on the fixed self-hosted `[self-hosted, Linux, Docker,
Tests]` runner pool. GitHub-hosted runners have no such fixed pool, so the cap was removed and its
shards now run uncapped like every other matrix: GitHub schedules them against normal runner
capacity and queues excess work. Every shard-capable workflow puts a ten-minute watchdog on the
Vitest command itself; this is a step deadline, not a replacement for the job's broader timeout.

Every Playwright run uses `max(1, ceil(runnable spec count × 6.1 seconds / 300 seconds))`;
GitHub's matrix range limits the result to 1–256. The optional `PLAYWRIGHT_SHARD_TOTAL` repository
variable replaces the formula when set. The 6.1 seconds per
spec and 300-second execution budget are an allocation heuristic, not a per-spec SLA: 6.1 seconds is
the hosted-runner test-step time per spec with three Playwright workers, and the budget is the
average per-shard test time. Count-based sharding leaves the heaviest shard about 1.2× that average
(near 350 seconds), which sizes it for the seven-to-eight-minute job target. The current full suite
resolves to seven shards. See
the derivation in
[`ci/playwright/shard-total.mts`](../../../../ci/playwright/shard-total.mts). The execution budget
leaves room for fixed per-shard build/startup overhead inside the job target (build + migrate +
compile + test, not just the test step). The `Run Playwright tests` step's 12-minute
`timeout-minutes` is a ceiling, not the target: it adds a slow-runner tail over the ~6-minute
heaviest-shard test time so a shard that is still passing tests finishes instead of ejecting the merge queue (#1185).
The step runs the suite through [`ci/run-bounded.py`](../../../../ci/run-bounded.py) one minute
under that ceiling. `timeout-minutes` did not reap a hung Playwright process group, so merge-group
shard 5 ran until the job cap and GitHub dropped the log (run
[37726973537](https://github.com/vouchington/vouchington/actions/runs/37726973537)). The bounded
runner kills the group and lets the step exit, which keeps the failure log and the existing
failure artifacts.

Credentialed Playwright uses the same bounded runner with a maximum 420-second
command deadline inside its unchanged eight-minute test step and thirteen-minute job cap.
A single current-attempt Jobs API read matches the running job and runner and captures
its absolute deadline from `started_at`, including provisioning before authored steps.
The command uses the smaller of 420 seconds and the remaining job budget, reserving
ten seconds for termination grace and two minutes for upload and post-step work.
Missing, ambiguous, invalid, or exhausted timing fails before the command starts;
there is no polling, first-step clock fallback, or credentialed-test skip.
A command timeout exits 124 and remains a failed step; the existing failure/retry
JUnit upload condition remains in place. This bounds the command process group
and preserves failure evidence, but does not diagnose the test or server that
caused a hang.

Each sharded workflow includes a lightweight job that generates its matrix before the test job
runs. Web shards run symmetrically — no shard owns a singleton duty; the pages-router check,
dependency check, typecheck, production build, and smoke test moved to
[checks-static.yml](../../../../.github/workflows/checks-static.yml)'s `static-web` job. The former shard-1 Vite cache save was
dropped when the fleet still ran on persistent self-hosted runners that already kept `.cache/`
across runs; GitHub-hosted runners are single-job VMs with nothing to persist, so there is no
cache-save step to restore now either. Backend-unit migrations run on every shard,
but no shard owns a singleton duty; backend port allocation and API/worker smoke run independently
in [checks-backend-smoke.yml](../../../../.github/workflows/checks-backend-smoke.yml). Playwright keeps its existing per-shard build, runner labels,
worker limit, and Sentry/OTel behavior. The runtime audit's eight-minute median threshold and
ten-minute hard ceiling remain the performance controls, not timeout thresholds.
