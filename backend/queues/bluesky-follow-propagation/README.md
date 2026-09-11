# Bluesky Follow Propagation Queue

Drives `app.bsky.graph.follow` records on Bluesky to match Voucha's local follow state
(`relation__user__follow__user`), for Phase D3. See
[docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md)'s
Phase D section for the reconcile design and
[backend/services/bluesky-follows/README.md](../../services/bluesky-follows/README.md) for the
function-level detail `reconcileFollow` calls into.

## Queue

- Queue name: `bluesky-follow-propagation`

## Jobs

- `reconcileFollow`
  - Data: `{ followerUserId, followeeUserId }`.
  - Calls `reconcileBlueskyFollow` — re-derives desired state from `relation__user__follow__user`
    and compares it against the `bluesky_follow_records` receipt on every run, rather than
    branching on a Follow/UndoFollow activity type.
  - `debounce` deduplication (id `reconcile_${followerUserId}__${followeeUserId}`, 5s TTL):
    collapses a rapid follow/unfollow toggle for the same pair into a single job that reads final
    state once the pair settles, matching `notification-reconcile.mts`'s established
    reconcile-shaped-job convention.
- `backfillBlueskyFollowPropagation`
  - Streams reconcile candidates from PostgreSQL (`@services/bluesky-follows`'s
    `streamBlueskyFollowPropagationCandidateBatches`) and bulk-enqueues `reconcileFollow` jobs.
    Safe to run at any time — every candidate is reconciled idempotently, so over-inclusion is
    harmless. `throttle` deduplication, 1h TTL, priority `100`.
- `disconnectRequested`
  - Data: `{ userId, blueskyDid, linkAuthorizationId }` for one exact credential generation.
  - Runs the idempotent disconnect cleanup after the API has persisted
    `bluesky_linked_accounts.disconnect_requested_at`; retries never re-read a newer generation.
  - Uses the same logical id for `jobId` and simple deduplication. Default priority `10`.
  - Removes both completed and terminally failed queue state. PostgreSQL owns the durable intent,
    so the backfill can recreate the same stable job id after retries are exhausted instead of a
    retained GlideMQ job hash blocking recovery.
- `backfillBlueskyDisconnectRequests`
  - Streams linked-account rows with durable disconnect intent and bulk-enqueues
    `disconnectRequested`. This is the recovery path for enqueue loss or a Valkey reset.
    `throttle` deduplication, 1h TTL, priority `100`.

## Related

- Service: [../../services/bluesky-follows](../../services/bluesky-follows)
- Worker: [../../workers/bluesky-follow-propagation](../../workers/bluesky-follow-propagation)
