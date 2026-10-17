# Tests and Checks

Run the cheap before-push commands in [commit.md](../checklists/commit.md#before-pushing), then push. GitHub Actions is the full gate. See [ci.md](ci.md) for CI workflow, config, and coverage details.

DB-backed commands need `source .env` after `./dev/initialize`, which writes `.env` but does not export it.

## Test suite rules

These rules apply to backend, web, and tooling tests, and to every file a test change touches. R1–R4 and R6–R7 fail CI on new violations. A file that already violates a check stays on that check's frozen baseline until the cleanup issue for that rule removes the violation. Cleanup pull requests do not edit the baseline. R5 and R8 have their own checks in the issues that own them. R9–R13 are guidance.

- **R1. Shared database.** A test does not create a database. It uses the shared dirty database and asserts only rows it created. Scope with owned ids, an owned-row cursor, or an advisory-lock reservation such as `acquireTestAiUsageDateReservation`. Patterns live in [parallel safety](reference-tests-parallel-safety-and-test-root-hygiene.md).
- **R2. No schema changes.** No DDL, `TRUNCATE`, `ALTER DATABASE`, `ALTER SYSTEM`, or `session_replication_role` in tests, helpers, or Vitest setup. Inject a write failure with a throwing `QueryExecutor`. Migration tooling tests assert the SQL it generates. CI's migrate step and `db:snapshot:check` cover execution. See [failure injection](reference-tests-parallel-safety-and-test-root-hygiene.md#failure-injection-uses-a-query-executor).
- **R3. Event waits.** Do not wait with `setTimeout`, `setInterval`, `setImmediate`, `node:timers/promises`, `pg_sleep`, `waitForCondition`, `pollUntil*`, `vi.waitFor`, `vi.waitUntil`, `expect.poll`, or the database clock. Wait on the returned promise, a queue event, pub/sub, `LISTEN/NOTIFY`, or an injected or fake clock. Do not add a test-only branch to production code. Web tests may use Testing Library `findBy*`.
- **R4. Smallest fixture.** Cross each boundary with the fewest rows. Lower a DynamicConfig work limit with `overrideDynamicConfigFieldsForTest`. Scale, plan, wall-time, heap, and pool checks belong in [explain-analyze](postgresql/explain-analyze/README.md). Unit tests do not assert `performance.now()` or `process.memoryUsage()`.
- **R5. Allowlisted network.** A real call may go only to `example.com`, `example.net`, `example.org`, or loopback. The Vitest setup rejects other hosts. Fix a flake in production code, not with a skip.
- **R6. No skips.** No `.skip`, `.skipIf`, `.runIf`, `.only`, `.todo`, `.fixme`, or `context.skip()`. A credentialed test runs only in the credentialed workflow. A missing credential fails the test. Backend credentialed Vitest suites are non-gating smoke checks; see [live-provider smoke checks](#live-provider-smoke-checks).
- **R7. Timeouts.** Vitest and Playwright tests have a maximum deadline. Vitest per-test, hook, and describe overrides stay at or below that cap; Playwright cannot extend a test deadline. Fix a slow test instead of raising the timeout.
- **R8. No repository-wide tooling.** A unit test does not generate a schema snapshot, run a full migrate, lint or analyze the repository, spawn Vitest, or run a build. Those jobs have their own workflows. A tool's own tests use a small fixture.
- **R9. Injected clock.** A result must not depend on the real time of day, date, time zone, or day boundary. Pass a clock or `now`, or use fake timers. `Date.now()` used only to build a unique id is fine. `crypto.randomUUID()` is preferred.
- **R10. Behavior.** Test the behavior this repository owns, not a dependency's internals. See [test value](reference-tests-value-and-reduction.md).
- **R11. Absent results.** Before asserting that nothing happened, wait for the event that would have caused it. Process a sibling item in the same pass, then assert that the target was skipped.
- **R12. Deleting a test.** Delete a redundant test when line and branch coverage of the production file it exercises does not drop. Compare `pnpm exec vitest run --project <project> <test files> --coverage --coverage.include=<production file>` with and without the test, and put both numbers in the pull request. If coverage would drop, rewrite the test. See [test value](reference-tests-value-and-reduction.md).
- **R13. API contracts.** A new option on an internal service function is fine. A new or changed REST route, query parameter, or MCP tool parameter needs [client parity](../requirements/CLIENT-PARITY-MATRIX.md) and an owner decision.

Dirty-database proof for a changed database test: run the file twice on the same database without resetting it, then run two processes on that file at the same time.

## Which helper for which boundary

Helper APIs are readable in `backend/test-helpers/` (and `@voucha/test-helpers`); this is only the map. Queue assertions read the enqueued job by returned id (`readEnqueuedJob`, `readAllQueueJobs`), not the `waiting` state. Provider wire behavior is replayed with `createProviderReplay()`. Write failures are injected with `rejectQuery`. Rows another fork can touch are owned through `acquireTestAiUsageDateReservation`, `acquireTestHostnameSweepBucket`, `createTestRetentionWindow`, `withDominantPostFixtures`, `safeUsername`, and `createUniqueTestEmail`. Route tests use `createRequest()`, which assigns a unique forwarded IP per agent so rate-limit buckets stay isolated; a test that asserts shared rate limiting overrides `x-forwarded-for` itself. Details and reasons are in [parallel safety](reference-tests-parallel-safety-and-test-root-hygiene.md).

## Live-provider smoke checks

A backend Vitest test that calls a live provider (`*.openai*`, `*.anthropic*`, `*.openrouter`, `*.stripe`, `*.bedrock`, or `*.s3` in the file name) never gates CI. A provider outage, a flex-capacity failure, or an ambiguous billed error is not by itself a regression in this repository. A test does not retry, skip, or lengthen its timeout for it (R3, R6, R7), and no rule reruns a provider failure, because a rerun of a non-gating job gains nothing (the shared runner-shutdown and Playwright-setup rules can still rerun these jobs after an infrastructure failure). The `test-backend-credentialed` job still runs on pull requests, merge groups, and the nightly run. It is informational: the required `backend` gate does not wait on it, it publishes no coverage, and a failure leaves the job red with a warning annotation and a job summary, and the Nightly run red. `.pr-shepherdrc.yml` ignores the check so `pr-shepherd` does not block a merge on it. Retained JUnit reports let the timeout audit inspect individual live cases; a missing report or a provider batch that did not run cannot establish a shorter budget. The credentialed Playwright job (`test-playwright-credentialed`) is informational in the same way; it has no recorded-response replacement yet, so the browser flows that only it covers are not gated. See [CI](ci.md#live-provider-smoke-checks).

Gating coverage of the request we build and the response we handle comes from recorded provider responses:

- Record or hand-write the wire response as a `curl -si`-style file under `backend/test-helpers/provider-fixtures/<provider>/`, replay it through the provider SDK's own transport hook with `createProviderReplay()`, and assert our behavior: the request (model, parameters, headers we set), how we parse the result, and the usage and failure policy. Do not assert an upstream error message, the URL the SDK builds, or an SDK call count.
- Name the fixture test so it does not match a live-provider glob (for example `create-response.replay.no-data.mock.test.mts`), or the credentialed project collects it and the unit projects drop it.
- Keep the live file as a thin smoke check and say so in its header. Do not delete it: a live call is the only proof that the provider contract has not drifted.
- Model-quality golden and eval files (for example `*.golden.*.test.mts`) are smoke and eval checks, not fixture candidates.

## Contents

- [Test Suite Rules](#test-suite-rules)
- <a id="local-web-validation-recovery"></a>[Local Web Validation Recovery](reference-tests-local-web-validation-recovery.md)
- <a id="linters-and-static-analysis"></a>[Linters and Static Analysis](reference-tests-linters-and-static-analysis.md)
- <a id="vitest-projects"></a>[Vitest Projects](reference-tests-vitest-projects.md)
- <a id="parallel-safety-and-test-root-hygiene"></a>[Parallel-Safety and Test-Root Hygiene](reference-tests-parallel-safety-and-test-root-hygiene.md)
- <a id="test-value-and-safe-reduction"></a>[Test Value and Safe Reduction](reference-tests-value-and-reduction.md)
- <a id="vitest-mock-typing"></a>[Vitest Mock Typing](reference-tests-vitest-mock-typing.md)
- <a id="storybook-a11y-exceptions"></a>[Storybook A11y Exceptions](reference-tests-storybook-a11y-exceptions.md)
- <a id="e2e-and-visual"></a>[E2E and Visual](reference-tests-e2e-and-visual.md)
- <a id="translation-catalog-and-locale-checks"></a>[Translation Catalog and Locale Checks](reference-tests-translation-catalog-and-locale-checks.md)
- <a id="schema-checks"></a>[Schema Checks](reference-tests-schema-checks.md)
