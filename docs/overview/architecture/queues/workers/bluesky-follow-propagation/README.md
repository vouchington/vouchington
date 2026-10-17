# Bluesky Follow Propagation Worker

Source entrypoint: [backend/workers/bluesky-follow-propagation/README.md](../../../../../../backend/workers/bluesky-follow-propagation/README.md)

Worker package for reconciling Voucha follow relationships onto linked Bluesky accounts.

- `blueskyFollowPropagationHandlers` - the domain's handlers for the shared
  [background worker](../background/README.md); there is no per-queue `Worker`. Every job shares
  the domain-wide group of 1, which is what stops two replicas running jobs at once (worker
  concurrency only bounds one process). Concurrent jobs touching the same Bluesky account can race a
  refresh-token rotation and permanently invalidate that account's OAuth session — see
  [`@modules/bluesky-oauth/README.md`](../../../backend/modules/bluesky-oauth/README.md)'s "No distributed
  lock" section. An operator pause defers the whole group.
- `reconcileFollow` - calls `reconcileBlueskyFollow` (`@services/bluesky-follows`) to bring one
  follower/followee pair's Bluesky follow state in sync with `relation__user__follow__user`.
- `backfillBlueskyFollowPropagation` - enqueues `reconcileFollow` jobs for one page of candidates
  from `@services/bluesky-follows/backfill.mts` and continues from the page's last pair.
- `disconnectRequested` - performs remote/local cleanup for one exact durable unlink intent;
  retries cannot affect a newer relink. Terminal queue state is removed because the PostgreSQL
  marker is authoritative and the backfill must be able to recreate the same stable job id.
- `backfillBlueskyDisconnectRequests` - enqueues exact-generation disconnect jobs for one page of
  pending unlink intents and continues from the page's last authorization id.

The PDS calls in `@services/bluesky-follows/agent.mts` classify their failures for the queue. A 429
requeues the job after the PDS's `ratelimit-reset` (epoch seconds) or a `Retry-After`, clamped to 1
second through 15 minutes, without consuming an attempt. The follower chooses the PDS, so
the handlers run every job through `boundRateLimitDeferral`: once a job is
24 hours old, the next 429 spends the queue's attempts instead of requeuing. Any other 4xx except 408 ends the job as
unrecoverable, because retrying a rejected follow cannot succeed (the idempotent reconcile and its
backfill re-derive the work later). A network failure or 5xx keeps the queue's three attempts.

## Related

- Queue: [../../queues/bluesky-follow-propagation/README.md](../../bluesky-follow-propagation/README.md)
- Service: [../../services/bluesky-follows/README.md](../../../services/bluesky-follows/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
