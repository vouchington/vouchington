# Test and document

[Back to Backend Queue Authoring Checklist](backend-queues.md#test-and-document)

1. Add service-level integration tests first. Use real PostgreSQL, Valkey, GlideMQ, and existing test
   helpers; never mock internal queues, workers, services, or data stores.
2. Assert durable state, enqueued jobs, dedupe/idempotency behavior, retry classification, and awaited
   fan-out failure behavior that the change affects.
3. Update the domain queue/worker README and the
   [top-level queue inventory](../../backend/queues/README.md). Update the replayability matrix,
   scheduled/backfill registries, and worker-placement policy when applicable.
4. Run the exact owning Vitest project/file, queue registry and placement tests,
   `pnpm run no-mistakes`, and the relevant backend suite from
   [`docs/development/tests.md`](../development/tests.md).
