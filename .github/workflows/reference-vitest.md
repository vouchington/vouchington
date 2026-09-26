# Vitest

[Back to Workflow Reference](WORKFLOWS.md#vitest)

`ci.yml` starts each workflow below when its area path filter matches, when a pull request changes
`.github/workflows/**` or `.github/actions/**`, and on every merge group; each started workflow runs
its full suite and never runs for docs-only pull requests. `test-backend-unit`, `test-web`, and
`test-web-api` size shards from the live file count; `test-web-integration` keeps a one-shard
matrix. See [VITEST.md](VITEST.md) for the canonical project → workflow/job ownership table and
[area test suites](../../docs/development/ci.md#area-test-suites) for the trigger model.

The PR and merge-group orchestrator calls `checks-static.yml` once per application area and gates
that area's tests on static success. No test waits on another: shared TypeScript, backend, web,
API, and full-stack web-integration suites, both Playwright suites, and Docker validation all start
once `static-code-analysis` and their area static checks succeed or intentionally skip. Grouped main
workflows fan out the same way after their static checks.

Backend Uncredentialed Docker Tests (`tests-backend-unit.yml`) carries failure-only fork-exit
sentinel and diagnostic-report steps for the recurring backend unit post-pass worker-exit
signature (formerly filed as
jonathanong/filaments#8940). See
[Vitest Worker-Exit Diagnostics](../../docs/development/reference-vitest-worker-exit-diagnostics.md)
for the sentinel line format, the `VITEST_FORK_CRASH_INJECT` fault-injection allowlist, and the
signature-to-cause decision table.

| Workflow                                                      | Type     | Runner                             | Docker | Purpose                                                                                                                                                             |
| ------------------------------------------------------------- | -------- | ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Backend Module Tests](tests-backend-modules.yml)             | Reusable | `ubuntu-latest`                    | No     | Unsharded backend modules, local analytics, test helpers, email templates, and fully mocked tests with no service dependencies.                                     |
| [Backend Uncredentialed Docker Tests](tests-backend-unit.yml) | Reusable | `ubuntu-latest`                    | Yes    | Sharded service-backed backend Vitest projects. Every shard retains its Postgres/Valkey setup and migration.                                                        |
| [Backend Smoke](checks-backend-smoke.yml)                     | Reusable | `ubuntu-latest`                    | Yes    | Focused Postgres/Valkey migration plus deterministic allocated-port API and worker smoke. It runs in parallel with backend-unit shards.                             |
| [Backend Credentialed Tests](tests-backend-credentialed.yml)  | Reusable | `ubuntu-latest`                    | Yes    | Credentialed AWS, Bedrock, OpenAI, and Stripe backend tests.                                                                                                        |
| [PostgreSQL Schema Tests](tests-postgres-schema.yml)          | Reusable | `ubuntu-latest`                    | Yes    | Migration idempotence, PostgreSQL schema conventions, serialized ActivityPub inbox capacity contracts, and a schema-snapshot drift check.                           |
| [Web Tests](tests-web.yml)                                    | Reusable | `ubuntu-latest`                    | No     | Live-sized web unit-test shards; dependency/type checks, production build, and smoke moved to [Static Checks](checks-static.yml).                                   |
| [Web API Tests](tests-web-api.yml)                            | Reusable | `ubuntu-latest`                    | Yes    | Live-sized shards exercise `web/lib/api/**` directly against Postgres/Valkey and the backend. They do not build Next.js or the Cloudflare Worker.                   |
| [Web Integration Tests](tests-web-integration.yml)            | Reusable | `ubuntu-latest`                    | Yes    | Built Worker → Next.js → backend fetch tests use one fixed shard because full-stack build/setup dominates.                                                          |
| [Cloudflare Worker Tests](tests-cloudflare-worker.yml)        | Reusable | `ubuntu-latest`                    | No     | Linux-owned Cloudflare Worker Vitest coverage.                                                                                                                      |
| [Lambda Tests](tests-lambdas.yml)                             | Reusable | `ubuntu-latest`                    | No     | Linux-owned Lambda and shared Lambda package Vitest coverage.                                                                                                       |
| [Tooling Tests](tests-tooling.yml)                            | Reusable | `ubuntu-latest`                    | No     | Linux-owned static-analysis, dev-tool, CI-tool, Git hook, Playwright helper, and backend runtime audit tests; the all-route localization bound runs in its own job. |
| [Portability Tests](tests-portability.yml)                    | Both     | `ubuntu-latest` and `macos-latest` | No     | Runs four minimal host-sensitive projects on macOS and Linux with separate coverage reports; also runs directly for matching main changes.                          |
| [ts-shared Tests](tests-ts-shared.yml)                        | Reusable | `ubuntu-latest`                    | No     | Linux-owned shared TypeScript package Vitest coverage.                                                                                                              |
