# Entity Listener Reconciliation Service

Source entrypoint: [backend/services/entity-listener-reconciliation/README.md](../../../../../backend/services/entity-listener-reconciliation/README.md)

Owns the PostgreSQL checkpoint window and bounded cursor scan used to recover entity-listener work
after queue loss. The service scans current active users, topics, completed images, and URLs,
then merges the append-only, UUIDv7-indexed post revision stream so create/update/delete payload
semantics survive queue loss. User candidates also carry `createdInWindow`, true when the UUIDv7 id
is at or after the window start, so the worker replays creation effects only for new accounts (see
[durable recovery](../../queues/entity-listeners/README.md#durable-recovery)). The entity-listener
worker runs each candidate's idempotent processor and advances the checkpoint only after all of
them succeed.

The default hourly cadence, logical job IDs, scheduler, and admin trigger are documented in the
[entity-listener queue](../../queues/entity-listeners/README.md). The durable recovery contract is
tracked in [job replayability](../../../../requirements/platform/JOB-REPLAYABILITY.md).

## Files

- `reconciliation.mts` derives overlap/lag-safe windows, streams candidate batches, and advances the
  monotonic checkpoint.
- `reconciliation.test.mts` exercises the real PostgreSQL checkpoint and cursor boundary.

## Transaction-scoped checkpoint diagnostics

Window reads and checkpoint advancement accept the normal PostgreSQL `QueryOptions` so callers
can join an existing transaction. Default worker calls keep their writer-backed, monotonic
checkpoint behavior.

The shared-database checkpoint test reserves the singleton row on one real transaction executor,
seeding an absent row only inside that transaction. It runs both service operations, rolls back
before releasing the reservation, and verifies that the durable checkpoint and update timestamp
match their original state. Handler and distinct cleanup failures remain visible. The reservation
does not reset committed recovery state or change the entity-listener worker's replay contract.
