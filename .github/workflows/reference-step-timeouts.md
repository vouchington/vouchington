# Step Timeouts

[Back to Workflow Authoring Reference](AUTHORING.md#step-timeouts)

Add step-level `timeout-minutes` to prevent hung steps from consuming the entire job timeout:

Timeouts are **fail-fast** — they should catch hung steps quickly, not accommodate every worst-case retry scenario. When in doubt, set a tighter timeout rather than a looser one.

| Step type                                                     | Timeout | Examples                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ephemeral filtered `setup-node-pnpm`                          | 5m      | One explicit selector-only closure with `--fail-if-no-match`                                                                                                                                                                                                                                                              |
| Persistent full `setup-node-pnpm`                             | 5m      | One ordinary full install on matching metadata provenance; forced reconciliation runs after a missing/changed fingerprint or verified workspace-link mismatch                                                                                                                                                             |
| `bash ci/pnpm-install.sh` (direct, outside `setup-node-pnpm`) | 5m      | `static-code-analysis.yml` (persistent) and `pnpm-dedupe.yml` (ephemeral-full) bootstrap Node/pnpm themselves and call the shared install entrypoint directly instead of through the composite action                                                                                                                     |
| `setup-backend`                                               | 5m      | Full persistent workspace install plus explicit email-template build; artifact-backed callers may retain their existing 8–12m headroom                                                                                                                                                                                    |
| AWS credential setup                                          | 2m      | `./.github/actions/setup-aws` and direct `aws-actions/configure-aws-credentials` callers; the composite's native 90s `action-timeout-s` fires first and is attributable to AWS setup, this is a 30s-margin backstop. See no-mistakes `github-actions-action-timeout-pair` in [`.no-mistakes.yml`](../../.no-mistakes.yml) |
| Docker image build                                            | 10m     | Backend API/worker bake steps and the web image build                                                                                                                                                                                                                                                                     |
| Database migrations                                           | 3m      | `node data-stores/psql/migrate.mts`                                                                                                                                                                                                                                                                                       |
| Lock-aware build steps (`with-build-lock.sh`)                 | 8m      | 1m acquire wait plus the CI-only 5m command-timeout circuit breaker plus drain margin; local runs have no command cap and fail closed instead                                                                                                                                                                             |
| Strict Next build steps                                       | 13m     | 300s fail-closed acquisition + 360s command circuit breaker + 30s process drain + 60s composite summary/upload margin = 750s, rounded up to 13m; the command never starts unlocked                                                                                                                                        |
| Type-aware oxlint (`with-heavy-slot.sh`)                      | 5m      | 1m best-effort slot wait plus the analyzer's healthy runtime and cleanup margin; CI runs unlocked after the wait and local acquisition remains fail-closed                                                                                                                                                                |
| Vitest tests                                                  | 5m      | `pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project ...` (non-backend suites)                                                                                                                                                                                                                            |
| Backend Vitest                                                | 20m     | `pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-* ...`                                                                                                                                                                                                                                       |
| Playwright tests                                              | 10m     | `pnpm exec ./ci/with-node-test-options playwright test --shard=...`                                                                                                                                                                                                                                                       |

```yaml
- uses: ./.github/actions/setup-node-pnpm
  timeout-minutes: 5
  with:
    runner-lifecycle: persistent
- run: node data-stores/psql/migrate.mts
  timeout-minutes: 3
- run: pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend ...
  timeout-minutes: 20
```

Coverage producer and consumer job-budget ownership, including the exact transport-chain allowance,
is canonical in [CI Job Timeout Budgets](../../docs/development/reference-ci-ci-job-timeout-budgets.md).
