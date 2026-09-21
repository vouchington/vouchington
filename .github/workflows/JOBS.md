# Workflow Job & Runner Inventory

Generated from the live `no-mistakes` workflow topology (`loadRepoTopology()`) by
[`ci/render-workflow-runner-inventory.mts`](../../ci/render-workflow-runner-inventory.mts).
Never hand-edit the table below -- regenerate it with:

```
node ci/render-workflow-runner-inventory.mts
```

For curated, workflow-level purpose summaries see [WORKFLOWS.md](WORKFLOWS.md); for
runner-label selection rules see [CLAUDE.md](CLAUDE.md).
This table is the precise, per-job complement to both: the exact `runs-on` and
`timeout-minutes` no-mistakes resolved for every job, including jobs whose runner is
inherited from a reusable-workflow call (shown as `→ callee.yml`, omitting any `@ref` pin) and matrix jobs
(shown once per template, not once per shard).

Absent `timeout-minutes` renders as `360` -- GitHub's effective default job timeout.

<!-- BEGIN GENERATED: workflow-job-runner-inventory -->

| Workflow                            | Job                             | Kind   | Runner                                | Timeout (min) |
| ----------------------------------- | ------------------------------- | ------ | ------------------------------------- | ------------- |
| `actionlint.yml`                    | `actionlint`                    | job    | `ubuntu-slim`                         | 8             |
| `build-backend.yml`                 | `build`                         | job    | `ubuntu-24.04-arm`                    | 20            |
| `build-web.yml`                     | `build`                         | job    | `ubuntu-24.04-arm`                    | 15            |
| `checks-backend-smoke.yml`          | `smoke`                         | job    | `ubuntu-latest`                       | 10            |
| `checks-static.yml`                 | `static-backend`                | job    | `ubuntu-latest`                       | 15            |
| `checks-static.yml`                 | `static-cloudflare`             | job    | `ubuntu-latest`                       | 20            |
| `checks-static.yml`                 | `static-lambdas`                | job    | `ubuntu-latest`                       | 18            |
| `checks-static.yml`                 | `static-web`                    | job    | `ubuntu-latest`                       | 35            |
| `ci-detect-changes.yml`             | `detect-changes`                | job    | `ubuntu-slim`                         | 3             |
| `ci-select-vitest.yml`              | `select-ci`                     | job    | `ubuntu-latest`                       | 5             |
| `ci-test-coverage.yml`              | `test-coverage`                 | job    | `ubuntu-latest`                       | 14            |
| `ci-tests-processing.yml`           | `tests-processing`              | job    | `ubuntu-latest`                       | 14            |
| `ci.yml`                            | `backend-smoke`                 | job    | → `checks-backend-smoke.yml`          | 360           |
| `ci.yml`                            | `build`                         | job    | `ubuntu-latest`                       | 1             |
| `ci.yml`                            | `build-backend`                 | job    | → `build-backend.yml`                 | 360           |
| `ci.yml`                            | `build-web`                     | job    | → `build-web.yml`                     | 360           |
| `ci.yml`                            | `detect-changes`                | job    | → `ci-detect-changes.yml`             | 360           |
| `ci.yml`                            | `initialize-smoke-test`         | job    | → `initialize-smoke-test.yml`         | 360           |
| `ci.yml`                            | `select-ci`                     | job    | → `ci-select-vitest.yml`              | 360           |
| `ci.yml`                            | `static-backend`                | job    | → `checks-static.yml`                 | 360           |
| `ci.yml`                            | `static-cloudflare-worker`      | job    | → `checks-static.yml`                 | 360           |
| `ci.yml`                            | `static-code-analysis`          | job    | → `static-code-analysis.yml`          | 360           |
| `ci.yml`                            | `static-lambdas`                | job    | → `checks-static.yml`                 | 360           |
| `ci.yml`                            | `static-web`                    | job    | → `checks-static.yml`                 | 360           |
| `ci.yml`                            | `storybook`                     | job    | → `storybook.yml`                     | 360           |
| `ci.yml`                            | `test-backend-credentialed`     | job    | → `tests-backend-credentialed.yml`    | 360           |
| `ci.yml`                            | `test-backend-modules`          | job    | → `tests-backend-modules.yml`         | 360           |
| `ci.yml`                            | `test-backend-unit`             | job    | → `tests-backend-unit.yml`            | 360           |
| `ci.yml`                            | `test-cloudflare-worker`        | job    | → `tests-cloudflare-worker.yml`       | 360           |
| `ci.yml`                            | `test-coverage`                 | job    | → `ci-test-coverage.yml`              | 360           |
| `ci.yml`                            | `test-explain-analyze`          | job    | → `explain-analyze.yml`               | 360           |
| `ci.yml`                            | `test-lambdas`                  | job    | → `tests-lambdas.yml`                 | 360           |
| `ci.yml`                            | `test-playwright`               | job    | → `tests-playwright.yml`              | 360           |
| `ci.yml`                            | `test-playwright-credentialed`  | job    | → `tests-playwright-credentialed.yml` | 360           |
| `ci.yml`                            | `test-portability`              | job    | → `tests-portability.yml`             | 360           |
| `ci.yml`                            | `test-postgres-schema`          | job    | → `tests-postgres-schema.yml`         | 360           |
| `ci.yml`                            | `test-tooling`                  | job    | → `tests-tooling.yml`                 | 360           |
| `ci.yml`                            | `test-ts-shared`                | job    | → `tests-ts-shared.yml`               | 360           |
| `ci.yml`                            | `test-web`                      | job    | → `tests-web.yml`                     | 360           |
| `ci.yml`                            | `test-web-api`                  | job    | → `tests-web-api.yml`                 | 360           |
| `ci.yml`                            | `test-web-integration`          | job    | → `tests-web-integration.yml`         | 360           |
| `ci.yml`                            | `tests`                         | job    | `ubuntu-latest`                       | 2             |
| `ci.yml`                            | `tests-processing`              | job    | → `ci-tests-processing.yml`           | 360           |
| `cleanup-artifacts.yml`             | `cleanup-run`                   | job    | `ubuntu-slim`                         | 10            |
| `cleanup-artifacts.yml`             | `cleanup-sweep`                 | job    | `ubuntu-latest`                       | 26            |
| `dependabot-pr-automerge.yml`       | `automerge`                     | job    | `ubuntu-slim`                         | 5             |
| `dependabot-pr-automerge.yml`       | `cleanup-retargeted-automerge`  | job    | `ubuntu-slim`                         | 5             |
| `dispatch-completed-deploy.yml`     | `dispatch`                      | job    | `ubuntu-slim`                         | 5             |
| `docs-publish.yml`                  | `publish`                       | job    | `ubuntu-latest`                       | 10            |
| `explain-analyze.yml`               | `explain-analyze`               | job    | `ubuntu-latest`                       | 10            |
| `fix-dependabot.yml`                | `check-duplicates`              | job    | `ubuntu-latest`                       | 5             |
| `fix-dependabot.yml`                | `dispatch`                      | job    | → `harness-dispatch.yml`              | 360           |
| `fix-dependabot.yml`                | `escalate`                      | job    | `ubuntu-slim`                         | 2             |
| `fix-dependabot.yml`                | `render-prompt`                 | job    | `ubuntu-latest`                       | 5             |
| `fix-dependabot.yml`                | `revalidate-dispatch`           | job    | `ubuntu-slim`                         | 2             |
| `fix-dependabot.yml`                | `triage-and-rerun`              | job    | `ubuntu-latest`                       | 10            |
| `fix-issue.yml`                     | `dispatch`                      | job    | → `harness-dispatch.yml`              | 360           |
| `fix-issue.yml`                     | `escalate`                      | job    | `ubuntu-slim`                         | 2             |
| `fix-issue.yml`                     | `gate`                          | job    | `ubuntu-slim`                         | 5             |
| `fix-issue.yml`                     | `render-prompt`                 | job    | `ubuntu-latest`                       | 5             |
| `fix-main-self-retry.yml`           | `escalate-retry-failure`        | job    | `ubuntu-slim`                         | 10            |
| `fix-main-self-retry.yml`           | `retry`                         | job    | `ubuntu-latest`                       | 10            |
| `fix-main.yml`                      | `classify-self-failure`         | job    | `ubuntu-latest`                       | 10            |
| `fix-main.yml`                      | `dispatch`                      | job    | → `harness-dispatch.yml`              | 360           |
| `fix-main.yml`                      | `escalate`                      | job    | `ubuntu-slim`                         | 10            |
| `fix-main.yml`                      | `related-candidates`            | job    | `ubuntu-latest`                       | 5             |
| `fix-main.yml`                      | `render-prompt`                 | job    | `ubuntu-latest`                       | 5             |
| `fix-main.yml`                      | `triage-and-rerun`              | job    | `ubuntu-latest`                       | 10            |
| `ghcr-cleanup.yml`                  | `cleanup`                       | job    | `ubuntu-slim`                         | 14            |
| `gitleaks.yml`                      | `gitleaks`                      | job    | `ubuntu-slim`                         | 5             |
| `harness-dispatch.yml`              | `dispatch`                      | job    | `ubuntu-latest`                       | 8             |
| `initialize-smoke-test.yml`         | `initialize-smoke-test`         | job    | `ubuntu-latest`                       | 30            |
| `label-pr.yml`                      | `label`                         | job    | `ubuntu-slim`                         | 5             |
| `lint-links.yml`                    | `lint-links`                    | job    | `ubuntu-slim`                         | 10            |
| `main-backend.yml`                  | `backend-smoke`                 | job    | → `checks-backend-smoke.yml`          | 360           |
| `main-backend.yml`                  | `postgres-schema-tests`         | job    | → `tests-postgres-schema.yml`         | 360           |
| `main-backend.yml`                  | `publish-backend-images`        | job    | → `publish-backend-images.yml`        | 360           |
| `main-backend.yml`                  | `static-checks`                 | job    | → `checks-static.yml`                 | 360           |
| `main-backend.yml`                  | `test-backend-credentialed`     | job    | → `tests-backend-credentialed.yml`    | 360           |
| `main-backend.yml`                  | `test-backend-modules`          | job    | → `tests-backend-modules.yml`         | 360           |
| `main-backend.yml`                  | `test-backend-unit`             | job    | → `tests-backend-unit.yml`            | 360           |
| `main-checks.yml`                   | `cleanup-artifacts`             | job    | → `cleanup-artifacts.yml`             | 360           |
| `main-checks.yml`                   | `explain-analyze`               | job    | → `explain-analyze.yml`               | 360           |
| `main-checks.yml`                   | `select-main-checks`            | job    | `ubuntu-slim`                         | 2             |
| `main-checks.yml`                   | `tooling-tests`                 | job    | → `tests-tooling.yml`                 | 360           |
| `main-checks.yml`                   | `ts-shared-tests`               | job    | → `tests-ts-shared.yml`               | 360           |
| `main-cloudflare-worker.yml`        | `cloudflare-worker-tests`       | job    | → `tests-cloudflare-worker.yml`       | 360           |
| `main-cloudflare-worker.yml`        | `publish-cloudflare-worker`     | job    | `ubuntu-latest`                       | 10            |
| `main-cloudflare-worker.yml`        | `static-checks`                 | job    | → `checks-static.yml`                 | 360           |
| `main-lambdas.yml`                  | `lambdas-tests`                 | job    | → `tests-lambdas.yml`                 | 360           |
| `main-lambdas.yml`                  | `publish-image-resize`          | job    | `ubuntu-latest`                       | 10            |
| `main-lambdas.yml`                  | `static-checks`                 | job    | → `checks-static.yml`                 | 360           |
| `main-storybook.yml`                | `publish-storybook`             | job    | `ubuntu-latest`                       | 10            |
| `main-storybook.yml`                | `storybook-build`               | job    | → `storybook.yml`                     | 360           |
| `main-web.yml`                      | `cleanup-artifacts`             | job    | → `cleanup-artifacts.yml`             | 360           |
| `main-web.yml`                      | `detect-web-deploy`             | job    | `ubuntu-slim`                         | 5             |
| `main-web.yml`                      | `playwright-credentialed-tests` | job    | → `tests-playwright-credentialed.yml` | 360           |
| `main-web.yml`                      | `playwright-tests`              | job    | → `tests-playwright.yml`              | 360           |
| `main-web.yml`                      | `publish-web-images`            | job    | → `publish-web-images.yml`            | 360           |
| `main-web.yml`                      | `static-checks`                 | job    | → `checks-static.yml`                 | 360           |
| `main-web.yml`                      | `store-playwright-otel`         | job    | `ubuntu-slim`                         | 8             |
| `main-web.yml`                      | `test-web`                      | job    | → `tests-web.yml`                     | 360           |
| `main-web.yml`                      | `test-web-api`                  | job    | → `tests-web-api.yml`                 | 360           |
| `main-web.yml`                      | `test-web-integration`          | job    | → `tests-web-integration.yml`         | 360           |
| `main-web.yml`                      | `web-deploy-intent`             | job    | `ubuntu-slim`                         | 2             |
| `plan.yml`                          | `dispatch`                      | job    | → `harness-dispatch.yml`              | 360           |
| `plan.yml`                          | `escalate`                      | job    | `ubuntu-slim`                         | 2             |
| `plan.yml`                          | `gate`                          | job    | `ubuntu-slim`                         | 5             |
| `plan.yml`                          | `render-prompt`                 | job    | `ubuntu-latest`                       | 5             |
| `pnpm-dedupe.yml`                   | `dedupe`                        | job    | `ubuntu-latest`                       | 8             |
| `publish-backend-images.yml`        | `build`                         | job    | `ubuntu-24.04-arm`                    | 30            |
| `publish-web-images.yml`            | `build`                         | job    | `ubuntu-24.04-arm`                    | 25            |
| `scheduled-prompts.yml`             | `dispatch`                      | job    | → `harness-dispatch.yml`              | 360           |
| `scheduled-prompts.yml`             | `select-prompt`                 | job    | `ubuntu-latest`                       | 5             |
| `shepherd.yml`                      | `checkpoint-dispatch`           | job    | `ubuntu-latest`                       | 8             |
| `shepherd.yml`                      | `dispatch`                      | job    | → `harness-dispatch.yml`              | 360           |
| `shepherd.yml`                      | `escalate`                      | job    | `ubuntu-slim`                         | 2             |
| `shepherd.yml`                      | `gate`                          | job    | `ubuntu-latest`                       | 8             |
| `shepherd.yml`                      | `render-prompt`                 | job    | `ubuntu-latest`                       | 5             |
| `static-code-analysis.yml`          | `no-mistakes-owned`             | job    | `ubuntu-latest`                       | 55            |
| `static-code-analysis.yml`          | `static-code-analysis`          | job    | `ubuntu-latest`                       | 50            |
| `storybook.yml`                     | `storybook`                     | job    | `ubuntu-latest`                       | 94            |
| `sync-articles.yml`                 | `publish`                       | job    | `ubuntu-slim`                         | 5             |
| `tests-backend-credentialed.yml`    | `backend-credentialed-tests`    | job    | `ubuntu-latest`                       | 20            |
| `tests-backend-modules.yml`         | `backend-modules`               | job    | `ubuntu-latest`                       | 22            |
| `tests-backend-unit.yml`            | `backend-tests`                 | matrix | `ubuntu-latest`                       | 29            |
| `tests-backend-unit.yml`            | `prep`                          | job    | `ubuntu-latest`                       | 8             |
| `tests-cloudflare-worker.yml`       | `cloudflare-worker-tests`       | job    | `ubuntu-latest`                       | 17            |
| `tests-lambdas.yml`                 | `lambdas-tests`                 | job    | `ubuntu-latest`                       | 37            |
| `tests-playwright-credentialed.yml` | `playwright-credentialed-tests` | job    | `ubuntu-latest`                       | 25            |
| `tests-playwright.yml`              | `playwright-tests`              | matrix | `ubuntu-latest`                       | 35            |
| `tests-playwright.yml`              | `select`                        | job    | `ubuntu-latest`                       | 5             |
| `tests-portability.yml`             | `portability-linux`             | job    | `ubuntu-latest`                       | 17            |
| `tests-portability.yml`             | `portability-macos`             | job    | `macos-latest`                        | 17            |
| `tests-postgres-schema.yml`         | `postgres-schema-tests`         | job    | `ubuntu-latest`                       | 20            |
| `tests-tooling.yml`                 | `i18n-route-bounds`             | job    | `ubuntu-latest`                       | 10            |
| `tests-tooling.yml`                 | `tooling`                       | job    | `ubuntu-latest`                       | 32            |
| `tests-ts-shared.yml`               | `ts-shared`                     | job    | `ubuntu-latest`                       | 17            |
| `tests-web-api.yml`                 | `prep`                          | job    | `ubuntu-latest`                       | 8             |
| `tests-web-api.yml`                 | `web-api-tests`                 | matrix | `ubuntu-latest`                       | 27            |
| `tests-web-integration.yml`         | `prep`                          | job    | `ubuntu-latest`                       | 8             |
| `tests-web-integration.yml`         | `web-integration-tests`         | matrix | `ubuntu-latest`                       | 26            |
| `tests-web.yml`                     | `prep`                          | job    | `ubuntu-latest`                       | 8             |
| `tests-web.yml`                     | `web-tests`                     | matrix | `ubuntu-latest`                       | 32            |

<!-- END GENERATED -->
