# Tests and Checks

Run the cheap before-push commands in [commit.md](../checklists/commit.md#before-pushing), then push. GitHub Actions is the full gate. See [ci.md](ci.md) for CI workflow, config, and coverage details.

The staged production no-op Promise-catch rule, its inventory, and its remediation/promotion
sequence are part of [Linters and Static Analysis](reference-tests-linters-and-static-analysis.md).

The runtime-backed Oxlint TypeScript-plugin regression belongs to `static-analysis-tools`; run it
with `pnpm exec vitest run --project static-analysis-tools static-code-analysis/oxlint-plugin/typescript-plugin-oxlint.test.mts`.
The test uses the configured analyzer rather than injecting a plugin; see the
[static-analysis guide](../../static-code-analysis/README.md).

**Init column:** `monorepo` = `./dev/initialize monorepo` is sufficient. `web` = requires `./dev/initialize web` (Docker, DB, Valkey, `.env`, HTTPS certs, CF Worker env). A row marked `web` here is the tested/documented baseline, not necessarily a hard floor — some `web`-tagged commands only need DB/Valkey and would also pass under `./dev/initialize backend`; when in doubt, initialize `web`.

**Sourcing `.env`:** `./dev/initialize` writes `.env` but does not export it into your shell. `./dev/tmux`'s service windows source it automatically. Before running a DB/Valkey-backed command in your own shell, run `source .env`; otherwise the data-store globalSetup fails with `DATABASE_URL is not set in the current shell`.

## Test suite rules

These rules apply to backend, web, and tooling tests, and to every file a test change touches. R1–R4 and R6–R7 fail CI on new violations. A file that already violates a check stays on that check's frozen baseline until the cleanup issue for that rule removes the violation. Cleanup pull requests do not edit the baseline. R5 and R8 have their own checks in the issues that own them. R9–R13 are guidance.

- **R1. Shared database.** A test does not create a database. It uses the shared dirty database and asserts only rows it created. Scope with owned ids, an owned-row cursor, or an advisory-lock reservation such as `acquireTestAiUsageDateReservation`. Patterns live in [parallel safety](reference-tests-parallel-safety-and-test-root-hygiene.md) and [test helpers](testing/backend/helpers.md).
- **R2. No schema changes.** No DDL, `TRUNCATE`, `ALTER DATABASE`, `ALTER SYSTEM`, or `session_replication_role` in tests, helpers, or Vitest setup. Inject a write failure with a throwing `QueryExecutor`. Migration tooling tests assert the SQL it generates. CI's migrate step and `db:snapshot:check` cover execution. See [failure injection](reference-tests-parallel-safety-and-test-root-hygiene.md#failure-injection-uses-a-query-executor).
- **R3. Event waits.** Do not wait with `setTimeout`, `setInterval`, `setImmediate`, `node:timers/promises`, `pg_sleep`, `waitForCondition`, `pollUntil*`, `vi.waitFor`, `vi.waitUntil`, `expect.poll`, or the database clock. Wait on the returned promise, a queue event, pub/sub, `LISTEN/NOTIFY`, or an injected or fake clock. Do not add a test-only branch to production code. Web tests may use Testing Library `findBy*`.
- **R4. Smallest fixture.** Cross each boundary with the fewest rows. Lower a DynamicConfig work limit with `overrideDynamicConfigFieldsForTest`. Scale, plan, wall-time, heap, and pool checks belong in [explain-analyze](postgresql/explain-analyze/README.md). Unit tests do not assert `performance.now()` or `process.memoryUsage()`.
- **R5. Allowlisted network.** A real call may go only to `example.com`, `example.net`, `example.org`, or loopback. The Vitest setup rejects other hosts. Fix a flake in production code, not with a skip.
- **R6. No skips.** No `.skip`, `.skipIf`, `.runIf`, `.only`, `.todo`, `.fixme`, or `context.skip()`. A credentialed test runs only in the credentialed workflow. A missing credential fails the test.
- **R7. Timeouts.** Vitest and Playwright tests have a 30-second maximum. Vitest per-test, hook, and describe overrides stay at or below that cap; Playwright cannot extend a test deadline. Fix a slow test instead of raising the timeout. Moving Vitest project defaults to 5 seconds is the timeout cleanup in #2149; its existing override violations remain on the frozen baseline until then.
- **R8. No repository-wide tooling.** A unit test does not generate a schema snapshot, run a full migrate, lint or analyze the repository, spawn Vitest, or run a build. Those jobs have their own workflows. A tool's own tests use a small fixture.
- **R9. Injected clock.** A result must not depend on the real time of day, date, time zone, or day boundary. Pass a clock or `now`, or use fake timers. `Date.now()` used only to build a unique id is fine. `crypto.randomUUID()` is preferred.
- **R10. Behavior.** Test the behavior this repository owns, not a dependency's internals. See [test value](reference-tests-value-and-reduction.md).
- **R11. Absent results.** Before asserting that nothing happened, wait for the event that would have caused it. Process a sibling item in the same pass, then assert that the target was skipped.
- **R12. Deleting a test.** Delete a redundant test when line and branch coverage of the production file it exercises does not drop. Compare `pnpm exec vitest run --project <project> <test files> --coverage --coverage.include=<production file>` with and without the test, and put both numbers in the pull request. If coverage would drop, rewrite the test. See [test value](reference-tests-value-and-reduction.md).
- **R13. API contracts.** A new option on an internal service function is fine. A new or changed REST route, query parameter, or MCP tool parameter needs [client parity](../requirements/CLIENT-PARITY-MATRIX.md) and an owner decision.

Dirty-database proof for a changed database test: run the file twice on the same database without resetting it, then run two processes on that file at the same time.

`forbidden-calls` enforces the timer, isolated-database, benchmark, and live no-mistakes analysis bans. ast-grep enforces executed DDL, `pg_sleep`, skips, the 30-second cap, and oversized `Array.from({ length })` / `it.each` fixtures until `no-mistakes` ships statement policy (jonathanong/no-mistakes#1562, #1563, #1564), `test-no-skips` (#1565), and `vitest-timeout-cap` (#1566).

## Contents

- [Test Suite Rules](#test-suite-rules)
- <a id="test-command-matrix"></a>[Test Command Matrix](reference-tests-command-matrix.md)
- <a id="local-web-validation-recovery"></a>[Local Web Validation Recovery](reference-tests-local-web-validation-recovery.md)
- <a id="first-push-deterministic-preflight"></a>[First-Push Deterministic Preflight](reference-tests-first-push-deterministic-preflight.md)
- <a id="linters-and-static-analysis"></a>[Linters and Static Analysis](reference-tests-linters-and-static-analysis.md)
- <a id="claudemd-and-agentsmd-size-cap"></a>[AGENTS.md Size Cap](reference-tests-claude-md-and-agents-md-size-cap.md)
- <a id="vitest-projects"></a>[Vitest Projects](reference-tests-vitest-projects.md)
- <a id="pools-isolation-and-vitest-5"></a>[Pools, Isolation, and Vitest 5](reference-tests-vitest-projects.md#pools-isolation-and-vitest-5)
- <a id="parallel-safety-and-test-root-hygiene"></a>[Parallel-Safety and Test-Root Hygiene](reference-tests-parallel-safety-and-test-root-hygiene.md)
- <a id="route-test-server-errors"></a>[Route-Test Server Errors](reference-tests-parallel-safety-and-test-root-hygiene.md#unexpected-route-test-500s-print-the-server-error)
- <a id="test-value-and-safe-reduction"></a>[Test Value and Safe Reduction](reference-tests-value-and-reduction.md)
- <a id="vitest-mock-typing"></a>[Vitest Mock Typing](reference-tests-vitest-mock-typing.md)
- <a id="storybook-a11y-exceptions"></a>[Storybook A11y Exceptions](reference-tests-storybook-a11y-exceptions.md)
- <a id="smoke-tests"></a>[Smoke Tests](reference-tests-smoke-tests.md)
- <a id="e2e-and-visual"></a>[E2E and Visual](reference-tests-e2e-and-visual.md)
- <a id="playwright-matchers-and-helpers"></a>[Playwright Matchers and Helpers](reference-tests-playwright-matchers-and-helpers.md)
- <a id="schema-checks"></a>[Schema Checks](reference-tests-schema-checks.md)
- <a id="translation-catalog-and-locale-checks"></a>[Translation Catalog and Locale Checks](reference-tests-translation-catalog-and-locale-checks.md)
