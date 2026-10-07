# CI Job Timeout Budgets

[Back to CI Reference](ci.md#ci-job-timeout-budgets)

Runner-pool topology and per-step timeout tables live in the canonical references below — do not duplicate them here:

- **Runner pools**: [Job & runner inventory](ci/workflows/JOBS.md)
- **Step timeout guidelines and authoring patterns**: [Workflow Step Timeouts](ci/workflows/reference-step-timeouts.md)

### Fail-fast budget relationship

Step and job timeouts guard different failure modes. A step timeout bounds one hung operation; the
job timeout bounds unhealthy end-to-end execution. The Docker image jobs intentionally do not
reserve the worst-case ceiling of every sequential step:

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

Exact additive budgets remain valid only for explicitly catalogued structural chains, such as the
Docker image jobs below, where each bounded fallback is expected to run serially after the prior
one fails.

Area coverage producers upload full LCOV directly to GitHub artifacts and their owning area gate
downloads it in the same run. Job timeout ceilings are enforced generically by the
`github-actions-job-timeouts` `no-mistakes` rule rather than a dedicated structural guard.

For the Docker image jobs, workflow tests should assert the exact job and critical-step ceilings
and that the job timeout remains below the sum of declared step timeouts. Other jobs retain their
existing budget model unless they explicitly adopt and test this fail-fast relationship.

The `static-web` job adopts the fail-fast relationship. It produces the shared web build that every
Web suite waits on, and healthy runs finish in under four minutes, so its cap stays at the
repository's default job maximum rather than reserving the sum of its step ceilings. Each step keeps
its own ceiling, so a hang is still attributed to the step that hung. `checks-static.test.mts`
asserts that the cap exceeds the largest step and stays below the step sum.

The static backend job retains its additive model with a 21-minute job ceiling: six minutes for
setup, three for dependency analysis, ten for the compiler/extractor, one for generated-file Git
state, and one for runner provisioning and drain headroom.

Lambda tests retain an additive budget that covers every declared step ceiling, including artifact
fallbacks, with provisioning and drain headroom. The workflow test verifies this relationship and
bounds remote checkout/fetch operations; only the local LCOV copy has no separate step timeout.
The current budget is supported by a [48-second main job](https://github.com/vouchington/vouchington/actions/runs/36228728207/job/108367812863)
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
kills the process group and exits so the composite's timing upload still runs. The build ignores
stdin and disables Next and Storybook telemetry, both of which can wait on an open pipe or a stalled
network call.

The build deadline is about three times the slowest healthy build on GitHub-hosted ARM runners.
Over the 12 hours ending 2026-10-07 05:43 UTC, 157 successful `static-web` builds took a median of
80 seconds and at most 90. The Next build cache is disabled, so each one is cold: about 56 seconds
of Next and 25 of Storybook. Consumer fallback rebuilds match that profile. Every caller's composite
step ceiling is that deadline plus one minute for the timing summary and upload, rounded up, and
`build-web-targets-timeouts.test.mts` holds them together. This replaced a 13-minute ceiling carried
over from a self-hosted host's lock-acquisition budget. The fallback producer jobs keep additive
budgets around the shorter build, and the consumer jobs' fail-safe caps dropped by the same seven
minutes.

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
