# Entity Listener Reconciliation Service

Owns the PostgreSQL checkpoint window and bounded cursor scan used to recover entity-listener work
after queue loss. The service scans current active users, topics, completed images, and URLs,
then merges the append-only, UUIDv7-indexed post revision stream so create/update/delete payload
semantics survive queue loss. The entity-listener worker runs each candidate's idempotent processor
and advances the checkpoint only after all of them succeed.

The default hourly cadence, logical job IDs, scheduler, and admin trigger are documented in the
[entity-listener queue](../../queues/entity-listeners/README.md). The durable recovery contract is
tracked in [job replayability](../../../docs/requirements/platform/JOB-REPLAYABILITY.md).

## Files

- `reconciliation.mts` derives overlap/lag-safe windows, streams candidate batches, and advances the
  monotonic checkpoint.
- `reconciliation.test.mts` exercises the real PostgreSQL checkpoint and cursor boundary.
