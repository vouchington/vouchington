# Vitest

[Back to Workflow Reference](WORKFLOWS.md#vitest)

On pull requests, `ci.yml`'s `select-ci` call delegates to
[CI select-vitest](ci-select-vitest.yml), whose `ci/vitest/ci-select.mts` step narrows
which of the workflows below actually run and sizes `test-backend-unit`, `test-web`, and
`test-web-api` shards from affected files; `test-web-integration` has an independently wired
one-shard matrix for future manual expansion. It also narrows the Storybook browser test step. It
fails open to the full suite on any
error and never runs on `main`. See [VITEST.md](VITEST.md) for the canonical project → workflow/job
ownership table and [Vitest CI Selection](../../docs/development/ci.md#vitest-ci-selection) for the
selection design.

The PR orchestrator calls `checks-static.yml` once per application area and hard-gates only that
area's tests. Shared TypeScript tests settle before their consuming backend suites; web Vitest
settles before the API and full-stack web-integration sibling suites. Both Playwright suites start only after the selected application
Vitest roots settle, but ordinary test failure or skip does not suppress them. Tooling,
portability, native clients, and Storybook are intentionally outside that ordering.

Backend Uncredentialed Docker Tests (`tests-backend-unit.yml`) carries failure-only fork-exit
sentinel, diagnostic-report, and host-pressure steps for the recurring
`backend-unit-vitest-worker-exit-after-pass` signature (formerly filed as
jonathanong/filaments#8940). See
[Vitest Worker-Exit Diagnostics](../../docs/development/reference-vitest-worker-exit-diagnostics.md)
for the sentinel line format, the `VITEST_FORK_CRASH_INJECT` fault-injection allowlist, and the
signature-to-cause decision table.

| Workflow                                                      | Type     | Runner                                                                              | Docker | Purpose                                                                                                                                                                         |
| ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CI select-vitest](ci-select-vitest.yml)                      | Reusable | `[self-hosted]`                                                                     | No     | Computes fixed Vitest and topology-impact outputs for the root `select-ci` call. Global uncertainty fails open; bounded workflow/action changes select only reachable CI roots. |
| [Backend Module Tests](tests-backend-modules.yml)             | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | No     | Unsharded backend modules, local analytics, test helpers, email templates, and fully mocked tests with no service dependencies.                                                 |
| [Backend Uncredentialed Docker Tests](tests-backend-unit.yml) | Reusable | `[self-hosted]` prep; `[self-hosted, Linux, Docker, Tests]` test shards             | Yes    | Sharded service-backed backend Vitest projects. Every shard retains its Postgres/Valkey setup and migration.                                                                    |
| [Backend Smoke](checks-backend-smoke.yml)                     | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | Yes    | Focused Postgres/Valkey migration plus deterministic allocated-port API and worker smoke. It runs in parallel with selected backend-unit shards.                                |
| [Backend Credentialed Tests](tests-backend-credentialed.yml)  | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | Yes    | Credentialed AWS, Bedrock, OpenAI, and Stripe backend tests.                                                                                                                    |
| [PostgreSQL Schema Tests](tests-postgres-schema.yml)          | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | Yes    | Migration idempotence, PostgreSQL schema conventions, serialized ActivityPub inbox capacity contracts, and a schema-snapshot drift check.                                       |
| [Web Tests](tests-web.yml)                                    | Reusable | `[self-hosted]` prep; `[self-hosted, Linux, Docker, Tests]` test shards             | No     | Live-sized web unit-test shards run on the self-hosted Tests pool; dependency/type checks, production build, and smoke moved to [Static Checks](checks-static.yml).             |
| [Web API Tests](tests-web-api.yml)                            | Reusable | `[self-hosted]` prep; `[self-hosted, Linux, Docker, Tests]` test shards             | Yes    | Live-sized shards exercise `web/lib/api/**` directly against Postgres/Valkey and the backend. They do not build Next.js or the Cloudflare Worker and do not reserve `CPU`.      |
| [Web Integration Tests](tests-web-integration.yml)            | Reusable | `[self-hosted]` prep; `[self-hosted, Linux, Docker, Tests, CPU]` test shards        | Yes    | Built Worker → Next.js → backend fetch tests use one fixed shard because full-stack build/setup dominates; a validated manual override can expand its matrix.                   |
| [Cloudflare Worker Tests](tests-cloudflare-worker.yml)        | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | No     | Linux-owned Cloudflare Worker Vitest coverage.                                                                                                                                  |
| [Lambda Tests](tests-lambdas.yml)                             | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | No     | Linux-owned Lambda and shared Lambda package Vitest coverage.                                                                                                                   |
| [Tooling Tests](tests-tooling.yml)                            | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | No     | Linux-owned static-analysis, dev-tool, CI-tool, Git hook, Playwright helper, and backend runtime audit tests; the all-route localization bound runs in its own job.             |
| [Portability Tests](tests-portability.yml)                    | Both     | paired jobs (`[self-hosted, Linux, Docker, Tests]` + `[self-hosted, macOS, Tests]`) | No     | Runs four minimal host-sensitive projects on macOS and Linux with separate coverage reports; also runs directly for matching main changes.                                      |
| [ts-shared Tests](tests-ts-shared.yml)                        | Reusable | `[self-hosted, Linux, Docker, Tests]`                                               | No     | Linux-owned shared TypeScript package Vitest coverage.                                                                                                                          |
