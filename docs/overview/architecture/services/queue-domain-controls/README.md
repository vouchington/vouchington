# Queue Domain Controls Service

Source entrypoint: [backend/services/queue-domain-controls/README.md](../../../../../backend/services/queue-domain-controls/README.md)

Operator pause state for the domains of the [background queue](../../queues/background/README.md),
stored in `queue_domain_controls` (one optional row per domain: `paused_at`, `paused_by_user_id`, `reason`).
A domain with no row, or a null `paused_at`, runs. Pause history is in `moderator_actions`
(`queue_pause` and `queue_resume`, with the domain in `metadata`).

## Key exports

- `pauseQueueDomain(domain, { userId, reason })` - pauses; a repeat keeps the first pause's time,
  user, and reason.
- `resumeQueueDomain(domain)` - clears the pause columns and keeps the row.
- `getQueueDomainControl(domain)` / `listQueueDomainControls()` - reads, with a missing row reported
  as running.
- `isQueueDomainPaused(domain)` - the worker's cached read.
- `watchQueueDomainControls(onInvalidated?)` - subscribes a process to pause changes.
- `invalidateQueueDomainPause(domain)` - drops one cached entry.

## Caching

A worker reads PostgreSQL at most once per `pause_cache_ms` per domain; concurrent jobs share one
read. Every pause or resume publishes the domain on a Valkey channel
([`@data-stores/valkey-pubsub`](../../backend/data-stores/valkey-pubsub/README.md)), and each worker
clears that entry, so the effect usually lands before the cache lifetime ends. Pub/sub is
best-effort: PostgreSQL stays the source of truth and the cache lifetime bounds a missed message.
A change racing an in-flight read wins over that read's older answer.

## Related

- Operator surfaces: [queue monitoring](../queue-monitoring/README.md) and the
  [MQ API](../../../../requirements/api/v1/mq/reference-domain-routes.md).
