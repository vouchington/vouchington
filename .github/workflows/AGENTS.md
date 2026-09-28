# CI/CD Workflows

Load the [github-actions-checklist skill](../../.agents/skills/github-actions-checklist/SKILL.md)
before editing a workflow or composite action. Its canonical checklist covers runner selection and
capacity, action pinning, concurrency, portability, security migrations, and validation. Use
[JOBS.md](../../docs/development/ci/workflows/JOBS.md) for exact runner labels and job inventory, [AUTHORING.md](../../docs/development/ci/workflows/AUTHORING.md)
for workflow structure, and [.github/workflows/VITEST.md](../../docs/development/ci/workflows/VITEST.md) for Vitest project mapping.

## Scoped invariants

- **Runner-label selection rule:** pick labels by what the job requires, not as host-carving
  selectors. Arch/OS-independent jobs use `ubuntu-latest` (or `ubuntu-slim` where a smaller image
  suffices); jobs needing Linux+ARM64 use `ubuntu-24.04-arm` (see
  [`runner-policy-classify.mts`](runner-policy-classify.mts) for the closed allowlist of accepted
  labels); macOS-specific jobs use `macos-latest`. See [Job & runner inventory](../../docs/development/ci/workflows/JOBS.md) for the
  exact `runs-on` resolved for every job.
- When adding, removing, or changing a workflow, keep the relevant grouped inventory reference and
  the matching Always run, Pull requests, or Main diagram linked from the canonical
  [Workflow automation map](../../docs/development/ci/workflows/reference-workflow-automation-map.md) synchronized. Update [README.md](README.md) and [WORKFLOWS.md](../../docs/development/ci/workflows/WORKFLOWS.md) navigation when
  adding or removing a focused reference leaf or group.
- When a workflow gains, loses, or renames an unrestricted `push` trigger or a direct `push` trigger
  on `main`, update `fix-main.yml`; its subscription regression test must pass.
- Preserve the `Main` ruleset gates: exactly `static`, `backend`, `web`,
  `cloudflare-worker`, `lambdas`, `tooling`, and `gitleaks` are required before merge. Keep every
  area gate job named after its area, always running (`!cancelled()`), and passing when its area is
  skipped. Other scans remain report-only unless they feed one of the required gates.
- **Area workflow DAG:** each area workflow runs `changes` → `static-<area>` (when the area has
  one) → its suites in parallel → `coverage`, `codecov`, and the area gate. `static.yml` has no
  `changes` job, so no-mistakes' `tsconfig-gate-coverage` rule can prove its typechecks run. A
  suite never waits on another suite, the `changes` area output selects the area instead of
  trigger `paths:`, and `nightly.yml` calls every area workflow. `area-workflows.test.mts` and
  `area-coverage.test.mts` enforce the DAG, triggers, literal concurrency prefixes, and coverage
  wiring.
- Graph, lock, `if:` entailment, permission comparison, and secret-readiness checks run through
  `vouchington-tooling/workflow-policy`. This repository still owns the workflow inventory,
  unlocked-workflow reasons, concurrency intent table, secret inventory, and workflow file reads.
- Treat runner labels, runner-demand budgets, and concurrency as shared-capacity contracts. Follow
  [the canonical checklist](../../docs/checklists/github-actions.md) and update its documented
  policy/test touch points instead of copying label arrays or group expressions here.
- **Artifact units must be decoupled and independently safe.** Each independent deployable — backend
  api+workers (one unit), image-resize Lambda, Cloudflare Worker, and web — validates and dispatches
  independently without waiting on another deployable or on the private receiver. The private
  infrastructure receiver owns deployment ordering. Workflow changes follow
  [One current contract](../../AGENTS.md). Current independent artifact interfaces still need safe
  deployment ordering. The only sanctioned coupling is
  api↔workers, which share DB schema and code and deploy as one unit. See
  [deploy decoupling](../../docs/overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).

For workflow validation, follow the
[canonical checklist](../../docs/checklists/github-actions.md#checklist), run the focused GitHub
Actions tests selected by [docs/development/tests.md](../../docs/development/tests.md), and run
`actionlint` for changed workflow files.
