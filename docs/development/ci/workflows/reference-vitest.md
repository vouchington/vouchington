# Vitest

Each area workflow starts when its area path filter matches, when a pull request changes
`.github/workflows/**` or `.github/actions/**`, and on every merge group; each started workflow runs
its full suite and never runs for docs-only pull requests. `test-backend-unit`, `test-web`, and
`test-web-api` size shards from the live file count; `test-web-integration` keeps a one-shard
matrix. See [area test suites](../../ci.md#area-test-suites) for the trigger model.

The all-route localization bounds project also runs independently for its catalog, web, extraction,
and test/configuration inputs. The Tooling workflow passes `run_tooling: false` to
`tests-tooling.yml` for a bounds-only run, so no regular tooling tests or coverage artifacts are
produced. Direct reusable and manual invocations default to running both jobs.

The PR and merge-group orchestrator calls `checks-static.yml` once per application area and gates
that area's tests on static success. No test waits on another: shared TypeScript, backend, web,
API, and full-stack web-integration suites, both Playwright suites, and Docker validation all start
once `static-code-analysis` and their area static checks succeed or intentionally skip. Grouped main
workflows fan out the same way after their static checks.

| Workflow                                                                                    | Type     | Runner             | Docker | Purpose                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------- | ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Backend Module Tests](../../../../.github/workflows/tests-backend-modules.yml)             | Reusable | `ubuntu-latest`    | No     | Unsharded backend modules, local analytics, test helpers, email templates, and fully mocked tests with no service dependencies.                                     |
| [Backend Uncredentialed Docker Tests](../../../../.github/workflows/tests-backend-unit.yml) | Reusable | `ubuntu-latest`    | Yes    | Sharded service-backed backend Vitest projects. Every shard retains its Postgres/Valkey setup and migration.                                                        |
| [Backend Smoke](../../../../.github/workflows/checks-backend-smoke.yml)                     | Reusable | `ubuntu-latest`    | Yes    | Focused Postgres/Valkey migration plus deterministic allocated-port API and worker smoke. It runs in parallel with backend-unit shards.                             |
| [Backend Credentialed Tests](../../../../.github/workflows/tests-backend-credentialed.yml)  | Reusable | `ubuntu-latest`    | Yes    | Informational credentialed backend provider smoke checks; not in the `backend` gate.                                                                                |
| [PostgreSQL Schema Tests](../../../../.github/workflows/tests-postgres-schema.yml)          | Reusable | `ubuntu-latest`    | Yes    | Migration idempotence, PostgreSQL schema conventions, serialized ActivityPub inbox capacity contracts, and a schema-snapshot drift check.                           |
| [Web Tests](../../../../.github/workflows/tests-web.yml)                                    | Reusable | `ubuntu-24.04-arm` | No     | Live-sized web unit-test shards; dependency/type checks, production build, and smoke moved to [Static Checks](../../../../.github/workflows/checks-static.yml).     |
| [Web API Tests](../../../../.github/workflows/tests-web-api.yml)                            | Reusable | `ubuntu-24.04-arm` | Yes    | Live-sized shards exercise `web/lib/api/**` directly against Postgres/Valkey and the backend. They do not build Next.js or the Cloudflare Worker.                   |
| [Web Integration Tests](../../../../.github/workflows/tests-web-integration.yml)            | Reusable | `ubuntu-24.04-arm` | Yes    | Built Worker → Next.js → backend fetch tests use one fixed shard because full-stack build/setup dominates.                                                          |
| [Cloudflare Worker Tests](../../../../.github/workflows/tests-cloudflare-worker.yml)        | Reusable | `ubuntu-latest`    | No     | Linux-owned Cloudflare Worker Vitest coverage.                                                                                                                      |
| [Lambda Tests](../../../../.github/workflows/tests-lambdas.yml)                             | Reusable | `ubuntu-latest`    | No     | Linux-owned Lambda and shared Lambda package Vitest coverage.                                                                                                       |
| [Tooling Tests](../../../../.github/workflows/tests-tooling.yml)                            | Reusable | `ubuntu-latest`    | No     | Linux-owned static-analysis, dev-tool, CI-tool, Git hook, Playwright helper, and backend runtime audit tests; the all-route localization bound runs in its own job. |
| [Portability Tests](../../../../.github/workflows/tests-portability.yml)                    | Reusable | `ubuntu-latest`    | No     | Runs two minimal host-sensitive projects on Linux with scoped coverage; called by the Tooling area workflow or dispatched manually.                                 |
| [ts-shared Tests](../../../../.github/workflows/tests-ts-shared.yml)                        | Reusable | `ubuntu-latest`    | No     | Linux-owned shared TypeScript package Vitest coverage.                                                                                                              |
