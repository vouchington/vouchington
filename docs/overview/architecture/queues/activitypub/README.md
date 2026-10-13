# ActivityPub queue

Source entrypoint: [backend/queues/activitypub](../../../../../backend/queues/activitypub/README.md).

The ranked `activitypub` queue carries outbound `distributeActivity` and `deliverActivity` plus inbound `processDelivery`, `recoverDeliveries`, `rearmFailedDeliveries`, and `cleanupExpiredDeliveries`. Outbound distribution keeps an activity-specific ordering key at concurrency one. Inbox processing keeps durable lease-token job IDs; recovery and cleanup retain priority 100, while ordinary delivery uses priority 10. Scheduler IDs and deduplication IDs keep their existing stable identities.

The [shared worker](../workers/activitypub/README.md) handles both directions. A burst in either direction can occupy its ten slots and delay the other; monitor queue age and delivery latency before changing concurrency.
