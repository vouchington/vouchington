# Bluesky Follow Propagation Worker

Worker package for reconciling Voucha follow relationships onto linked Bluesky accounts.

- `blueskyFollowPropagationWorker` - worker instance for the `bluesky-follow-propagation` queue.
  Runs at concurrency 1 (`getWorkerConcurrency('blueskyFollowPropagation', { baseline: 1, ignoreScale: true })`)
  because concurrent jobs touching the same Bluesky account can race a refresh-token rotation and
  permanently invalidate that account's OAuth session — see
  [`@modules/bluesky-oauth/README.md`](../../modules/bluesky-oauth/README.md)'s "No distributed
  lock" section.
- `reconcileFollow` - calls `reconcileBlueskyFollow` (`@services/bluesky-follows`) to bring one
  follower/followee pair's Bluesky follow state in sync with `relation__user__follow__user`.
- `backfillBlueskyFollowPropagation` - streams reconcile candidates from
  `@services/bluesky-follows/backfill.mts` and bulk-enqueues `reconcileFollow` jobs.
- `disconnectRequested` - performs remote/local cleanup for one exact durable unlink intent;
  retries cannot affect a newer relink. Terminal queue state is removed because the PostgreSQL
  marker is authoritative and the backfill must be able to recreate the same stable job id.
- `backfillBlueskyDisconnectRequests` - cursor-streams all pending unlink intents and bulk-enqueues
  exact-generation disconnect jobs.

## Related

- Queue: [../../queues/bluesky-follow-propagation/README.md](../../queues/bluesky-follow-propagation/README.md)
- Service: [../../services/bluesky-follows/README.md](../../services/bluesky-follows/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
