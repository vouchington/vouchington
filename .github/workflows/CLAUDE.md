# CI/CD Workflows

Load the [github-actions-checklist skill](../../.agents/skills/github-actions-checklist/SKILL.md)
before editing a workflow or composite action. Its canonical checklist covers runner selection and
capacity, action pinning, concurrency, portability, security migrations, and validation. Use
[JOBS.md](JOBS.md) for exact runner labels and job inventory, [AUTHORING.md](AUTHORING.md)
for workflow structure, and [.github/workflows/VITEST.md](VITEST.md) for Vitest project mapping.

## Scoped invariants

- **CI orchestrator boundary:** `.github/workflows/ci.yml` owns only trigger, concurrency,
  dependency/condition, permission, input/output, named-secret, reusable-workflow dispatch, and
  exact-required-check action-gate wiring. Direct shell steps, `actions/github-script` source,
  and inline dorny filter documents are forbidden by `ci-orchestrator-only.test.mts`. Put
  executable control logic in a narrowly permissioned `ci-*.yml` reusable workflow, local
  composite action, or `.github/ci-*-filters.yml` file.
- **Runner-label selection rule:** pick labels by what the job requires, not as host-carving
  selectors. Arch/OS-independent jobs use `ubuntu-latest` (or `ubuntu-slim` where a smaller image
  suffices); jobs needing Linux+ARM64 use `ubuntu-24.04-arm` (see
  [`runner-policy-classify.mts`](runner-policy-classify.mts) for the closed allowlist of accepted
  labels); macOS-specific jobs use `macos-latest`. See [Job & runner inventory](JOBS.md) for the
  exact `runs-on` resolved for every job.
- When adding, removing, or changing a workflow, keep the relevant grouped inventory reference and
  the canonical [Workflow automation map](reference-workflow-automation-map.md) Mermaid topology
  synchronized. Update [README.md](README.md) and [WORKFLOWS.md](WORKFLOWS.md) navigation when
  adding or removing a focused reference leaf or group.
- When a workflow gains, loses, or renames an unrestricted `push` trigger or a direct `push` trigger
  on `main`, update `fix-main.yml`; its subscription regression test must pass.
- Preserve the `Main` ruleset gates: exactly `tests`, `build`, and `gitleaks` are
  required before merge. Other scans remain report-only unless they feed one of those gates.
- **Semantic CI DAG:** add `needs` only for a real prerequisite, never because a suite is flaky or
  often fails. Related area-static jobs are hard success gates before application tests; tooling,
  native, portability, and standalone Storybook remain independent. Test-to-test ordering (shared
  Vitest before consumers, web Vitest before integration, application Vitest before Playwright)
  must use `always() && !cancelled()` and explicitly accept upstream `success`, `failure`, and
  `skipped`, so ordinary failures do not suppress downstream tests and only cancellation stops
  them. Both Playwright suites are siblings and exclude unrelated test roots. PR and grouped-main
  workflows keep the same semantic ordering where jobs share a workflow; cross-workflow main jobs
  stay independent. Static, build, and deploy gates require explicit success.
  `.github/workflows/ci-semantic-dag.test.mts` and the topology policy enforce the DAG rules.
- Treat runner labels, runner-demand budgets, and concurrency as shared-capacity contracts. Follow
  [the canonical checklist](../../docs/checklists/github-actions.md) and update its documented
  policy/test touch points instead of copying label arrays or group expressions here.
- **Artifact units must be decoupled and independently safe.** Each independent deployable — backend
  api+workers (one unit), image-resize Lambda, Cloudflare Worker, and web — validates and dispatches
  independently without waiting on another deployable or on the private receiver. The private
  infrastructure receiver owns deployment ordering. Every deploy must be forward/backward-compatible
  with whatever is currently live (expand/contract): expand the reader to accept old+new, ship, then
  drop old. The only sanctioned coupling is api↔workers, which share DB schema and code and deploy as
  one unit. See
  [deploy decoupling](../../docs/overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).

For workflow validation, follow the
[canonical checklist](../../docs/checklists/github-actions.md#checklist), run the focused GitHub
Actions tests selected by [docs/development/tests.md](../../docs/development/tests.md), and run
`actionlint` for changed workflow files.
