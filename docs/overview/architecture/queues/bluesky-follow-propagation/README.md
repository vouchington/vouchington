# Bluesky Follow Propagation Queue

Source entrypoint: [backend/queues/bluesky-follow-propagation/README.md](../../../../../backend/queues/bluesky-follow-propagation/README.md)

Drives `app.bsky.graph.follow` records on Bluesky to match Voucha's local follow state
(`relation__user__follow__user`), for Phase D3. See
[docs/overview/architecture/fediverse-federation.md](../../fediverse-federation.md)'s
Phase D section for the reconcile design and
[docs/overview/architecture/services/bluesky-follows/README.md](../../services/bluesky-follows/README.md) for the
function-level detail `reconcileFollow` calls into.

## Queue

- Domain `bluesky-follow-propagation` of the shared [`background` queue](../background/README.md);
  job names are `bluesky-follow-propagation.<name>`. The domain is one domain-wide group of 1: every
  job shares the ordering key `bluesky-follow-propagation` at concurrency 1, so two replicas never
  run Bluesky-token jobs at once (worker concurrency only bounds one process). The group replaces
  the old queue-wide `setGlobalConcurrency(1)`, and adds a worker baseline of one.
  `WORKER_CONCURRENCY_BLUESKY_FOLLOW_PROPAGATION` no longer exists.

## Jobs

- `bluesky-follow-propagation.reconcileFollow`
  - Data: `{ followerUserId, followeeUserId }`.
  - Calls `reconcileBlueskyFollow` — re-derives desired state from `relation__user__follow__user`
    and compares it against the `bluesky_follow_records` receipt on every run, rather than
    branching on a Follow/UndoFollow activity type.
  - `debounce` deduplication (id `reconcile_${followerUserId}__${followeeUserId}`, 5s TTL):
    collapses a rapid follow/unfollow toggle for the same pair into a single job that reads final
    state once the pair settles, matching `notification-reconcile.mts`'s established
    reconcile-shaped-job convention.
- `bluesky-follow-propagation.backfillBlueskyFollowPropagation`
  - Enqueues `reconcileFollow` jobs for one page of reconcile candidates (`backfill_batch_size`,
    keyset on `(follower_user_id, followee_user_id)`, from `@services/bluesky-follows`'s
    `listBlueskyFollowPropagationCandidatePage`) and, when the page is full, enqueues a
    continuation job at priority `100` carrying the last pair; its job id is that cursor. Safe to
    run at any time — every candidate is reconciled idempotently, so over-inclusion is harmless.
    The first page has `throttle` deduplication, 1h TTL, priority `100`.
- `bluesky-follow-propagation.disconnectRequested`
  - Data: `{ userId, blueskyDid, linkAuthorizationId }` for one exact credential generation.
  - Runs the idempotent disconnect cleanup after the API has persisted
    `bluesky_linked_accounts.disconnect_requested_at`; retries never re-read a newer generation.
  - Uses the same logical id for `jobId` and simple deduplication. Default priority `10`.
  - Removes both completed and terminally failed queue state. PostgreSQL owns the durable intent,
    so the backfill can recreate the same stable job id after retries are exhausted instead of a
    retained GlideMQ job hash blocking recovery.
- `bluesky-follow-propagation.backfillBlueskyDisconnectRequests`
  - Enqueues `disconnectRequested` for one page of linked-account rows with durable disconnect
    intent (`backfill_batch_size`, keyset on `link_authorization_id`) and, when the page is full,
    continues from the last authorization id at priority `100`. This is the recovery path for
    enqueue loss or a Valkey reset. The first page has `throttle` deduplication, 1h TTL.

## Related

- Service: [../../services/bluesky-follows](../../../../../backend/services/bluesky-follows)
- Worker: [../../workers/bluesky-follow-propagation](../../../../../backend/workers/bluesky-follow-propagation)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

- `enqueueReconcileBlueskyFollow`
