# ActivityPub inbox worker

This I/O worker verifies durable inbound ActivityPub envelopes, rechecks the instance allowlist,
refreshes the remote actor key, applies sender rate limiting once, and dispatches through
`@services/ap-inbox-activities`. Fencing tokens make stale queue jobs no-ops. Successful signature
verification atomically checkpoints `verified_at` with `remote_actor_id`; retries load that active
actor by ID from the PostgreSQL primary and do not refetch or reverify the retained envelope. A
soft-deleted actor is a terminal protocol rejection without network access.

The sender limiter uses the durable delivery UUID as its Valkey sorted-set member and atomically
preserves whether that delivery was allowed or limited within the active window. Retries reuse the
original decision without charging again or extending its score; after the window expires, a
deferred delivery can make one fresh admission attempt. Valkey loss retains the limiter's existing
fail-open policy.

Final protocol rejections delete the untrusted raw envelope and become unrecoverable jobs. Final
operational failures retain the PostgreSQL row for the explicit admin backfill. Recovery gives
unstarted deliveries a five-minute lease from their latest enqueue; deferred work gets the same
five-minute recovery lease from its due time, while active processing leases recover after thirty
minutes.

Storage is independently bounded from queue retry. Unverified envelopes expire one hour after
receipt and are rejected at 10,000 rows or 256 MiB of exact `raw_body` bytes. Verified operational
failures expire seven days after the immutable first failure, including across manual rearm.
`cleanupExpiredDeliveries` runs every five minutes, deletes unverified rows before verified
failures, skips active leases younger than thirty minutes, and commits at most twenty 500-row
`FOR UPDATE SKIP LOCKED` batches. It runs ahead of delivery and recovery work so a saturated queue
cannot delay reclaiming expired capacity. Each batch and successful-run storage snapshot is
emitted as structured JSON for CloudWatch metric filters and alarms.

The dedup reservation, core Follow, Undo(Follow), Like, or Undo(Like) database effect, and fenced
envelope completion commit together. Duplicate Follow recovery performs its guarded relation
replay in that same transaction; only the Accept enqueue is post-commit. A stale completion fence
therefore rolls back the core effect, while an identical committed Follow retry can recover a
missing relation and resend the Accept without defeating a winning Undo. See
[the canonical lifecycle](../../services/ap-inbox-activities/README.md#durable-delivery-lifecycle)
and [the queue replayability matrix](../../../docs/requirements/platform/JOB-REPLAYABILITY.md).
