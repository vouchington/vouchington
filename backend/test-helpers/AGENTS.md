# Backend test helpers

- Load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md); helper APIs, waits, and fixtures belong in this directory, with rules in [tests.md](../../docs/development/tests.md).
- Tests share a dirty parallel database: randomize ownership-scoped fixtures and never clean shared rows.
- Never run DDL (`CREATE`/`DROP`/`ALTER`, `LOCK TABLE`) against the shared test database. Inject failures with a throwing [`QueryExecutor`](injected-failures.mts) passed through the real transaction; see [failure injection](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#failure-injection-uses-a-query-executor).
- Tests do not import raw PostgreSQL helpers or `sql-template-strings`; expose focused setup/assertions here without re-exporting SQL methods.
- Keep helpers under this first-layer root without feature-local directories/forwarders. Entity helpers use `entities/*.mts`; generic helpers stay with narrow package owners.
- Bound a GlideMQ `completed`, `failed`, or drained wait with `waitForRealGlideEvent`. The worker
  event still resolves the wait; the default deadline rejects a stall by name before the project
  test budget. A caller that must outlast a longer clock passes its own deadline, still under that
  test's timeout. A bare `worker.once` on those events hangs the shard until the runner kills it.
  Bare `delay-changed`, `added`, and `retrying` QueueEvents waits, and SQS `message-deleted` /
  `poll-error` waits, still have no named deadline.
- Owned post-election and vote-route admission on the default project budget uses
  `admissionObservationDeadline`, the same bound as `waitForRealGlideEvent`, so a stalled owned
  job is named before that budget. User-vouch observation keeps a longer deadline because its
  callers set a longer per-test timeout and the observation outlasts the default budget. The
  entity-listener lifetime outlasts the default project budget: teardown abort names cleanup
  after the test finishes, and a stall during the body surfaces as the runner timeout.
- Close resources and remove unexpected `console.*` output before handoff.
- Follow the [test suite rules](../../docs/development/tests.md#test-suite-rules).
