# CI Job Timeout Budgets

[Back to CI Reference](ci.md#ci-job-timeout-budgets)

Runner-pool topology and per-step timeout tables live in the canonical references below — do not duplicate them here:

- **Runner pools**: [Job & runner inventory](../../.github/workflows/JOBS.md)
- **Step timeout guidelines and authoring patterns**: [Workflow Step Timeouts](../../.github/workflows/reference-step-timeouts.md)

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
- **Σ(step_timeouts)** is deliberately larger than the job timeout for Docker image jobs adopting
  this fail-fast multi-gate policy. It represents every step degrading to its independent maximum
  in one run, not healthy execution that CI should wait for.

Exact additive budgets remain valid only for explicitly catalogued structural chains, such as the
Docker image jobs below, where each bounded fallback is expected to run serially after the prior
one fails.

Coverage and Vitest-blob producers upload directly to GitHub artifacts and consumers download from
GitHub artifacts; there is no separate S3 transport chain with its own per-payload budget formula.
Job timeout ceilings for these jobs are enforced generically by the `github-actions-job-timeouts`
`no-mistakes` rule rather than a dedicated structural guard.

For the Docker image jobs, workflow tests should assert the exact job and critical-step ceilings
and that the job timeout remains below the sum of declared step timeouts. Other jobs retain their
existing budget model unless they explicitly adopt and test this fail-fast relationship.

Install timeout budgets distinguish root-only installs from relink-heavy installs. A root-only
`pnpm install --frozen-lockfile --prefer-offline --filter .` can keep the 2-minute fail-fast budget,
but static analysis first forces a full-workspace metadata reconciliation with
`--force --prod=false --ignore-scripts --ignore-pnpmfile`, then runs its tracked-policy strict
relink. The first install rebuilds stale dependency/platform-selection state, including optional
native packages, without executing package code; the second applies the workspace's `allowBuilds`
policy. The pair gets a 5-minute per-attempt step timeout, three retry attempts, and a 35-minute job
budget so a timed-out attempt does not leave broken workspace links for later typechecks. See
[Workflow Step Timeouts](../../.github/workflows/reference-step-timeouts.md)
for the canonical step-timeout table.

Docker validation image builds get 10-minute step ceilings. The backend and web build jobs retain
20-minute and 15-minute job ceilings respectively; those outer ceilings intentionally remain lower
than the sum of their build, smoke, scan, and artifact step caps. Private infrastructure owns image
publication and its timeout policy.

The four host-side Next builds that run through the `build-web-targets` composite action keep their
300-second fail-closed lock-acquisition budget and receive a 360-second command circuit breaker
only inside that composite action. Their outer composite step timeout is 13 minutes: 300s
acquisition + 360s command + 30s process drain + 60s composite summary/upload margin = 750s,
rounded up to 13m. Generic direct `with-build-lock.sh` steps retain the separate 8–12 minute
backstop; the 13-minute value is the strict Next-build ceiling, not a repository-wide lock-step
maximum.

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
