# Vitest

[Back to Workflow Reference](WORKFLOWS.md#vitest)

Each area workflow starts when its area path filter matches, when a pull request changes
`.github/workflows/**` or `.github/actions/**`, and on every merge group; each started workflow runs
its full suite and never runs for docs-only pull requests. `test-backend-unit`, `test-web`, and
`test-web-api` size shards from the live file count; `test-web-integration` keeps a one-shard
matrix. See [VITEST.md](VITEST.md) for the canonical project → workflow/job ownership table and
[area test suites](../../ci.md#area-test-suites) for the trigger model.

Backend shard coverage includes registered disposable-database cases. Coverage-enabled parent runs
give each child a unique report directory; the shard merges those child reports with its parent
LCOV before uploading the full artifact. Ordinary runs leave child coverage disabled.
Child reports include executed scripts; the parent supplies zero-count sources. Parent wrapper
deadlines account for bootstrap, child execution/reporting and cleanup, while child test bodies
retain their normal deadline.

The all-route localization bounds project also runs independently for its catalog, web, extraction,
and test/configuration inputs. The Tooling workflow passes `run_tooling: false` to
`tests-tooling.yml` for a bounds-only run, so no regular tooling tests or coverage artifacts are
produced. Direct reusable and manual invocations default to running both jobs. See the
[pull-request routing](reference-workflow-automation-pull-requests.md).

The PR and merge-group orchestrator calls `checks-static.yml` once per application area and gates
that area's tests on static success. No test waits on another: shared TypeScript, backend, web,
API, and full-stack web-integration suites, both Playwright suites, and Docker validation all start
once `static-code-analysis` and their area static checks succeed or intentionally skip. Grouped main
workflows fan out the same way after their static checks.

**Worker-exit crash diagnostics were removed.** The self-hosted-era fork-exit sentinel, Node
diagnostic-report capture and summary, worker-exit reporter, and saturation fd-2 sentinel are gone.
They targeted a post-pass worker-exit flake seen on self-hosted runners (a CPU-contention race whose
transient-retry rule was already removed). None of the 49 failed GitHub-hosted runs checked after
the 2026-09-16 runner switch was a worker exit, and the sentinel's only output was its routine
`mode=signal:SIGTERM code=143` line. That is a short window, so removal is supported rather than
proven safe. A hosted worker exit still fails loudly through Vitest's own
`Worker exited unexpectedly` error, and `hanging-process`, the `[vitest-teardown-overrun]` reporter,
and fork-leak detection remain.

- **Restore rule:** bring crash diagnostics back only after a worker exit is actually reproduced on a
  hosted runner. Revision `4b8fc08f8` is the last one that has them; restore from it instead of
  writing another instrumentation pass. A SIGTERM listener in a fork removes Node's default
  terminate-on-SIGTERM, so a restored sentinel must exit explicitly.
- **If it recurs unexplained:** file the captured exit code and signal on
  [vitest-dev/vitest#8766](https://github.com/vitest-dev/vitest/issues/8766), the datum that got
  [#9762](https://github.com/vitest-dev/vitest/issues/9762) closed as not planned, and propose a
  scoped `pool: 'threads'` migration. Threads are not a drop-in for the backend projects (see
  [Pools, Isolation, and Vitest 5](../../reference-tests-vitest-projects.md#pools-isolation-and-vitest-5)).
- **Do not conflate look-alikes:** the earlier #9088 post-pass exit was `worker-io`'s prewarm serve
  path binding an un-closeable TCP listener on a fallback port. It is fixed by binding only when
  `NODE_PREWARM_PORT` is set. Check a new occurrence is not that before calling it this flake.

The static backend job validates fixture bodies and their explicit contract snapshots without
compiler API discovery. PostgreSQL row type verification runs as an independent check. Vitest
retains runtime schema, handler, and MCP catalog coverage; compiler-host and virtual schema tests
remain limited to their independent owners. Runtime projects retain coverage collection and LCOV gates.

| Workflow                                                                                    | Type     | Runner             | Docker | Purpose                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | -------- | ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Backend Module Tests](../../../../.github/workflows/tests-backend-modules.yml)             | Reusable | `ubuntu-latest`    | No     | Unsharded backend modules, local analytics, test helpers, email templates, and fully mocked tests with no service dependencies.                                     |
| [Backend Uncredentialed Docker Tests](../../../../.github/workflows/tests-backend-unit.yml) | Reusable | `ubuntu-latest`    | Yes    | Sharded service-backed backend Vitest projects. Every shard retains its Postgres/Valkey setup and migration.                                                        |
| [Backend Smoke](../../../../.github/workflows/checks-backend-smoke.yml)                     | Reusable | `ubuntu-latest`    | Yes    | Focused Postgres/Valkey migration plus deterministic allocated-port API and worker smoke. It runs in parallel with backend-unit shards.                             |
| [Backend Credentialed Tests](../../../../.github/workflows/tests-backend-credentialed.yml)  | Reusable | `ubuntu-latest`    | Yes    | Credentialed backend provider probe tests.                                                                                                                          |
| [PostgreSQL Schema Tests](../../../../.github/workflows/tests-postgres-schema.yml)          | Reusable | `ubuntu-latest`    | Yes    | Migration idempotence, PostgreSQL schema conventions, serialized ActivityPub inbox capacity contracts, and a schema-snapshot drift check.                           |
| [Web Tests](../../../../.github/workflows/tests-web.yml)                                    | Reusable | `ubuntu-24.04-arm` | No     | Live-sized web unit-test shards; dependency/type checks, production build, and smoke moved to [Static Checks](../../../../.github/workflows/checks-static.yml).     |
| [Web API Tests](../../../../.github/workflows/tests-web-api.yml)                            | Reusable | `ubuntu-24.04-arm` | Yes    | Live-sized shards exercise `web/lib/api/**` directly against Postgres/Valkey and the backend. They do not build Next.js or the Cloudflare Worker.                   |
| [Web Integration Tests](../../../../.github/workflows/tests-web-integration.yml)            | Reusable | `ubuntu-24.04-arm` | Yes    | Built Worker → Next.js → backend fetch tests use one fixed shard because full-stack build/setup dominates.                                                          |
| [Cloudflare Worker Tests](../../../../.github/workflows/tests-cloudflare-worker.yml)        | Reusable | `ubuntu-latest`    | No     | Linux-owned Cloudflare Worker Vitest coverage.                                                                                                                      |
| [Lambda Tests](../../../../.github/workflows/tests-lambdas.yml)                             | Reusable | `ubuntu-latest`    | No     | Linux-owned Lambda and shared Lambda package Vitest coverage.                                                                                                       |
| [Tooling Tests](../../../../.github/workflows/tests-tooling.yml)                            | Reusable | `ubuntu-latest`    | No     | Linux-owned static-analysis, dev-tool, CI-tool, Git hook, Playwright helper, and backend runtime audit tests; the all-route localization bound runs in its own job. |
| [Portability Tests](../../../../.github/workflows/tests-portability.yml)                    | Reusable | `ubuntu-latest`    | No     | Runs two minimal host-sensitive projects on Linux with scoped coverage; called by the Tooling area workflow or dispatched manually.                                 |
| [ts-shared Tests](../../../../.github/workflows/tests-ts-shared.yml)                        | Reusable | `ubuntu-latest`    | No     | Linux-owned shared TypeScript package Vitest coverage.                                                                                                              |
