# Vitest CI Mapping

**Single source of truth:** [`ci/vitest/project-ownership.mts`](../../../../ci/vitest/project-ownership.mts)'s `VITEST_OWNERSHIP` is the canonical model of which CI job owns each Vitest project. The table below is generated from it — do not hand-edit the rows between the `GENERATED` markers. To add, move, rename, or remove a project: edit `project-ownership.mts`, then run `node ci/vitest/generate-ownership-table.mts` to refresh this file. Three checks enforce that the model, the real workflow `--project` commands, and this table never drift apart: [`ci/vitest/project-ownership.test.mts`](../../../../ci/vitest/project-ownership.test.mts) (model totality against `vitest.config.mts`), [`vitest-project-ownership.test.mts`](../../../../.github/workflows/vitest-project-ownership.test.mts) (model against the literal/tooling-registry/portability-group/storybook `--project` invocations in `.github/workflows/`), and `node ci/vitest/generate-ownership-table.mts --check` (model against this file, run in `static-code-analysis.yml`).

Every Vitest project defined in [`../../vitest.config.mts`](../../../../vitest.config.mts) must be listed here and owned by exactly one CI workflow. An owning workflow may run the project in multiple platform jobs or shards.

Each area workflow starts its owning projects when its area path filter matches the pull-request or
merge-group diff, and a selected area runs its full suites; CI never selects individual test files.
[`ci/vitest/project-ownership-registry.mts`](../../../../ci/vitest/project-ownership-registry.mts) derives
the project → job map and shard policies from `VITEST_OWNERSHIP`. See [area test suites](../../ci.md#area-test-suites).

With `VITEST_DIAGNOSTICS=1`, backend data-store setup emits synchronous phase start and completion
records. Failures emit a phase record even when diagnostics are off. The records identify imports,
seeding, each dynamic configuration, and bloom warmups before a test file is assigned. With
diagnostics enabled, inspect the last open phase when file-progress logs have not started. Setup
drains every started parallel operation before reporting distinct failures;
subscription-client connection bounds belong to the installed Valkey dependency. The setup owner is
[`vitest.setup.data-stores.mts`](../../../../test-helpers/vitest.setup.data-stores.mts).

Credentialed projects must use workflow, job, or step `if:` gates so untrusted PRs from forks, Dependabot, or Renovate do not receive API keys, repository secrets, or OIDC-assumed cloud roles. Trusted workflow selection keeps keyless contexts out of credentialed projects. A selected credentialed case fails when its required credential is missing; it must not skip.

Each area's path filters must trigger the owning workflow when a project’s source files, test
files, or explicit repo fixture files change. Fixture docs that tests read directly, such as this
file and `docs/prompts/automation/` plus `docs/prompts/scheduled/` templates, are intentionally
not treated as docs-only.

Reporter policy:

- Local Vitest commands without diagnostics should not force a reporter. Let Vitest use its default reporter behavior, including its automatic `minimal` reporter when it detects an AI coding agent. With `VITEST_DIAGNOSTICS=1`, the local run uses Vitest's default reporter alongside file progress so failures stay visible.
- CI Vitest commands set `VITEST_CI_REPORTERS: run` and `VITEST_JUNIT_OUTPUT_FILE`; do not pass
  reporter or output-file CLI flags.
- Routine Vitest diagnostics are silent by default. Set `VITEST_DIAGNOSTICS=1` for local runs or
  the `VITEST_DIAGNOSTICS` repository variable for backend-unit, credentialed backend, web-api,
  web-integration, and PostgreSQL schema CI runs. The backend-unit workflow also accepts a
  `diagnostics` boolean for a manual dispatch or reusable workflow call. This enables file progress,
  setup and teardown timings, and backend runner samples. Failures, JUnit output, summaries, timeout
  diagnostics, and Storybook browser progress markers remain active.
- `vitest.config.mts` owns the CI reporter list: `minimal`, configured `github-actions`, `junit`,
  `hanging-process`, and the CI-only teardown-overrun reporter, which prints process and
  active-resource context when Vitest's exit watchdog fires at `teardownTimeout`.
  With diagnostics enabled, the backend-unit reporter prints each test file when a worker starts it
  and when it finishes.
- With diagnostics enabled, the backend-unit step streams three background samples to the shard log. `[backend-unit-resources]`
  records memory, disk and the largest processes every 15 seconds. `[backend-unit-pg-waits]` runs
  [`ci/backend-unit-pg-waits.sql`](../../../../ci/backend-unit-pg-waits.sql) every half second and
  prints a row only for a blocked or blocking backend, or one statement that has run for 1.5 seconds
  or longer, with its wait event, blockers and ungranted locks. `[backend-unit-pressure]` records
  `vmstat` (user, system, idle, iowait and hypervisor steal) and the `/proc/pressure` averages every
  2 seconds. A test-database statement that stalls until the 20 second `statement_timeout`
  (`[pg-query-failed]`) is attributed from these lines, not from the final error.
- The `github-actions` reporter must keep job summaries disabled and file links configured from GitHub environment variables.
- `tests-backend-unit.yml` uploads each shard's JUnit report as the one-day `backend-junit-shard-N`
  artifact, so per-file durations can be aggregated across shards when auditing shard size. Vitest
  writes the report when the run finishes, so a shard killed by its step timeout uploads nothing.
- `tests-web.yml` retains each shard's existing one-day `web-test-report-shard-N` JUnit artifact
  after successful or failed, non-cancelled runs. `tests-backend-modules.yml`, `tests-tooling.yml`,
  and `tests-ts-shared.yml` likewise retain their existing JUnit output files as one-day
  `backend-modules-junit`, `tooling-junit`, and `ts-shared-junit` artifacts. Uploads are diagnostic:
  a missing report warns, and an upload failure does not replace the test result. These reports
  supply per-test timings for the timeout audit; the cleanup sweep keeps them until their one-day
  expiry. Cancelled runs may have no report.

Backend tests use the shared dirty database and ownership-scoped fixtures under
[rule R1](../../tests.md#test-suite-rules). With coverage enabled, `tests-backend-unit.yml`
requires a nonempty parent-shard LCOV report and preserves it for the full-coverage upload.

<!-- BEGIN GENERATED: vitest-ownership -->

| Vitest project                        | Workflow                         | Job                               | Credential requirement           |
| ------------------------------------- | -------------------------------- | --------------------------------- | -------------------------------- |
| `ts-shared`                           | `tests-ts-shared.yml`            | `ts-shared`                       | None                             |
| `dev-tools`                           | `tests-tooling.yml`              | `tooling`                         | None                             |
| `static-analysis-tools`               | `tests-tooling.yml`              | `tooling`                         | None                             |
| `static-analysis-ast-grep`            | `tests-tooling.yml`              | `tooling`                         | None                             |
| `ci-tools`                            | `tests-tooling.yml`              | `tooling`                         | None                             |
| `github-actions`                      | `tests-tooling.yml`              | `tooling`                         | None                             |
| `git-hooks`                           | `tests-tooling.yml`              | `tooling`                         | None                             |
| `playwright-helpers`                  | `tests-tooling.yml`              | `tooling`                         | None                             |
| `i18n-extract-codemod`                | `tests-tooling.yml`              | `tooling`                         | None                             |
| `docker-deploy`                       | `tests-tooling.yml`              | `tooling`                         | None                             |
| `i18n-route-bounds`                   | `tests-tooling.yml`              | `i18n-route-bounds`               | None                             |
| `lambdas-portability`                 | `tests-portability.yml`          | Linux portability                 | None                             |
| `cloudflare-worker-portability`       | `tests-portability.yml`          | Linux portability                 | None                             |
| `backend/data-stores/analytics`       | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend/services/analytics`          | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend-modules`                     | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend-no-data-mocks`               | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend-test-helpers`                | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend-contract-artifacts`          | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend-email-templates`             | `tests-backend-modules.yml`      | `backend-modules`                 | None                             |
| `backend/analytics-integration`       | `tests-backend-unit.yml`         | `backend-tests`                   | None                             |
| `backend-data-stores`                 | `tests-backend-unit.yml`         | `backend-tests`                   | None                             |
| `backend-platform-stats-cache`        | `tests-backend-unit.yml`         | `backend-tests`                   | None                             |
| `backend-mocks`                       | `tests-backend-unit.yml`         | `backend-tests`                   | None                             |
| `backend-real-glide-mq`               | `tests-backend-unit.yml`         | `backend-tests`                   | None                             |
| `backend-embedding-creation-capacity` | `tests-backend-unit.yml`         | `backend-tests`                   | None                             |
| `backend-postgres-schema`             | `tests-postgres-schema.yml`      | `postgres-schema-tests`           | None                             |
| `backend-activitypub-capacity`        | `tests-postgres-schema.yml`      | `postgres-schema-tests`           | None                             |
| `backend-aws`                         | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | AWS tests role                   |
| `backend-bedrock`                     | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | AWS tests role + Bedrock         |
| `backend-openai`                      | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `OPENAI_API_KEY`                 |
| `backend-openrouter`                  | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `OPENROUTER_API_KEY`             |
| `backend-stripe`                      | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `STRIPE_SECRET_KEY`              |
| `backend-lightpanda`                  | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | `LIGHTPANDA_TOKEN`               |
| `backend-anthropic`                   | `tests-backend-credentialed.yml` | `backend-credentialed-tests`      | ANTHROPIC_AUTH_TOKEN (federated) |
| `web`                                 | `tests-web.yml`                  | `web-tests` (sharded)             | None                             |
| `web-storybook`                       | `storybook.yml`                  | `storybook`                       | None                             |
| `web-storybook-component-coverage`    | `storybook.yml`                  | `storybook`                       | None                             |
| `web-storybook-browser`               | `storybook.yml`                  | `storybook`                       | None                             |
| `web-api`                             | `tests-web-api.yml`              | `web-api-tests` (sharded)         | None                             |
| `web-integration`                     | `tests-web-integration.yml`      | `web-integration-tests` (sharded) | None                             |
| `lambdas`                             | `tests-lambdas.yml`              | `lambdas-tests`                   | None                             |
| `lambdas-mocks`                       | `tests-lambdas.yml`              | `lambdas-tests`                   | None                             |
| `cloudflare-worker`                   | `tests-cloudflare-worker.yml`    | `cloudflare-worker-tests`         | None                             |
| `cloudflare-worker-mocks`             | `tests-cloudflare-worker.yml`    | `cloudflare-worker-tests`         | None                             |

<!-- END GENERATED -->

Current conventions for future credentialed suites all use
`tests-backend-credentialed.yml` / `backend-credentialed-tests`:

- Define each credentialed project in [`test-helpers/vitest-config/backend-credentialed-projects.mts`](../../../../test-helpers/vitest-config/backend-credentialed-projects.mts) with a literal `include` array, and add its `--project` flag to the workflow's run step. That list owns each project's name and `include` globs. The runner groups derive from it.
- A credentialed suite is an informational smoke check: it is not in the `backend` gate and publishes no coverage. Gate the same behavior with a recorded-response fixture test in a unit project, named so it does not match the project's `include` glob ([live-provider smoke checks](../../tests.md#live-provider-smoke-checks)).

If a Playwright or web-integration test requires external credentials, gate credentialed project selection and credential setup with the trusted workflow boundary. A selected case fails if its required credential is absent.

Embedding creation capacity runs first through the normal project group-order barrier on its
assigned shard, using the existing PostgreSQL/Valkey services and migration. Remaining selected
projects then use the same persistent database. JUnit and LCOV remain the ordinary shard outputs.
