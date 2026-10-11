# Bluesky Follow Propagation Worker

Source entrypoint: [backend/workers/bluesky-follow-propagation/README.md](../../../../../../backend/workers/bluesky-follow-propagation/README.md)

Worker package for reconciling Voucha follow relationships onto linked Bluesky accounts.

- `createBlueskyFollowPropagationWorker` - creates the worker for the `bluesky-follow-propagation`
  queue. It first sets the queue's global concurrency to 1 (`queue.setGlobalConcurrency(1)`, as
  `bedrock-embeddings-batch-creation` does), then starts the worker at concurrency 1
  (`getWorkerConcurrency('blueskyFollowPropagation', { baseline: 1, ignoreScale: true })`). Worker
  concurrency only bounds one process, so the queue-wide cap is what stops two replicas running
  jobs at once. Concurrent jobs touching the same Bluesky account can race a refresh-token rotation
  and permanently invalidate that account's OAuth session — see
  [`@modules/bluesky-oauth/README.md`](../../../backend/modules/bluesky-oauth/README.md)'s "No distributed
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

The PDS calls in `@services/bluesky-follows/agent.mts` classify their failures for the queue. A 429
requeues the job after the PDS's `ratelimit-reset` (epoch seconds) or a `Retry-After`, clamped to 1
second through 15 minutes, without consuming an attempt. The follower chooses the PDS, so
`processBlueskyFollowPropagationJob` runs every job through `boundRateLimitDeferral`: once a job is
24 hours old, the next 429 spends the queue's attempts instead of requeuing. Any other 4xx except 408 ends the job as
unrecoverable, because retrying a rejected follow cannot succeed (the idempotent reconcile and its
backfill re-derive the work later). A network failure or 5xx keeps the queue's three attempts.

## Related

- Queue: [../../queues/bluesky-follow-propagation/README.md](../../bluesky-follow-propagation/README.md)
- Service: [../../services/bluesky-follows/README.md](../../../services/bluesky-follows/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
