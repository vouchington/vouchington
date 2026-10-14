# CI Job Timeout Budgets

[Back to CI Reference](ci.md#ci-job-timeout-budgets)

Runner-pool topology and per-step timeout tables live in the canonical references below — do not duplicate them here:

- **Runner pools**: [Job & runner inventory](ci/workflows/JOBS.md)
- **Step timeout guidelines and authoring patterns**: [Workflow Step Timeouts](ci/workflows/reference-step-timeouts.md)

### Fail-fast budget relationship

Step and job timeouts guard different failure modes. A step timeout bounds one hung operation; the
job timeout bounds unhealthy end-to-end execution. The Docker image jobs intentionally do not
reserve the worst-case ceiling of every sequential step. This is a universal rule with no
additive exception: every job's `timeout-minutes` is strictly less than the sum of its steps'
`timeout-minutes` and at least its largest step. Never size a job as the step sum plus headroom,
and never raise a job cap because a step was added. A job with a single bounded step has no valid
range, so it is exempt until the shared `github-actions-job-timeouts` rule decides how to treat
it ([no-mistakes#1963](https://github.com/jonathanong/no-mistakes/issues/1963));
`job-timeout-bounds.test.mts` enforces the rule locally for every other job.

### GitHub-hosted re-derivation

Issue [#2260](https://github.com/vouchington/vouchington/issues/2260) pooled successful main,
pull-request, and merge-group jobs from 2026-10-05 through 2026-10-07. Its 555 Storybook jobs had
a 347-second maximum, Web Tests' 1,552 jobs had a 381-second maximum (337 seconds for the test
step), and Static Analysis' 75 jobs had a 442-second maximum. The remaining touched jobs ranged
from 58 seconds (static Cloudflare) to 345 seconds (tooling). The job ceilings therefore leave
provisioning headroom and bounded recovery work, rather than preserving retired self-hosted-runner
or unobserved retry budgets. Every job uses the fail-fast relationship below.

```
max(step_timeout, observed_healthy_job_runtime + buffer)
  ≤ job_timeout
  < Σ(step_timeouts)
```

Where:

- **step_timeout** is the largest individual step ceiling; the static guard requires every step to
  fit inside its containing job.
- **observed_healthy_job_runtime + buffer** keeps normal end-to-end execution below the job ceiling.
- **Σ(step_timeouts)** is deliberately larger than the job timeout for jobs adopting this
  fail-fast multi-gate policy. It represents every step degrading to its independent maximum
  in one run, not healthy execution that CI should wait for.

A job's `timeout-minutes` clock starts when GitHub assigns the runner, before hosted-VM provisioning
finishes and before `Set up job` begins. That wait is normally seconds but has exceeded a minute, so
it counts against the job but never against a step. A job whose real work takes seconds should
still keep provisioning headroom between its step and job timeout. A job clock sized to the step
alone can turn slow runner boot into a false failure.

Area coverage producers upload full LCOV directly to GitHub artifacts and their owning area gate
downloads it in the same run. Job timeout ceilings are enforced generically by the
`github-actions-job-timeouts` `no-mistakes` rule rather than a dedicated structural guard.

Workflow tests assert the exact job and critical-step ceilings where a job's budget matters, and
`job-timeout-bounds.test.mts` asserts the universal relationship across every workflow.

The `static-web` job adopts the fail-fast relationship. It produces the shared web build that every
Web suite waits on, and healthy runs finish in under four minutes, so its cap stays at the
repository's default job maximum rather than reserving the sum of its step ceilings. Each step keeps
its own ceiling, so a hang is still attributed to the step that hung. `checks-static.test.mts`
asserts that the cap exceeds the largest step and stays below the step sum.

The static backend job has a 10-minute cap against 16 minutes of step ceilings (healthy runs take
under two minutes). Static lambdas (14 against 15) and static Cloudflare (9 against 10) are likewise
capped below their step sums. Lambda tests cap at 11 against 12 minutes of declared step ceilings,
including artifact fallbacks; only the local LCOV copy has no separate step timeout. The current
runtime is supported by a [48-second main job](https://github.com/vouchington/vouchington/actions/runs/36228728207/job/108367812863)
(36-second setup, 5-second Vitest) and a [75-second coverage PR job](https://github.com/vouchington/vouchington/actions/runs/36229036801/job/108369324502)
(34-second setup, 21-second Vitest). Artifact upload retries and outcome guards remain intact;
neither the observed runtime nor the timeout change justifies splitting this already short job.

Install timeout budgets distinguish root-only installs from relink-heavy installs. A root-only
`pnpm install --frozen-lockfile --prefer-offline --filter .` can keep the 2-minute fail-fast budget,
but static analysis first forces a full-workspace metadata reconciliation with
`--force --prod=false --ignore-scripts --ignore-pnpmfile`, then runs its tracked-policy strict
relink. The first install rebuilds stale dependency/platform-selection state, including optional
native packages, without executing package code; the second applies the workspace's `allowBuilds`
policy. The pair gets a 5-minute per-attempt step timeout, three retry attempts, and a 35-minute job
budget so a timed-out attempt does not leave broken workspace links for later typechecks. See
[Workflow Step Timeouts](ci/workflows/reference-step-timeouts.md)
for the canonical step-timeout table.

Docker validation image builds get 10-minute step ceilings. The backend and web build jobs retain
20-minute and 15-minute job ceilings respectively; those outer ceilings intentionally remain lower
than the sum of their build, smoke, scan, and artifact step caps. Private infrastructure owns image
publication and its timeout policy.

The `build-web-targets` composite runs its build under
[`ci/run-bounded.py`](../../ci/run-bounded.py), because `timeout-minutes` on the composite step did
not reap a hung child process group. Merge-group run
[37572766026](https://github.com/vouchington/vouchington/actions/runs/37572766026) stayed in
`build-web-targets` until the job cap, and GitHub did not retain the job log. The bounded runner
kills the command process group at its deadline. The composite's timing upload runs after the
runner finishes delivering output. The runner owns and relays the command's stdout and stderr,
closing descendant-held source pipes after the existing grace while retaining buffered bytes.
This bounds waiting on descendant-held source pipes, not downstream delivery. An open backpressured
consumer can delay final exit and the timing upload until it accepts the retained bytes or closes. See the [CI helper contract](ci/tooling/README.md) for this delivery boundary.
The build ignores
stdin and disables Next and Storybook telemetry, both of which can wait on an open pipe or a stalled
network call.

Every `build-web-targets` deadline is a generous multiple of the slowest healthy cold build on
GitHub-hosted ARM runners; the Next build cache is disabled, so each build is cold, and consumer
fallback rebuilds match that profile. Observed build timings live in the private docs repository.

The composite bounds each step on its critical path: the cache restore download (the cache action's
per-segment `SEGMENT_DOWNLOAD_TIMEOUT_MINS`, which does not cover lookup or extraction), the
manifest `verify` (under `run-bounded.py`), and the build (under `run-bounded.py`). A stalled
restore or verify therefore falls through to the bounded rebuild instead of consuming the caller's
step ceiling. Every caller's composite step ceiling is the sum of the restore deadline plus a fixed
lookup and extraction allowance, the verify and build deadlines, `run-bounded.py`'s kill grace
(SIGTERM wait plus output relay join) once for each of those two commands because both can time out
in series, and one minute for the always-run timing summary and upload, rounded up to a whole
minute. The summary and upload run before the producer's cache save, whose pinned action has no
deadline, so a slow save cannot starve the evidence. `build-web-targets-timeouts.test.mts` derives
the sum from the declared deadlines and holds every caller to it, so changing one deadline without
the callers fails. The fallback producer jobs (`shards`, `prep`) follow the universal rule: their
caps (15 against 16 and 16 against 21) are below their step sums.

The backend image build smoke tests validate worker startup, Valkey connectivity, and universal
heartbeat job processing. The `worker-cpu` smoke test also imports `vurst-ai` from the deployed
dependency graph, resolves its Linux ARM64 platform package, requires that package's binding and
ONNX runtime at the wrapper's version, and rejects foreign platform packages. This proves pnpm
deploy retained the target-specific optional dependency without lifecycle-script downloads. When the checked-in
`WORKER_IO_AUTOMATION_ENABLED` flag activates `worker-io`, its smoke test
derives an exclude-mode `QUEUES` list from the image's
`@entrypoints/worker-io/worker-definitions` module so policy-managed IO queues are disabled; the
universal heartbeat worker still loads and processes the smoke job. Do not point this smoke test at
a DB-backed queue such as `emails` unless the build job also owns PostgreSQL setup and migrations.
