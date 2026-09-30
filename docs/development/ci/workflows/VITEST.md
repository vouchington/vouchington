# Vitest CI Mapping

**Single source of truth:** [`ci/vitest/project-ownership.mts`](../../../../ci/vitest/project-ownership.mts)'s `VITEST_OWNERSHIP` is the canonical model of which CI job owns each Vitest project. The table below is generated from it — do not hand-edit the rows between the `GENERATED` markers. To add, move, rename, or remove a project: edit `project-ownership.mts`, then run `node ci/vitest/generate-ownership-table.mts` to refresh this file. Three checks enforce that the model, the real workflow `--project` commands, and this table never drift apart: [`ci/vitest/project-ownership.test.mts`](../../../../ci/vitest/project-ownership.test.mts) (model totality against `vitest.config.mts`), [`vitest-project-ownership.test.mts`](../../../../.github/workflows/vitest-project-ownership.test.mts) (model against the literal/tooling-registry/portability-group/storybook `--project` invocations in `.github/workflows/`), and `node ci/vitest/generate-ownership-table.mts --check` (model against this file, run in `static-code-analysis.yml`).

Every Vitest project defined in [`../../vitest.config.mts`](../../../../vitest.config.mts) must be listed here and owned by exactly one CI workflow. An owning workflow may run the project in multiple platform jobs or shards.

Each area workflow starts its owning projects when its area path filter matches the pull-request or
merge-group diff, and a selected area runs its full suites; CI never selects individual test files.
[`ci/vitest/project-ownership-registry.mts`](../../../../ci/vitest/project-ownership-registry.mts) derives
the project → job map and shard policies from `VITEST_OWNERSHIP`. See [area test suites](../../ci.md#area-test-suites).

Credentialed projects must use workflow, job, or step `if:` gates so untrusted PRs from forks, Dependabot, or Renovate do not receive API keys, repository secrets, or OIDC-assumed cloud roles. Test suites must skip when their required env vars are absent.

Each area's path filters must trigger the owning workflow when a project’s source files, test
files, or explicit repo fixture files change. Fixture docs that tests read directly, such as this
file and `docs/prompts/automation/` plus `docs/prompts/scheduled/` templates, are intentionally
not treated as docs-only.

Reporter policy:

- Local Vitest commands should not force a reporter. Let Vitest use its default reporter behavior, including its automatic `minimal` reporter when it detects an AI coding agent.
- CI Vitest commands set `VITEST_CI_REPORTERS: run` and `VITEST_JUNIT_OUTPUT_FILE`; do not pass
  reporter or output-file CLI flags.
- `vitest.config.mts` owns the CI reporter list: `minimal`, configured `github-actions`, `junit`,
  `hanging-process`, and the CI-only teardown-overrun reporter, which prints process and
  active-resource context when Vitest's exit watchdog fires at `teardownTimeout`.
- The `github-actions` reporter must keep job summaries disabled and file links configured from GitHub environment variables.

<!-- BEGIN GENERATED: vitest-ownership -->

| Vitest project                     | Workflow                         | Job                               | Credential requirement   |
| ---------------------------------- | -------------------------------- | --------------------------------- | ------------------------ |
| `ts-shared`                        | `tests-ts-shared.yml`            | `ts-shared`                       | None                     |
| `dev-tools`                        | `tests-tooling.yml`              | `tooling`                         | None                     |
| `static-analysis-tools`            | `tests-tooling.yml`              | `tooling`                         | None                     |
| `static-analysis-ast-grep`         | `tests-tooling.yml`              | `tooling`                         | None                     |
| `ci-tools`                         | `tests-tooling.yml`              | `tooling`                         | None                     |
| `github-actions`                   | `tests-tooling.yml`              | `tooling`                         | None                     |
| `git-hooks`                        | `tests-tooling.yml`              | `tooling`                         | None                     |
| `playwright-helpers`               | `tests-tooling.yml`              | `tooling`                         | None                     |
| `i18n-extract-codemod`             | `tests-tooling.yml`              | `tooling`                         | None                     |
| `docker-deploy`                    | `tests-tooling.yml`              | `tooling`                         | None                     |
| `i18n-route-bounds`                | `tests-tooling.yml`              | `i18n-route-bounds`               | None                     |
| `lambdas-portability`              | `tests-portability.yml`          | Linux + macOS portability         | None                     |
| `cloudflare-worker-portability`    | `tests-portability.yml`          | Linux + macOS portability         | None                     |
| `backend/data-stores/analytics`    | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend/services/analytics`       | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend-modules`                  | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend-no-data-mocks`            | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend-test-helpers`             | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend-contract-program`         | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend-email-templates`          | `tests-backend-modules.yml`      | `backend-modules`                 | None                     |
| `backend/analytics-integration`    | `tests-backend-unit.yml`         | `backend-tests`                   | None                     |
| `backend-data-stores`              | `tests-backend-unit.yml`         | `backend-tests`                   | None                     |
| `backend-platform-stats-cache`     | `tests-backend-unit.yml`         | `backend-tests`                   | None                     |
| `backend-mocks`                    | `tests-backend-unit.yml`         | `backend-tests`                   | None                     |
| `backend-real-glide-mq`            | `tests-backend-unit.yml`         | `backend-tests`                   | None                     |
| `backend-postgres-schema`          | `tests-postgres-schema.yml`      | `postgres-schema-tests`           | None                     |
| `backend-activitypub-capacity`     | `tests-postgres-schema.yml`      | `postgres-schema-tests`           | None                     |
| `backend-aws`                      | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | AWS tests role           |
| `backend-bedrock`                  | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | AWS tests role + Bedrock |
| `backend-openai`                   | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `OPENAI_API_KEY`         |
| `backend-openrouter`               | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `OPENROUTER_API_KEY`     |
| `backend-stripe`                   | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `STRIPE_SECRET_KEY`      |
| `web`                              | `tests-web.yml`                  | `web-tests` (sharded)             | None                     |
| `web-storybook`                    | `storybook.yml`                  | `storybook`                       | None                     |
| `web-storybook-component-coverage` | `storybook.yml`                  | `storybook`                       | None                     |
| `web-storybook-browser`            | `storybook.yml`                  | `storybook`                       | None                     |
| `web-api`                          | `tests-web-api.yml`              | `web-api-tests` (sharded)         | None                     |
| `web-integration`                  | `tests-web-integration.yml`      | `web-integration-tests` (sharded) | None                     |
| `lambdas`                          | `tests-lambdas.yml`              | `lambdas-tests`                   | None                     |
| `lambdas-mocks`                    | `tests-lambdas.yml`              | `lambdas-tests`                   | None                     |
| `cloudflare-worker`                | `tests-cloudflare-worker.yml`    | `cloudflare-worker-tests`         | None                     |
| `cloudflare-worker-mocks`          | `tests-cloudflare-worker.yml`    | `cloudflare-worker-tests`         | None                     |

<!-- END GENERATED -->

Current conventions for future credentialed suites all use
`tests-backend-credentialed.yml` / `backend-credentialed-tests`:

- AWS S3/SES uses `backend-aws`; include real S3 tests as `*.s3.test.mts`.
- AWS Bedrock uses `backend-bedrock`.
- OpenAI uses `backend-openai`.
- Stripe uses `backend-stripe`; include real Stripe tests as `*.stripe.test.mts`.
- Define each credentialed project in [`test-helpers/vitest-config/backend-credentialed-projects.mts`](../../../../test-helpers/vitest-config/backend-credentialed-projects.mts) with a literal `include` array, and add its `--project` flag to the workflow's run step. The transient-retry classifier derives its boundary from that list.

If a Playwright or web-integration test starts requiring external credentials, gate the credential setup with `if:` and make the suite skip when the env vars are absent.
