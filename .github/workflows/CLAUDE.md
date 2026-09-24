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
  the matching Always run, Pull requests, or Main diagram linked from the canonical
  [Workflow automation map](reference-workflow-automation-map.md) synchronized. Update [README.md](README.md) and [WORKFLOWS.md](WORKFLOWS.md) navigation when
  adding or removing a focused reference leaf or group.
- When a workflow gains, loses, or renames an unrestricted `push` trigger or a direct `push` trigger
  on `main`, update `fix-main.yml`; its subscription regression test must pass.
- Preserve the `Main` ruleset gates: exactly `tests`, `build`, and `gitleaks` are
  required before merge. Other scans remain report-only unless they feed one of those gates.
- **Semantic CI DAG:** PR and merge-group CI orders related area-static checks, application tests,
  sibling Playwright suites, and Docker image validation to avoid downstream compute after failures.
  Area-static checks gate their related tests. Test-to-test and test-to-Playwright edges use
  `always() && !cancelled()` and accept upstream `success` or intentional `skipped`, but not
  `failure`. Tooling, native, portability, and standalone Storybook stay outside the Playwright
  gate. On PRs and merge groups, the required `tests` check must succeed before either Docker validation build starts;
  required `tests` and `build` checks still report failures. The shared `static-web` runtime build
  precedes its integration and Playwright consumers. Grouped-main workflows keep their independent
  fan-out and `cancel-in-progress: false` policy. Manual `workflow_dispatch` diagnostics continue
  dependent tests, Playwright, and Docker validation after test failures while preserving red fan-in
  checks.
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
