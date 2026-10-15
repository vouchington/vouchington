# Step Timeouts

[Back to Workflow Authoring Reference](AUTHORING.md#step-timeouts)

Every authored workflow step has a `timeout-minutes` budget so a hung checkout, external action,
composite call, or shell command has an explicit step deadline within the job timeout.
Reusable-workflow `jobs.<id>.uses` callers have no steps. GitHub does not accept `timeout-minutes`
inside composite action steps, so their workflow callers own the backstop.
The `github-actions-step-timeouts` no-mistakes rule enforces a positive numeric
`timeout-minutes` on every executable step in authored workflows, with a 30-minute maximum.
The existing job-timeout rule also rejects steps whose budgets exceed their job's deadline.
Every job's `timeout-minutes` is also strictly less than the sum of its steps' `timeout-minutes`
(no additive exception); the `github-actions-job-timeouts` rule's `rejectJobAtOrAboveStepSum` option
enforces this.

Timeouts are **fail-fast** — they should catch hung steps quickly, not accommodate every worst-case retry scenario. When in doubt, set a tighter timeout rather than a looser one.

| Step type                | Timeout                                     | Examples                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout                 | 1m; 2m for full history or image publishers | `actions/checkout` with `fetch-depth: 0` gets two minutes; image publisher workflows reserve two minutes on their other checkouts as well.                                                                                                                                                                                      |
| Small control-plane work | 1–2m                                        | Repository API, path filters, prompt preparation, coverage copy, artifact upload, attestation, and cleanup. A short job may share its ceiling with one step; the job still bounds the whole sequence.                                                                                                                           |
| `setup-node-pnpm`        | 5m                                          | `actions/setup-node`, `pnpm/action-setup`, and one full `pnpm install --frozen-lockfile` against the restored pnpm store cache                                                                                                                                                                                                  |
| `setup-backend`          | 5m                                          | `setup-node-pnpm` plus the explicit email-template build; artifact-backed callers may retain their existing 8–12m headroom                                                                                                                                                                                                      |
| `setup-playwright`       | 5m                                          | Browser-cache restore, `playwright install chromium`, and a Chromium launch check that runs `playwright install-deps` only on failure. Each download is killed at 2 minutes and retried once; the apt fallback sits outside that bound, so this timeout limits it. Credentialed Playwright keeps an 8-minute caller backstop.   |
| AWS credential setup     | 2m                                          | `./.github/actions/setup-aws` and direct `aws-actions/configure-aws-credentials` callers; the composite's native 90s `action-timeout-s` fires first and is attributable to AWS setup, this is a 30s-margin backstop. See no-mistakes `github-actions-action-timeout-pair` in [`.no-mistakes.yml`](../../../../.no-mistakes.yml) |
| Docker image build       | 10m                                         | Backend API/worker bake steps and the web image build                                                                                                                                                                                                                                                                           |
| Image build composite    | 17m backend; 12m web                        | Workflow caller backstops for the full build, smoke, and scan composite before the separate 8m publication step.                                                                                                                                                                                                                |
| Database migrations      | 3m                                          | `node data-stores/psql/migrate.mts`                                                                                                                                                                                                                                                                                             |
| Strict Next build steps  | 9m                                          | Every `build-web-targets` caller: the composite's restore, verify, and build deadlines plus kill grace and one minute for the timing upload, enforced by `build-web-targets-timeouts.test.mts` -- see [CI Job Timeout Budgets](../../reference-ci-ci-job-timeout-budgets.md)                                                    |
| Type-aware oxlint        | 5m                                          | The analyzer's healthy runtime plus cleanup margin; GitHub-hosted runners give the job the whole VM to itself, so there is no shared-host wait                                                                                                                                                                                  |
| Vitest tests             | 5m                                          | `pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project ...` (non-backend suites)                                                                                                                                                                                                                                  |
| Backend Vitest           | 20m                                         | `pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-* ...`                                                                                                                                                                                                                                             |
| Playwright tests         | 10m                                         | `pnpm exec ./ci/with-node-test-options playwright test --shard=...`                                                                                                                                                                                                                                                             |

```yaml
- uses: ./.github/actions/setup-node-pnpm
  timeout-minutes: 5
- run: node data-stores/psql/migrate.mts
  timeout-minutes: 3
- run: pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend ...
  timeout-minutes: 20
```

Coverage producer and consumer job-budget ownership, including the exact transport-chain allowance,
is canonical in [CI Job Timeout Budgets](../../reference-ci-ci-job-timeout-budgets.md).
