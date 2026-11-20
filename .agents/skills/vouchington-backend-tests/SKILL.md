---
name: vouchington-backend-tests
description: Write or fix a Vouchington backend Vitest test or fixture - shared dirty database, failure injection, GlideMQ and emitter waits. Use before adding or changing a test anywhere under backend/.
---

# Vouchington backend tests

- Tests share one dirty, parallel database. Randomize ownership-scoped fixtures and never clean
  shared rows.
- Inject database failures with a throwing [`QueryExecutor`](../../../backend/test-helpers/injected-failures.mts)
  passed through the real transaction, never DDL or locks.
- Take setup and assertions from `backend/test-helpers/`; tests never import raw PostgreSQL helpers.
- Bound a GlideMQ `completed`, `failed`, or drained wait with `waitForRealGlideEvent`. The worker
  event still resolves the wait; the default deadline rejects a stall by name before the project
  test budget. A caller that must outlast a longer clock passes its own deadline, still under that
  test's timeout. A bare `worker.once` on those events hangs the shard until the runner kills it.
- Bound a QueueEvents (`delay-changed`, `added`, `retrying`) or SQS consumer (`message-deleted`,
  `poll-error`) wait with `waitForEmitterEvent`, which shares that deadline and rejects naming the
  event. Create the wait before the action that emits the event.
- Tests that import live `Worker` singletons close them before completion: `backend-data-stores`
  runs with `isolate: false`.
